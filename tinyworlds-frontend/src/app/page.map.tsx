import { MapApp } from "@/components/map/map-app";

// The page of a world's build: its map. (The front page's build uses page.home.tsx instead;
// next.config.ts picks one of the two, so neither build carries the other's code.)
export default function Page() {
  return <MapApp />;
}
