import { checkoutSession } from '../../test/fake-stripe.js';
import { donationFacts } from './donation-facts.js';

describe('donationFacts', () => {
  it("reads one of the API's own sessions from its metadata", () => {
    const facts = donationFacts(
      checkoutSession({
        id: 'cs_a',
        amount: 2500,
        metadata: {
          app: 'tinyworlds',
          city: '  São   Paulo ',
          world: 'tinynyc',
          locale: 'pt-BR',
        },
      }),
    );
    expect(facts).toEqual({
      stripeSessionId: 'cs_a',
      stripePaymentIntentId: 'pi_test_1',
      amountCents: 2500,
      currency: 'usd',
      cityName: 'São Paulo',
      citySlug: 'sao-paulo',
      world: 'tinynyc',
      locale: 'pt-BR',
      visitId: null,
    });
  });

  it('reads the visit a checkout was started from, if it is one', () => {
    const read = (visit_id: string) =>
      donationFacts(
        checkoutSession({ metadata: { app: 'tinyworlds', visit_id } }),
      )?.visitId;
    expect(read('0B0E7A52-6C1D-4F0A-9C55-2F1B8E3D4A10')).toBe(
      '0b0e7a52-6c1d-4f0a-9c55-2f1b8e3d4a10',
    );
    expect(read('not-a-visit')).toBeNull();
    expect(read('')).toBeNull();
  });

  it("reads a payment link's session: the city from its field, the world from the reference", () => {
    const facts = donationFacts(
      checkoutSession({
        id: 'cs_link',
        amount: 100,
        metadata: { app: 'tinyworlds', lang: 'es' },
        cityField: 'Buenos Aires',
        clientReferenceId: 'tinyrao',
      }),
    );
    expect(facts).toMatchObject({
      cityName: 'Buenos Aires',
      citySlug: 'buenos-aires',
      world: 'tinyrao',
      locale: 'es-ES',
      amountCents: 100,
    });
  });

  it('ignores the sessions of other products on the account', () => {
    expect(
      donationFacts(checkoutSession({ metadata: { app: 'fitbest' } })),
    ).toBeNull();
    expect(donationFacts(checkoutSession({ metadata: {} }))).toBeNull();
  });

  it('ignores a session that is not paid', () => {
    for (const paymentStatus of ['unpaid', 'no_payment_required']) {
      expect(donationFacts(checkoutSession({ paymentStatus }))).toBeNull();
    }
  });

  it('has no city when none was named, or the text names nothing', () => {
    expect(donationFacts(checkoutSession())).toMatchObject({
      cityName: null,
      citySlug: null,
    });
    expect(
      donationFacts(checkoutSession({ cityField: ' ?!… ' })),
    ).toMatchObject({ cityName: null, citySlug: null });
  });

  it('keeps only a world and a locale it recognises', () => {
    const facts = donationFacts(
      checkoutSession({
        metadata: { app: 'tinyworlds', world: '../etc', locale: 'xx-XX' },
      }),
    );
    expect(facts).toMatchObject({ world: null, locale: null });
  });

  it('lower-cases the currency', () => {
    expect(donationFacts(checkoutSession({ currency: 'BRL' }))).toMatchObject({
      currency: 'brl',
    });
  });
});
