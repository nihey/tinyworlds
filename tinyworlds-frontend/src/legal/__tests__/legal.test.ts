import { describe, expect, it } from "vitest";
import { DICTIONARIES, LOCALES } from "@/i18n";
import {
  LEGAL,
  LEGAL_UPDATED,
  updatedOn,
  type LegalBlock,
  type LegalDoc,
  type LegalItem,
} from "..";
import { legalParts, legalTokens } from "../parts";

/** Every text of a document with where it is, in order. */
function texts(doc: LegalDoc): [string, string][] {
  const item = (where: string, it: LegalItem): [string, string][] =>
    typeof it === "string"
      ? [[where, it]]
      : [
          [`${where} term`, it.term],
          [where, it.text],
        ];
  const block = (where: string, b: LegalBlock): [string, string][] =>
    typeof b === "string"
      ? [[where, b]]
      : b.items.flatMap((it, i) => item(`${where} item ${i}`, it));
  return [
    ["title", doc.title],
    ["description", doc.description],
    ...doc.summary.map((line, i): [string, string] => [`summary ${i}`, line]),
    ...doc.sections.flatMap((s) => [
      [`${s.id} title`, s.title] as [string, string],
      ...s.blocks.flatMap((b, i) => block(`${s.id} block ${i}`, b)),
    ]),
  ];
}

/** The document's shape: its sections, and in each the kind of every block and its points. */
const shape = (doc: LegalDoc) =>
  doc.sections.map((s) => ({
    id: s.id,
    blocks: s.blocks.map((b) =>
      typeof b === "string" ? "p" : b.items.map((it) => (typeof it === "string" ? "-" : "term")),
    ),
  }));

describe("legalParts", () => {
  it("makes links of the targets it knows, and of the address", () => {
    expect(legalParts("See our [Privacy Policy](privacy) or write to {email}.")).toEqual([
      { kind: "text", text: "See our " },
      { kind: "link", text: "Privacy Policy", to: "privacy" },
      { kind: "text", text: " or write to " },
      { kind: "email" },
      { kind: "text", text: "." },
    ]);
  });

  it("leaves a link to an unknown target as it was written", () => {
    expect(legalParts("[here](nowhere) and [there](terms)")).toEqual([
      { kind: "text", text: "[here](nowhere) and " },
      { kind: "link", text: "there", to: "terms" },
    ]);
  });

  it("is the text alone when there is nothing to link", () => {
    expect(legalParts("Plain.")).toEqual([{ kind: "text", text: "Plain." }]);
    expect(legalParts("")).toEqual([]);
  });
});

describe.each(Object.entries(LEGAL))("the %s", (_kind, docs) => {
  const en = docs["en-US"];

  it("is in every language the interface speaks", () => {
    expect(Object.keys(docs).sort()).toEqual([...LOCALES].sort());
  });

  it("has the same sections, blocks and points in every language", () => {
    for (const locale of LOCALES) expect(shape(docs[locale]), locale).toEqual(shape(en));
  });

  it("keeps every link and the address in every translation, in the same places", () => {
    const expected = texts(en).map(([where, text]) => [where, legalTokens(text)]);
    for (const locale of LOCALES)
      expect(
        texts(docs[locale]).map(([where, text]) => [where, legalTokens(text)]),
        locale,
      ).toEqual(expected);
  });

  it("has no empty text, no link it cannot make and no stray braces", () => {
    for (const locale of LOCALES)
      for (const [where, text] of texts(docs[locale])) {
        expect(text.trim(), `${locale} ${where}`).not.toBe("");
        const left = legalParts(text)
          .filter((part) => part.kind === "text")
          .map((part) => (part.kind === "text" ? part.text : ""))
          .join("");
        expect(left, `${locale} ${where}`).not.toMatch(/\]\(|[{}]/);
      }
  });

  it("gives every section an anchor of its own", () => {
    const ids = en.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z][a-z-]*$/);
  });
});

describe("the legal pages", () => {
  it("are named as the links to them are, in every language", () => {
    for (const locale of LOCALES) {
      expect(LEGAL.terms[locale].title, locale).toBe(DICTIONARIES[locale].legal.terms);
      expect(LEGAL.privacy[locale].title, locale).toBe(DICTIONARIES[locale].legal.privacy);
    }
  });

  it("write their date in the visitor's language, whatever the time zone", () => {
    expect(updatedOn("2026-11-11", "en-US")).toBe("November 11, 2026");
    expect(updatedOn("2026-11-11", "pt-BR")).toBe("11 de novembro de 2026");
    expect(updatedOn("2026-11-11", "es-ES")).toBe("11 de noviembre de 2026");
    expect(LEGAL_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("say the date in a sentence of every language", () => {
    for (const locale of LOCALES)
      expect(DICTIONARIES[locale].legal.updated, locale).toContain("{date}");
  });
});
