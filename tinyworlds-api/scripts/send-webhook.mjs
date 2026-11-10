#!/usr/bin/env node
// Posts a signed "checkout.session.completed" to a local API, the way Stripe would: a way to
// try the webhook without Stripe. Nothing here talks to Stripe; the signature is made locally
// with STRIPE_WEBHOOK_SECRET from .env (a placeholder is fine, as long as the API has the same).
//
//   npm run webhook:send -- --amount 40 --city "São Paulo"
//   npm run webhook:send -- --amount 5                       # no city
//   npm run webhook:send -- --amount 60 --city "sao paulo" --id cs_test_again   # fixed session id: replay it
//   npm run webhook:send -- --amount 15 --city Lisboa --link                    # shaped like a payment link's session
//
// Options: --amount <dollars> --city <text> --id <session id> --currency <usd> --world <tinynyc>
//          --locale <en-US|pt-BR|es-ES> --status <paid|unpaid> --app <tinyworlds> --link --url <endpoint>
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { config } from 'dotenv';
import Stripe from 'stripe';

config({ path: '.env', quiet: true });

const { values } = parseArgs({
  options: {
    amount: { type: 'string', default: '5' },
    city: { type: 'string' },
    id: { type: 'string' },
    currency: { type: 'string', default: 'usd' },
    world: { type: 'string', default: 'tinynyc' },
    locale: { type: 'string', default: 'en-US' },
    status: { type: 'string', default: 'paid' },
    app: { type: 'string', default: 'tinyworlds' },
    link: { type: 'boolean', default: false },
    url: { type: 'string' },
  },
});

const secret = process.env.STRIPE_WEBHOOK_SECRET;
if (!secret)
  throw new Error('STRIPE_WEBHOOK_SECRET is not set (see .env.example)');
const url =
  values.url ??
  `http://localhost:${process.env.PORT ?? 4000}/api/stripe/webhook`;
const id = values.id ?? `cs_test_${randomUUID().replaceAll('-', '')}`;

const session = {
  id,
  object: 'checkout.session',
  amount_total: Math.round(Number(values.amount) * 100),
  currency: values.currency,
  payment_status: values.status,
  payment_intent: `pi_test_${id.slice(-12)}`,
  // a payment link has no room for the city in its metadata: the donor types it into a field
  client_reference_id: values.link ? values.world : null,
  metadata: values.link
    ? { app: values.app, lang: values.locale.slice(0, 2) }
    : {
        app: values.app,
        world: values.world,
        locale: values.locale,
        ...(values.city ? { city: values.city } : {}),
      },
  custom_fields:
    values.link && values.city
      ? [
          {
            key: 'city',
            type: 'text',
            optional: true,
            text: { value: values.city },
          },
        ]
      : [],
};
const payload = JSON.stringify({
  id: `evt_${id}`,
  object: 'event',
  type: 'checkout.session.completed',
  data: { object: session },
});
const signature = new Stripe(
  'sk_test_example',
).webhooks.generateTestHeaderString({
  payload,
  secret,
});

const res = await fetch(url, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'stripe-signature': signature,
  },
  body: payload,
});
console.log(`${id}: ${res.status} ${await res.text()}`);
if (!res.ok) process.exitCode = 1;
