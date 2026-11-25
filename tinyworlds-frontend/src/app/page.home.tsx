import { Landing } from "@/components/home/landing";
import { homeAtBuild } from "@/lib/home-build";

// The page of the front-page build (NEXT_PUBLIC_WORLD=home): the list of worlds. A world's build
// uses page.map.tsx instead; next.config.ts picks one of the two. What the API says when the page
// is built is baked into it (lib/home-build.ts), so it opens whole and in its final order.
export default async function Page() {
  return <Landing initial={await homeAtBuild()} />;
}
