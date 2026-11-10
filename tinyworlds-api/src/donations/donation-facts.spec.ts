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
    });
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
