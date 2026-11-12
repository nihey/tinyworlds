/**
 * What the legal texts may link to. Pages of this site are named, so a text never holds a
 * path; the rest are the policies and licences the texts refer to.
 */
export const LINK_TARGETS = [
  "terms",
  "privacy",
  "me",
  "cookies",
  "license",
  "odbl",
  "ccbysa",
  "stripe",
  "google",
] as const;

export type LinkTarget = (typeof LINK_TARGETS)[number];

export type LegalPart =
  | { kind: "text"; text: string }
  | { kind: "email" }
  | { kind: "link"; text: string; to: LinkTarget };

const TOKEN = /\[([^\]]+)\]\(([a-z]+)\)|\{email\}/g;

const isTarget = (value: string): value is LinkTarget =>
  (LINK_TARGETS as readonly string[]).includes(value);

/**
 * A legal text in pieces: plain text, the project's address, and links (`[words](target)`). A
 * link to a target that is not one of `LINK_TARGETS` stays as it was written, so a typo shows
 * on the page (and fails the tests) rather than vanishing.
 */
export function legalParts(text: string): LegalPart[] {
  const parts: LegalPart[] = [];
  let at = 0;
  for (const match of text.matchAll(TOKEN)) {
    const [whole, words, to] = match;
    const start = match.index;
    if (words !== undefined && !isTarget(to)) continue;
    if (start > at) parts.push({ kind: "text", text: text.slice(at, start) });
    parts.push(
      words === undefined ? { kind: "email" } : { kind: "link", text: words, to: to as LinkTarget },
    );
    at = start + whole.length;
  }
  if (at < text.length) parts.push({ kind: "text", text: text.slice(at) });
  return parts;
}

/** The links and addresses a text holds, in order: what every translation of it must keep. */
export function legalTokens(text: string): string[] {
  return legalParts(text).flatMap((part) =>
    part.kind === "email" ? ["{email}"] : part.kind === "link" ? [part.to] : [],
  );
}
