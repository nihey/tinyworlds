import { describe, expect, it } from "vitest";
import { stepRequest, VISIT_KEY, visitId } from "../funnel";

const VISIT = "0b0e7a52-6c1d-4f0a-9c55-2f1b8e3d4a10";

function store(initial: Record<string, string> = {}) {
  const kept = new Map(Object.entries(initial));
  return {
    kept,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
  };
}

describe("visitId", () => {
  it("names a tab's visit once and keeps the name", () => {
    const tab = store();
    let made = 0;
    const make = () => {
      made++;
      return VISIT;
    };
    expect(visitId(tab, make)).toBe(VISIT);
    expect(visitId(tab, make)).toBe(VISIT);
    expect(made).toBe(1);
    expect(tab.kept.get(VISIT_KEY)).toBe(VISIT);
  });

  it("replaces what is stored if it is not an id", () => {
    const tab = store({ [VISIT_KEY]: "<script>" });
    expect(visitId(tab, () => VISIT)).toBe(VISIT);
  });

  it("counts no visit when the tab can keep nothing", () => {
    const blocked = {
      getItem: () => {
        throw new Error("storage is blocked");
      },
      setItem: () => {},
    };
    expect(visitId(blocked, () => VISIT)).toBeNull();
  });
});

describe("stepRequest", () => {
  it("reports the step, where it happened and in which language", () => {
    const request = stepRequest(VISIT, "DONATE_OPENED", "tinynyc", "pt-BR");
    expect(request.query).toContain("trackFunnelStep(input: $input)");
    expect(request.variables).toEqual({
      input: { visitId: VISIT, step: "DONATE_OPENED", world: "tinynyc", locale: "pt-BR" },
    });
  });
});
