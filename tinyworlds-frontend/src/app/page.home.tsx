import { Landing } from "@/components/home/landing";

// The page of the front-page build (NEXT_PUBLIC_WORLD=home): the list of worlds. A world's build
// uses page.map.tsx instead; next.config.ts picks one of the two.
export default function Page() {
  return <Landing />;
}
