import { PRIVACY } from "./privacy";
import { TERMS } from "./terms";
import type { LegalDocs, LegalKind } from "./types";

export type { LegalBlock, LegalDoc, LegalDocs, LegalItem, LegalKind, LegalSection } from "./types";
export { LEGAL_UPDATED, updatedOn } from "./updated";

/**
 * Both texts in every language: for the build (metadata) and the tests. A page's script takes
 * its own text as props instead (`app/terms`, `app/privacy`), so nothing in the browser imports this.
 */
export const LEGAL: Record<LegalKind, LegalDocs> = { terms: TERMS, privacy: PRIVACY };
