import { useEffect, useState } from "react";
import type { MapEngine } from "@/map/engine";
import { DAY, NIGHT, watchCityLight, type LightMode } from "@/map/daylight";

/** Grade the composed tiles and sprites in place, including the fog at the map's edges. */
export function CityLightFilter({ mode, engine }: { mode: LightMode; engine: MapEngine | null }) {
  const [light, setLight] = useState(mode === "dark" ? NIGHT : DAY);
  useEffect(() => {
    const stop = watchCityLight(mode, (sample) => {
      setLight(sample);
      engine?.setWindowLight(sample.lamps);
    });
    return () => {
      stop();
      engine?.setWindowLight(0);
    };
  }, [mode, engine]);
  const channel = (n: number) => light.curve.filter((_, i) => i % 3 === n).join(" ");
  return (
    <svg width="0" height="0" className="absolute pointer-events-none" aria-hidden>
      <defs>
        <filter
          id="city-light"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feComponentTransfer>
            <feFuncR type="table" tableValues={channel(0)} />
            <feFuncG type="table" tableValues={channel(1)} />
            <feFuncB type="table" tableValues={channel(2)} />
          </feComponentTransfer>
        </filter>
      </defs>
    </svg>
  );
}
