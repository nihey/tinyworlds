import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { WORLD_PATTERN } from '../donations/donation-facts.js';
import type { Locale } from '../donations/locales.js';
import { fitWithin, hashOfSprite, MAIL_BOX } from './sight-pictures.js';

/** A famous building as a mail shows it. */
export interface MailSight {
  world: string;
  id: string;
  name: string;
  /** The city the building is in, filled in by whoever knows it (the catalog reads worlds). */
  city?: string;
  text: string;
  mapUrl: string;
  picture: { src: string; width: number; height: number } | null;
}

interface SightFile {
  id: string;
  n: string;
  lon: number;
  lat: number;
  sprite?: { src: string; w: number; h: number };
}

const TEXT_MAX = 160;
const CACHE_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 5000;

/** An opening cut at a word to at most TEXT_MAX characters, then an ellipsis. */
export function cutText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= TEXT_MAX) return clean;
  const head = clean.slice(0, TEXT_MAX + 1);
  const space = head.lastIndexOf(' ');
  const cut = space > 0 ? head.slice(0, space) : head.slice(0, TEXT_MAX);
  return `${cut.replace(/[\s,;:.-]+$/, '')}…`;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * The buildings a mail can show, read from the site's own data files. Never throws: a file that
 * cannot be read is `null` (and asked again next time), and is logged with the world.
 */
@Injectable()
export class SightsCatalog {
  private readonly logger = new Logger(SightsCatalog.name);
  private readonly cache = new Map<
    string,
    { at: number; sights: MailSight[] }
  >();

  constructor(
    private readonly config: ConfigService<Env, true>,
    @Optional() private readonly fetcher: typeof fetch = fetch,
  ) {}

  private site(): string {
    return this.config.get('SITE_URL', { infer: true }).replace(/\/+$/, '');
  }

  /** A JSON file of a world: its data, null for a 404, and a throw for anything else. */
  private async read<T>(url: string): Promise<T | null> {
    const response = await this.fetcher(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`status ${response.status}`);
    return (await response.json()) as T;
  }

  async famous(world: string, locale: Locale): Promise<MailSight[] | null> {
    if (!WORLD_PATTERN.test(world)) return null;
    const key = `${world}/${locale}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.sights;
    try {
      const site = this.site();
      const base = `${site}/${world}/data`;
      const [quiz, sights, texts] = await Promise.all([
        this.read<{ questions: { id: string; level: number }[] }>(
          `${base}/quiz.${locale}.json`,
        ),
        this.read<{ sights: SightFile[] }>(`${base}/sights.json`),
        this.read<Record<string, { text?: string }>>(
          `${base}/sights.${locale}.json`,
        ),
      ]);
      if (!sights || !texts) throw new Error('sights files missing');
      const easiest = quiz
        ? new Set(quiz.questions.filter((q) => q.level === 1).map((q) => q.id))
        : null;
      const found: MailSight[] = [];
      for (const sight of sights.sights) {
        if (easiest && !easiest.has(sight.id)) continue;
        const text = texts[sight.id]?.text;
        const hash = sight.sprite ? hashOfSprite(sight.sprite.src) : null;
        if (!text || !sight.sprite || !hash) continue;
        found.push({
          world,
          id: sight.id,
          name: sight.n,
          text: cutText(text),
          mapUrl: `${site}/${world}/#${sight.lat.toFixed(5)},${sight.lon.toFixed(5)},1`,
          picture: {
            src: `${site}/api/sight-pictures/${world}/${hash}.png`,
            ...fitWithin(sight.sprite.w, sight.sprite.h, MAIL_BOX),
          },
        });
      }
      this.cache.set(key, { at: Date.now(), sights: found });
      return found;
    } catch (error) {
      this.logger.warn(
        `could not read ${world}'s buildings: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return null;
    }
  }

  /** One building from each of up to `count` distinct worlds, at random. */
  async pickAcross(
    worlds: string[],
    locale: Locale,
    count: number,
    random: () => number = Math.random,
  ): Promise<{ sights: MailSight[]; unread: string[] }> {
    const unread: string[] = [];
    const pools = new Map<string, MailSight[]>();
    const all = await Promise.all(
      worlds.map(
        async (world) => [world, await this.famous(world, locale)] as const,
      ),
    );
    for (const [world, sights] of all) {
      if (sights === null) unread.push(world);
      else if (sights.length > 0) pools.set(world, shuffled(sights, random));
    }
    const order = shuffled([...pools.keys()], random);
    const chosen: MailSight[] = [];
    for (const world of order) {
      if (chosen.length >= count) break;
      chosen.push(pools.get(world)![0]);
    }
    if (order.length < count) {
      for (let round = 1; chosen.length < count; round += 1) {
        let added = false;
        for (const world of order) {
          const next = pools.get(world)![round];
          if (next && chosen.length < count) {
            chosen.push(next);
            added = true;
          }
        }
        if (!added) break;
      }
    }
    return { sights: chosen, unread };
  }

  async pickIn(
    world: string,
    locale: Locale,
    count: number,
    random: () => number = Math.random,
  ): Promise<{ sights: MailSight[]; unread: boolean }> {
    const sights = await this.famous(world, locale);
    if (sights === null) return { sights: [], unread: true };
    return { sights: shuffled(sights, random).slice(0, count), unread: false };
  }
}
