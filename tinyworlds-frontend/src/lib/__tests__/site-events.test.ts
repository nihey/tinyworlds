import { describe, expect, it } from "vitest";
import {
  CHECKOUT_KEY,
  eventMessage,
  rememberCheckout,
  rybbitProps,
  takeCheckout,
} from "../site-events";

function store(initial: Record<string, string> = {}) {
  const kept = new Map(Object.entries(initial));
  return {
    kept,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
    removeItem: (key: string) => void kept.delete(key),
  };
}

describe("eventMessage", () => {
  it("always carries every key, so the data layer forgets the last event's values", () => {
    expect(eventMessage("donate_open", { world: "tinynyc" })).toEqual({
      event: "donate_open",
      world: "tinynyc",
      city: undefined,
      amount: undefined,
      value: undefined,
      currency: undefined,
    });
    expect(Object.keys(eventMessage("explore_more", { world: "home" }))).toEqual([
      "event",
      "world",
      "city",
      "amount",
      "value",
      "currency",
    ]);
  });

  it("gives a paid donation its value in dollars", () => {
    expect(
      eventMessage("donate_complete", { world: "tinyrao", city: "Lisbon", amount: 25 }),
    ).toMatchObject({ event: "donate_complete", city: "Lisbon", value: 25, currency: "USD" });
  });

  it("gives no value to anything that is not a paid donation", () => {
    const checkout = eventMessage("donate_checkout", { world: "home", amount: 10 });
    expect(checkout).toMatchObject({ amount: 10, value: undefined, currency: undefined });
    // back from the checkout without knowing what was given: counted, without a value
    expect(eventMessage("donate_complete", { world: "home" })).toMatchObject({
      value: undefined,
      currency: undefined,
    });
  });

  it("treats no city in particular as no city", () => {
    expect(eventMessage("donate_checkout", { world: "home", city: "" }).city).toBeUndefined();
    expect(eventMessage("donate_checkout", { world: "home", city: null }).city).toBeUndefined();
  });
});

describe("rybbitProps", () => {
  it("keeps only the properties the event has", () => {
    expect(rybbitProps({ world: "tinylas" })).toEqual({ world: "tinylas" });
    expect(rybbitProps({ world: "tinylas", city: "Paris", amount: 5 })).toEqual({
      world: "tinylas",
      city: "Paris",
      amount: 5,
    });
    expect(rybbitProps({ world: "tinylas", city: null, amount: null })).toEqual({
      world: "tinylas",
    });
  });
});

describe("rememberCheckout / takeCheckout", () => {
  it("hands what was chosen to the page the donor comes back to, once", () => {
    const tab = store();
    rememberCheckout(tab, { world: "tinyvlc", city: "Porto", amount: 50 });
    expect(takeCheckout(tab)).toEqual({ world: "tinyvlc", city: "Porto", amount: 50 });
    expect(tab.kept.has(CHECKOUT_KEY)).toBe(false);
    expect(takeCheckout(tab)).toBeNull();
  });

  it("keeps no city and no amount as nulls", () => {
    const tab = store();
    rememberCheckout(tab, { world: "home", city: null, amount: null });
    expect(takeCheckout(tab)).toEqual({ world: "home", city: null, amount: null });
  });

  it("ignores what it cannot read", () => {
    expect(takeCheckout(store({ [CHECKOUT_KEY]: "{not json" }))).toBeNull();
    expect(takeCheckout(store({ [CHECKOUT_KEY]: '"a string"' }))).toBeNull();
    expect(takeCheckout(store({ [CHECKOUT_KEY]: '{"city":"Rome"}' }))).toBeNull();
    expect(takeCheckout(store({ [CHECKOUT_KEY]: '{"world":"home","amount":"lots"}' }))).toEqual({
      world: "home",
      city: null,
      amount: null,
    });
  });

  it("does without storage", () => {
    const blocked = {
      getItem: () => {
        throw new Error("storage is blocked");
      },
      setItem: () => {
        throw new Error("storage is blocked");
      },
      removeItem: () => {},
    };
    expect(() => rememberCheckout(blocked, { world: "home" })).not.toThrow();
    expect(takeCheckout(blocked)).toBeNull();
  });
});
