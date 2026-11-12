import { LegalPage } from "@/components/legal/legal-page";
import { legalMetadata } from "@/legal/metadata";
import { TERMS } from "@/legal/terms";

// The terms of service, at /terms/ of the front-page build only (see next.config.ts). The texts
// come as props, so the page's script carries this one's three languages and not the privacy
// policy's.
export const metadata = legalMetadata("terms");

export default function Page() {
  return <LegalPage kind="terms" docs={TERMS} />;
}
