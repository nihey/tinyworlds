import { describe, expect, it } from "vitest";
import type { Place } from "../manifest";
import { createSearchIndex, normalize } from "../search";
import { PT_RULES, roman } from "../search-rules";

const p = (n: string, t: Place["t"], r: number, b?: string): Place => ({
  n,
  t,
  r,
  b,
  lon: 0,
  lat: 0,
});

const index = createSearchIndex([
  p("Central Park", "park", 100, "Manhattan"),
  p("Central Park Zoo", "landmark", 60, "Manhattan"),
  p("Park Slope", "hood", 70, "Brooklyn"),
  p("Prospect Park", "park", 90, "Brooklyn"),
  p("Empire State Building", "landmark", 100, "Manhattan"),
  p("Broadway", "street", 80, "Manhattan"),
  p("Broadway Junction", "station", 30, "Brooklyn"),
  p("West 42nd Street", "street", 50, "Manhattan"),
  p("Fifth Avenue", "street", 85, "Manhattan"),
  p("Williamsburg", "hood", 75, "Brooklyn"),
  p("Williamsburg Bridge", "bridge", 70),
  p("St. Patrick's Cathedral", "landmark", 80, "Manhattan"),
  p("Café Lalo", "place", 10, "Manhattan"),
  p("Museum of Modern Art", "museum", 95, "Manhattan"),
]);

const names = (q: string) => index.search(q).map((h) => h.place.n);

describe("normalize", () => {
  it("drops case, accents and punctuation", () => {
    expect(normalize("  Café  Lalo! ")).toBe("cafe lalo");
    expect(normalize("St. Patrick's")).toBe("st patricks");
  });
  it("turns ordinals and number words into digits", () => {
    expect(normalize("West 42nd Street")).toBe("west 42 street");
    expect(normalize("Fifth Avenue")).toBe("5 avenue");
  });
});

describe("search", () => {
  it("returns nothing for an empty query", () => {
    expect(index.search("   ")).toEqual([]);
  });

  it("puts the exact name first, then names that start with the query", () => {
    expect(names("broadway")).toEqual(["Broadway", "Broadway Junction"]);
    expect(names("central park").slice(0, 2)).toEqual(["Central Park", "Central Park Zoo"]);
  });

  it("orders equal matches by rank", () => {
    // "park" starts a word in all of these: Park Slope starts with it, the rest go by rank
    expect(names("park")).toEqual([
      "Park Slope",
      "Central Park",
      "Prospect Park",
      "Central Park Zoo",
    ]);
  });

  it("ignores accents and case", () => {
    expect(names("CAFE")).toEqual(["Café Lalo"]);
  });

  it("understands street abbreviations and ordinals", () => {
    expect(names("w 42 st")[0]).toBe("West 42nd Street");
    expect(names("5th ave")[0]).toBe("Fifth Avenue");
    expect(names("st patrick")[0]).toBe("St. Patrick's Cathedral");
  });

  it("forgives a typo", () => {
    expect(names("brodway")[0]).toBe("Broadway");
    expect(names("willamsburg")).toEqual(["Williamsburg", "Williamsburg Bridge"]);
  });

  it("finds initials", () => {
    expect(names("esb")).toEqual(["Empire State Building"]);
    expect(names("moma")).toEqual(["Museum of Modern Art"]);
  });

  it("uses the borough to narrow, not to match on its own", () => {
    // both only match with the borough's help, so rank decides
    expect(names("park brooklyn")).toEqual(["Prospect Park", "Park Slope"]);
    expect(names("brooklyn")).toEqual([]);
  });

  it("needs every word to match", () => {
    expect(names("central zebra")).toEqual([]);
  });

  it("suggests the best-known places", () => {
    expect(index.suggest(2).map((s) => s.n)).toEqual(["Central Park", "Empire State Building"]);
  });
});

describe("search in Portuguese", () => {
  const rao = createSearchIndex(
    [
      p("Ribeirão Preto", "borough", 100, "São Paulo"),
      p("Theatro Pedro II", "landmark", 98, "Centro"),
      p("Praça XV de Novembro", "park", 96, "Centro"),
      p("Avenida Nove de Julho", "street", 60, "Jardim Sumaré"),
      p("Rua Sete de Setembro", "street", 40, "Centro"),
      p("Rua São Sebastião", "street", 42, "Centro"),
      p("Avenida Presidente Vargas", "street", 58, "Jardim América"),
      p("Avenida Doutor Francisco Junqueira", "street", 56, "Centro"),
      p("Avenida Professor João Fiúsa", "street", 55, "Jardim Botânico"),
      p("Rodovia Anhanguera", "street", 50),
      p("Jardim Irajá", "hood", 54, "Zona Sul"),
      p("Vila Tibério", "hood", 54, "Zona Oeste"),
      p("Parque Prefeito Luiz Roberto Jábali", "park", 80, "Zona Sul"),
      p("Catedral Metropolitana de São Sebastião", "landmark", 90, "Centro"),
      p("Igreja Santa Rita", "landmark", 30),
      p("Rua Papa João XXIII", "street", 20),
      p("Rua Xavier de Toledo", "street", 20),
      p("Rua Novembro Azul", "street", 10),
    ],
    PT_RULES,
  );
  const found = (q: string) => rao.search(q).map((h) => h.place.n);

  it("counts Roman numerals", () => {
    expect(roman(2)).toBe("ii");
    expect(roman(9)).toBe("ix");
    expect(roman(15)).toBe("xv");
    expect(roman(23)).toBe("xxiii");
  });

  it("keeps Portuguese number words as they are written", () => {
    expect(normalize("Avenida Nove de Julho", PT_RULES)).toBe("avenida nove de julho");
    expect(normalize("Praça XV de Novembro", PT_RULES)).toBe("praca xv de novembro");
  });

  it("finds accented names typed without accents, and the other way round", () => {
    expect(found("ribeirao")[0]).toBe("Ribeirão Preto");
    expect(found("RIBEIRÃO")[0]).toBe("Ribeirão Preto");
    expect(found("sao sebastiao")).toEqual([
      "Catedral Metropolitana de São Sebastião",
      "Rua São Sebastião",
    ]);
    expect(found("praca xv")[0]).toBe("Praça XV de Novembro");
    expect(found("praça")[0]).toBe("Praça XV de Novembro");
    expect(found("irajá")).toEqual(["Jardim Irajá"]);
    expect(found("iraja")).toEqual(["Jardim Irajá"]);
    expect(found("tiberio")).toEqual(["Vila Tibério"]);
  });

  it("understands street-type and title abbreviations", () => {
    expect(found("av nove de julho")[0]).toBe("Avenida Nove de Julho");
    expect(found("r sete de setembro")[0]).toBe("Rua Sete de Setembro");
    expect(found("pça xv")[0]).toBe("Praça XV de Novembro");
    expect(found("pca xv")[0]).toBe("Praça XV de Novembro");
    expect(found("pc xv")[0]).toBe("Praça XV de Novembro");
    expect(found("rod anhanguera")).toEqual(["Rodovia Anhanguera"]);
    expect(found("av dr francisco junqueira")).toEqual(["Avenida Doutor Francisco Junqueira"]);
    expect(found("av prof joao fiusa")).toEqual(["Avenida Professor João Fiúsa"]);
    expect(found("av pres vargas")).toEqual(["Avenida Presidente Vargas"]);
    expect(found("jd iraja")).toEqual(["Jardim Irajá"]);
    expect(found("vl tiberio")).toEqual(["Vila Tibério"]);
    expect(found("pq jabali")).toEqual(["Parque Prefeito Luiz Roberto Jábali"]);
    expect(found("sta rita")).toEqual(["Igreja Santa Rita"]);
  });

  it("reads dates and regnal numbers in digits, words or Roman numerals", () => {
    expect(found("9 de julho")).toEqual(["Avenida Nove de Julho"]);
    expect(found("7 de setembro")).toEqual(["Rua Sete de Setembro"]);
    expect(found("15 de novembro")).toEqual(["Praça XV de Novembro"]);
    expect(found("quinze de novembro")).toEqual(["Praça XV de Novembro"]);
    expect(found("pedro 2")).toEqual(["Theatro Pedro II"]);
    expect(found("pedro segundo")).toEqual(["Theatro Pedro II"]);
    expect(found("joao 23")).toEqual(["Rua Papa João XXIII"]);
  });

  it("matches a number only as a whole word", () => {
    // "9" is "nove", not the start of "Novembro"; "10" is "x", not the start of "Xavier"
    expect(found("9")).toEqual(["Avenida Nove de Julho"]);
    expect(found("10")).toEqual([]);
  });

  it("still completes a word that happens to be a number", () => {
    // someone typing "novembro" passes through "nove"
    expect(found("nove")).toContain("Praça XV de Novembro");
    expect(found("nove")).toContain("Avenida Nove de Julho");
  });

  it("builds initials without the small words", () => {
    expect(found("cmss")).toEqual(["Catedral Metropolitana de São Sebastião"]);
  });
});
