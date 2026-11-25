import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { failureOf } from '../auth/failure.js';
import type { Env } from '../config/env.js';
import type { OwnerAlertChannel, Prisma } from '../generated/prisma/client.js';
import { formatUsd } from '../mail/format.js';
import { escapeHtml } from '../mail/html.js';
import { MAILER, type Mailer } from '../mail/mailer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { COUNTED_CURRENCY } from './currency.js';
import type { DonationFacts } from './donation-facts.js';

interface Alert {
  subject: string;
  text: string;
}

type SendAlert = (alert: Alert) => Promise<void>;
export type FundedCity = {
  name: string;
  raisedCents: number;
  goalCents: number;
};

const POLL_MS = 5_000;
const CLAIM_MS = 60_000;
const FIRST_RETRY_MS = 30_000;
const MAX_RETRY_MS = 60 * 60_000;
const BATCH_SIZE = 10;

function paymentAmount({ amountCents, currency }: DonationFacts): string {
  if (currency === COUNTED_CURRENCY) return formatUsd(amountCents, 'en-US');
  if (!/^[a-z]{3}$/.test(currency)) return `${amountCents} payment units`;
  const format = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  });
  // Stripe charges ISK and UGX using two decimal places for backward compatibility.
  const digits =
    currency === 'isk' || currency === 'ugx'
      ? 2
      : (format.resolvedOptions().maximumFractionDigits ?? 2);
  return format.format(amountCents / 10 ** digits);
}

async function sendTelegram(
  token: string,
  chatId: string,
  { subject, text }: Alert,
): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${subject}\n\n${text}`,
        link_preview_options: { is_disabled: true },
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    },
  );
  const result = (await response.json()) as { ok?: boolean } | null;
  if (!response.ok || result?.ok !== true)
    throw Object.assign(new Error('Telegram refused the alert'), {
      responseCode: response.status,
    });
}

/** Enqueues owner alerts atomically with the payment and delivers each channel independently. */
@Injectable()
export class OwnerAlertsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(OwnerAlertsService.name);
  private readonly senders = new Map<OwnerAlertChannel, SendAlert>();
  private readonly active = new Map<OwnerAlertChannel, Promise<void>>();
  private readonly site: string;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
    @Inject(MAILER) mailer: Mailer,
  ) {
    this.site = config.get('SITE_URL', { infer: true });
    const email = config.get('OWNER_ALERT_EMAIL', { infer: true });
    const token = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
    const chatId = config.get('TELEGRAM_CHAT_ID', { infer: true });

    if (email)
      this.senders.set('EMAIL', ({ subject, text }) =>
        mailer.send({
          to: email,
          subject,
          text,
          html: `<p>${escapeHtml(text).replaceAll('\n', '<br>')}</p>`,
        }),
      );
    if (token && chatId)
      this.senders.set('TELEGRAM', (alert) =>
        sendTelegram(token, chatId, alert),
      );
    else if (token || chatId)
      this.logger.warn(
        'Telegram alerts need both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID',
      );
  }

  async enqueue(
    tx: Prisma.TransactionClient,
    payment: DonationFacts,
    cityName: string | null,
    funded: FundedCity | null,
  ): Promise<void> {
    if (!this.senders.size) return;

    const alerts: Alert[] = [
      {
        subject: 'Tiny Worlds — Payment received',
        text: `${paymentAmount(payment)} received for ${cityName ?? 'Tiny Worlds'}.\n\n${this.site}/admin/#admin-donations`,
      },
    ];
    if (funded)
      alerts.push({
        subject: `Tiny Worlds — Ready to build: ${funded.name}`,
        text: `${funded.name} is funded and ready to build.\nRaised ${formatUsd(funded.raisedCents, 'en-US')} toward a ${formatUsd(funded.goalCents, 'en-US')} goal.\n\n${this.site}/#ranking`,
      });

    await tx.ownerAlert.createMany({
      data: [...this.senders.keys()].flatMap((channel) =>
        alerts.map((alert) => ({ channel, ...alert })),
      ),
    });
  }

  onApplicationBootstrap(): void {
    if (!this.senders.size) return;
    this.timer = setInterval(() => {
      for (const [channel, send] of this.senders) {
        if (this.active.has(channel)) continue;
        const work = this.deliverChannel(channel, send)
          .catch((error: unknown) =>
            this.logger.error(
              `Could not process ${channel} owner alerts (${failureOf(error)})`,
            ),
          )
          .finally(() => this.active.delete(channel));
        this.active.set(channel, work);
      }
    }, POLL_MS).unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    this.timer = undefined;
    await Promise.all(this.active.values());
  }

  private async deliverChannel(
    channel: OwnerAlertChannel,
    send: SendAlert,
  ): Promise<void> {
    for (let i = 0; i < BATCH_SIZE && this.timer; i++) {
      const now = new Date();
      const due = { channel, availableAt: { lte: now } };
      const alert = await this.prisma.ownerAlert.findFirst({
        where: due,
        orderBy: [{ availableAt: 'asc' }, { id: 'asc' }],
      });
      if (!alert || !this.timer) return;

      // Only one worker claims this attempt. Another can reclaim it after a crash or timeout.
      const claim = await this.prisma.ownerAlert.updateMany({
        where: { ...due, id: alert.id, attempts: alert.attempts },
        data: {
          availableAt: new Date(now.getTime() + CLAIM_MS),
          attempts: { increment: 1 },
        },
      });
      if (!claim.count) continue;

      const attempt = { id: alert.id, attempts: alert.attempts + 1 };
      try {
        await send(alert);
      } catch (error) {
        const delay = Math.min(
          MAX_RETRY_MS,
          FIRST_RETRY_MS * 2 ** alert.attempts,
        );
        this.logger.warn(
          `Owner alert ${alert.id} via ${channel} failed (${failureOf(error)}). Retrying.`,
        );
        await this.prisma.ownerAlert.updateMany({
          where: attempt,
          data: { availableAt: new Date(Date.now() + delay) },
        });
        continue;
      }
      await this.prisma.ownerAlert.deleteMany({ where: attempt });
    }
  }
}
