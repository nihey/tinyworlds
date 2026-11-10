import type Stripe from 'stripe';
import type { Env } from '../config/env.js';

/** The interface languages a donor can arrive in. */
export const LOCALES = ['en-US', 'pt-BR', 'es-ES'] as const;
export type Locale = (typeof LOCALES)[number];

export const isLocale = (value: unknown): value is Locale =>
  LOCALES.includes(value as Locale);

interface LocaleFacts {
  /** The language of Stripe's checkout page. */
  stripe: Stripe.Checkout.SessionCreateParams.Locale;
  /** The env var naming the price whose product is described in this language. */
  price: 'STRIPE_PRICE_EN' | 'STRIPE_PRICE_PT' | 'STRIPE_PRICE_ES';
  /** The line above the pay button when the donor chose a city. */
  countsToward: (city: string) => string;
}

export const LOCALE_FACTS: Record<Locale, LocaleFacts> = {
  'en-US': {
    stripe: 'en',
    price: 'STRIPE_PRICE_EN',
    countsToward: (city) => `Your donation counts toward ${city}.`,
  },
  'pt-BR': {
    stripe: 'pt-BR',
    price: 'STRIPE_PRICE_PT',
    countsToward: (city) => `Sua doação conta para ${city}.`,
  },
  'es-ES': {
    stripe: 'es',
    price: 'STRIPE_PRICE_ES',
    countsToward: (city) => `Tu donación cuenta para ${city}.`,
  },
};

/** The static payment links carry a short language tag instead of a locale. */
const LANG_TO_LOCALE: Record<string, Locale> = {
  en: 'en-US',
  pt: 'pt-BR',
  es: 'es-ES',
};

export const localeOfLang = (lang: string | undefined): Locale | null =>
  (lang && LANG_TO_LOCALE[lang]) || null;

export type PriceEnv = Pick<
  Env,
  'STRIPE_PRICE_EN' | 'STRIPE_PRICE_PT' | 'STRIPE_PRICE_ES'
>;
