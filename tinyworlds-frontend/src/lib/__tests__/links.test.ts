import { describe, expect, it } from "vitest";
import {
  LINKS_MAX,
  LINK_REL,
  URL_MAX,
  assetUrl,
  centsToPictures,
  cleanLinkUrl,
  hostOf,
  parseLinks,
  parseMyLink,
  parseMyLinks,
} from "../links";

const API = "https://example.com";
const link = (extra: Record<string, unknown> = {}) => ({
  url: "https://shop.example.com/",
  title: "A tiny shop",
  description: "Prints and postcards",
  icon: "/api/link-images/3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b",
  image: "/api/link-images/8c25d9a5-1e24-49a6-9c5d-54a68685db7d",
  ...extra,
});

describe("parseLinks", () => {
  it("reads a link, its pictures at the API's own address", () => {
    expect(parseLinks([link()], API)).toEqual([
      {
        url: "https://shop.example.com/",
        title: "A tiny shop",
        description: "Prints and postcards",
        icon: "https://example.com/api/link-images/3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b",
        image: "https://example.com/api/link-images/8c25d9a5-1e24-49a6-9c5d-54a68685db7d",
      },
    ]);
  });

  it("has none for a row without links, or with something else there", () => {
    expect(parseLinks(undefined, API)).toEqual([]);
    expect(parseLinks(null, API)).toEqual([]);
    expect(parseLinks("links", API)).toEqual([]);
  });

  it.each([
    ["a script", "javascript:alert(1)"],
    ["plain http", "http://example.com/"],
    ["a data URL", "data:text/html,<p>hi"],
    ["something that is not an address", "not a url"],
    ["nothing", null],
  ])("never sends a visitor to %s", (_what, url) => {
    expect(parseLinks([link({ url })], API)).toEqual([]);
  });

  it("drops a link without a title, and keeps one without the rest", () => {
    expect(parseLinks([link({ title: " " })], API)).toEqual([]);
    expect(parseLinks([link({ description: null, icon: null, image: null })], API)).toEqual([
      {
        url: "https://shop.example.com/",
        title: "A tiny shop",
        description: null,
        icon: null,
        image: null,
      },
    ]);
  });

  it("keeps the well-formed ones in order, three at most", () => {
    const many = [1, 2, 3, 4, 5].map((n) => link({ url: `https://example.com/${n}` }));
    const kept = parseLinks([{ nonsense: true }, ...many], API);
    expect(kept).toHaveLength(LINKS_MAX);
    expect(kept.map((l) => l.url)).toEqual([
      "https://example.com/1",
      "https://example.com/2",
      "https://example.com/3",
    ]);
  });

  it("shows no picture without knowing where the API is", () => {
    expect(parseLinks([link()], null)[0]).toMatchObject({ icon: null, image: null });
  });
});

describe("assetUrl", () => {
  it("is the API's origin and the path it named", () => {
    expect(assetUrl("/api/link-images/abc", "http://localhost:4000")).toBe(
      "http://localhost:4000/api/link-images/abc",
    );
  });

  it.each([
    ["an address elsewhere", "https://evil.test/pixel.png"],
    ["an address without a scheme", "//evil.test/pixel.png"],
    ["a path that is not one", "api/link-images/abc"],
    ["a script", "javascript:alert(1)"],
    ["a path with a query", "/api/link-images/abc?next=//evil.test"],
    ["nothing", null],
    ["a number", 7],
  ])("is not %s", (_what, path) => {
    expect(assetUrl(path, API)).toBeNull();
  });
});

describe("parseMyLinks", () => {
  const mine = (extra: Record<string, unknown> = {}) => ({
    max: 3,
    givenCents: 600,
    picturesFromCents: 1000,
    hidden: false,
    links: [{ id: "a1", ...link() }],
    ...extra,
  });

  it("reads the donor's links and what decides what shows", () => {
    const parsed = parseMyLinks(mine(), API);
    expect(parsed).toMatchObject({
      max: 3,
      givenCents: 600,
      picturesFromCents: 1000,
      hidden: false,
    });
    expect(parsed?.links).toHaveLength(1);
    expect(parsed?.links[0]).toMatchObject({ id: "a1", title: "A tiny shop" });
  });

  it("says null for an answer that is not the contract's", () => {
    expect(parseMyLinks(null, API)).toBeNull();
    expect(parseMyLinks(mine({ links: "x" }), API)).toBeNull();
    expect(parseMyLinks(mine({ max: "3" }), API)).toBeNull();
    expect(parseMyLinks(mine({ hidden: "no" }), API)).toBeNull();
    expect(parseMyLinks(mine({ givenCents: -1 }), API)).toBeNull();
    expect(parseMyLinks(mine({ links: [link()] }), API)).toBeNull(); // no id
    expect(
      parseMyLinks(mine({ links: [{ id: "a", ...link({ url: "ftp://x" }) }] }), API),
    ).toBeNull();
  });

  it("reads one link as a change answers it", () => {
    expect(parseMyLink({ id: "a1", ...link() }, API)).toMatchObject({ id: "a1" });
    expect(parseMyLink(link(), API)).toBeNull();
    expect(parseMyLink(null, API)).toBeNull();
  });
});

describe("cleanLinkUrl", () => {
  it("keeps an https page, without its fragment", () => {
    expect(cleanLinkUrl("https://example.com/me?tab=1#top")).toBe("https://example.com/me?tab=1");
  });

  it("meets what people type halfway", () => {
    expect(cleanLinkUrl("  example.com/shop ")).toBe("https://example.com/shop");
    expect(cleanLinkUrl("http://Example.com")).toBe("https://example.com/");
  });

  // the same refusals as the API's cleanLinkUrl (tinyworlds-api/src/links/link-url.spec.ts)
  it.each([
    ["another scheme", "javascript:alert(1)"],
    ["a data URL", "data:text/html,<p>hi"],
    ["mail", "mailto:ana@example.com"],
    ["an address", "https://127.0.0.1/"],
    ["an address in hex", "https://0x7f.1/"],
    ["an IPv6 address", "https://[::1]/"],
    ["a bare name", "https://localhost/"],
    ["a private suffix", "https://printer.local/"],
    ["a port", "https://example.com:8443/"],
    ["a port without a scheme", "example.com:8080/x"],
    ["a user", "https://ana@example.com/"],
    ["a space", "https://example.com/a b"],
    ["a trailing dot", "https://example.com./"],
    ["nothing", "   "],
  ])("refuses %s", (_what, raw) => {
    expect(cleanLinkUrl(raw)).toBeNull();
  });

  it("refuses a link longer than the API keeps", () => {
    expect(cleanLinkUrl(`https://example.com/${"a".repeat(URL_MAX)}`)).toBeNull();
  });
});

describe("hostOf", () => {
  it("is where a link leads, as people read it", () => {
    expect(hostOf("https://www.example.com/shop?x=1")).toBe("example.com");
    expect(hostOf("https://shop.example.com/")).toBe("shop.example.com");
    expect(hostOf("nonsense")).toBe("nonsense");
  });
});

describe("centsToPictures", () => {
  it("is what is still to give, and nothing once it is given", () => {
    expect(centsToPictures({ givenCents: 600, picturesFromCents: 1000 })).toBe(400);
    expect(centsToPictures({ givenCents: 1000, picturesFromCents: 1000 })).toBe(0);
    expect(centsToPictures({ givenCents: 4200, picturesFromCents: 1000 })).toBe(0);
  });
});

describe("what a benefactor's link says to a search engine", () => {
  it("says dofollow, as the benefactors are told", () => {
    expect(LINK_REL.split(" ")).toContain("dofollow");
  });

  it("never says the link is not to be followed, or that it was paid for", () => {
    for (const mark of ["nofollow", "sponsored", "ugc"])
      expect(LINK_REL.split(" ")).not.toContain(mark);
  });
});
