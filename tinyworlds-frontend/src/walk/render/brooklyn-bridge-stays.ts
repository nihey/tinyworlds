import type { Cable } from "../cell";
import type { BrooklynBridge } from "./brooklyn-bridge";

const TOWER_TOP = 82.9;
// Grimmelsman (2006), §5.3.2: alternating 7.5 ft panels, from panel 7 through 55.
// https://doi.org/10.17918/etd-1222
const PANEL = 7.5 * 0.3048;
const FIRST_PANEL = 7;
const LAST_PANEL = 55;
// The four planes line up with the inner and outer edges of the walk's two road decks.
const PLANES = [-14, -1, 2.6, 15.65];
const MIDPOINT_REACH = (LAST_PANEL * PANEL) / 2 + Math.max(...PLANES.map(Math.abs));

type DeckProfile = readonly (readonly [distance: number, height: number])[];

// Road elevations from the walk data, in metres from each tower. Fit the fan to the
// rendered trusses so the ends reach the road even where the walk height is simplified.
const MANHATTAN_LAND: DeckProfile = [
  [0, 23],
  [46, 19.5],
];
const MANHATTAN_RIVER: DeckProfile = [
  [0, 23],
  [20, 27.6],
  [40, 32.6],
  [60, 36.9],
  [80, 39.9],
  [100, 40.9],
  [110, 41],
];
const BROOKLYN_RIVER: DeckProfile = [
  [0, 19.5],
  [100, 19.5],
  [113, 20],
  [127, 22.5],
];
const BROOKLYN_LAND: DeckProfile = [[0, 19.5]];
const DECKS = [
  [MANHATTAN_LAND, MANHATTAN_RIVER],
  [BROOKLYN_RIVER, BROOKLYN_LAND],
] as const;

function deckHeight(profile: DeckProfile, distance: number): number {
  for (let i = 1; i < profile.length; i++) {
    const [end, top] = profile[i];
    if (distance > end) continue;
    const [start, bottom] = profile[i - 1];
    return bottom + ((distance - start) / (end - start)) * (top - bottom);
  }
  return profile[profile.length - 1][1];
}

/** Each straight steel stay is drawn by the square containing its midpoint. */
export function brooklynBridgeStays(
  bridge: BrooklynBridge,
  i: number,
  j: number,
  side: number,
): Cable[] {
  const west = i * side;
  const south = j * side;
  const east = west + side;
  const north = south + side;
  const stays: Cable[] = [];

  for (const [tower, [te, tn]] of bridge.towers.entries()) {
    if (
      te + MIDPOINT_REACH < west ||
      te - MIDPOINT_REACH >= east ||
      tn + MIDPOINT_REACH < south ||
      tn - MIDPOINT_REACH >= north
    )
      continue;

    const [towardsManhattan, towardsBrooklyn] = DECKS[tower];
    for (const across of PLANES) {
      const e = te - bridge.dn * across;
      const n = tn + bridge.de * across;
      for (const direction of [-1, 1]) {
        const profile = direction < 0 ? towardsManhattan : towardsBrooklyn;
        for (let panel = FIRST_PANEL; panel <= LAST_PANEL; panel += 2) {
          const distance = panel * PANEL;
          const de = bridge.de * distance * direction;
          const dn = bridge.dn * distance * direction;
          const midE = e + de / 2;
          const midN = n + dn / 2;
          if (midE < west || midE >= east || midN < south || midN >= north) continue;
          stays.push({
            kind: 1,
            pts: Float32Array.of(
              e,
              n,
              TOWER_TOP,
              e + de,
              n + dn,
              deckHeight(profile, distance) - 0.6,
            ),
          });
        }
      }
    }
  }

  return stays;
}
