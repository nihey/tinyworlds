import { describe, expect, it } from "vitest";
import {
  asksFirst,
  bannerShown,
  CONSENT_KEY,
  CONSENT_REGIONS,
  cookiesToClear,
  mayLoad,
  readConsent,
  startCommands,
  writeConsent,
} from "../consent";

function store(initial: Record<string, string> = {}) {
  const kept = new Map(Object.entries(initial));
  return {
    kept,
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
  };
}

describe("asksFirst", () => {
  it("asks anywhere in Europe, islands included", () => {
    for (const zone of [
      "Europe/Madrid",
      "Europe/Lisbon",
      "Europe/London",
      "Europe/Zurich",
      "Atlantic/Canary",
      "Atlantic/Azores",
      "Atlantic/Reykjavik",
      "Asia/Nicosia",
      "Africa/Ceuta",
    ]) {
      expect(asksFirst(zone), zone).toBe(true);
    }
  });

  it("asks when the browser hides where it is", () => {
    expect(asksFirst(undefined)).toBe(true);
    expect(asksFirst("")).toBe(true);
    expect(asksFirst("UTC")).toBe(true);
    expect(asksFirst("Etc/GMT+3")).toBe(true);
  });

  it("does not ask elsewhere", () => {
    for (const zone of [
      "America/New_York",
      "America/Sao_Paulo",
      "America/Argentina/Rio_Gallegos",
      "Asia/Tokyo",
      "Australia/Sydney",
      "Africa/Lagos",
    ]) {
      expect(asksFirst(zone), zone).toBe(false);
    }
  });
});

describe("mayLoad", () => {
  it("follows an answer wherever the visitor is", () => {
    expect(mayLoad("granted", true)).toBe(true);
    expect(mayLoad("granted", false)).toBe(true);
    expect(mayLoad("denied", true)).toBe(false);
    expect(mayLoad("denied", false)).toBe(false);
  });

  it("waits for an answer only where one is asked for", () => {
    expect(mayLoad(null, true)).toBe(false);
    expect(mayLoad(null, false)).toBe(true);
  });
});

describe("bannerShown", () => {
  const base = { ready: true, choice: null, asks: true, reopened: false } as const;

  it("asks a visitor who has not answered and is asked first", () => {
    expect(bannerShown(base)).toBe(true);
    expect(bannerShown({ ...base, asks: false })).toBe(false);
    expect(bannerShown({ ...base, choice: "denied" })).toBe(false);
  });

  it("asks again whoever wants to change their answer", () => {
    expect(bannerShown({ ...base, asks: false, choice: "granted", reopened: true })).toBe(true);
  });

  it("never shows before the browser knows (prerendering, hydration)", () => {
    expect(bannerShown({ ...base, ready: false, reopened: true })).toBe(false);
  });
});

describe("readConsent / writeConsent", () => {
  it("keeps the answer", () => {
    const local = store();
    expect(readConsent(local)).toBeNull();
    writeConsent(local, "denied");
    expect(local.kept.get(CONSENT_KEY)).toBe("denied");
    expect(readConsent(local)).toBe("denied");
  });

  it("ignores anything else stored there", () => {
    expect(readConsent(store({ [CONSENT_KEY]: "yes" }))).toBeNull();
  });

  it("does without storage", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readConsent(blocked)).toBeNull();
    expect(() => writeConsent(blocked, "granted")).not.toThrow();
  });
});

describe("startCommands", () => {
  const now = new Date(0);

  it("denies analytics cookies in Europe and ads everywhere before anything else", () => {
    const [europe, elsewhere, ...rest] = startCommands(false, now);
    expect(europe).toEqual([
      "consent",
      "default",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
        region: CONSENT_REGIONS,
      },
    ]);
    expect(elsewhere).toEqual([
      "consent",
      "default",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "granted",
      },
    ]);
    expect(rest).toEqual([["js", now]]);
  });

  it("adds the visitor's yes before the container starts", () => {
    const commands = startCommands(true, now);
    expect(commands.slice(2)).toEqual([
      ["consent", "update", { analytics_storage: "granted" }],
      ["js", now],
    ]);
  });

  it("covers the EU, the EEA, the UK and Switzerland", () => {
    expect(CONSENT_REGIONS).toHaveLength(32);
    for (const code of ["ES", "PT", "DE", "NO", "IS", "LI", "GB", "CH"]) {
      expect(CONSENT_REGIONS).toContain(code);
    }
  });
});

describe("cookiesToClear", () => {
  it("clears Google Analytics' cookies on the host and every domain above it", () => {
    const cleared = cookiesToClear(
      "_ga=GA1.1.1; theme=dark; _ga_ABC123=GS1.1.2; _gid=x",
      "maps.example.com",
    );
    expect(cleared).toEqual([
      { name: "_ga", domain: "" },
      { name: "_ga", domain: ".maps.example.com" },
      { name: "_ga", domain: ".example.com" },
      { name: "_ga_ABC123", domain: "" },
      { name: "_ga_ABC123", domain: ".maps.example.com" },
      { name: "_ga_ABC123", domain: ".example.com" },
    ]);
  });

  it("finds nothing to clear when there is nothing of Google's", () => {
    expect(cookiesToClear("theme=dark", "example.com")).toEqual([]);
    expect(cookiesToClear("", "localhost")).toEqual([]);
  });
});
