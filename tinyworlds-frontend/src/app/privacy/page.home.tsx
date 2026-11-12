import { LegalPage } from "@/components/legal/legal-page";
import { legalMetadata } from "@/legal/metadata";
import { PRIVACY } from "@/legal/privacy";

// The privacy policy, at /privacy/ of the front-page build only (see next.config.ts). The texts
// come as props, so the page's script carries this one's three languages and not the terms'.
export const metadata = legalMetadata("privacy");

export default function Page() {
  return <LegalPage kind="privacy" docs={PRIVACY} />;
}
