import type { Volume } from "../cell";
import { lonLatToEN, type WalkGeo } from "../geo";

const MANHATTAN_TOWER = [-73.9983352, 40.7072682] as const;
const BROOKLYN_TOWER = [-73.9943549, 40.7041035] as const;
const TOWER_HEIGHT = 82.9;
const ARCH_FOOT = 18;
const ARCH_SPRING = 50;
const INNER_PIER = 2.2;
const OUTER_PIER = 16;
const ARCH_BANDS = 12;

export function brooklynBridge(geo: WalkGeo) {
  const a = lonLatToEN(geo, ...MANHATTAN_TOWER);
  const b = lonLatToEN(geo, ...BROOKLYN_TOWER);
  const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { towers: [a, b] as const, span, de: (b[0] - a[0]) / span, dn: (b[1] - a[1]) / span };
}

export type BrooklynBridge = ReturnType<typeof brooklynBridge>;

/** The wood boards on the elevated promenade between the suspension anchorages. */
export function onBrooklynPromenade(
  bridge: BrooklynBridge,
  e: number,
  n: number,
  z: number,
): boolean {
  const [ae, an] = bridge.towers[0];
  const de = e - ae;
  const dn = n - an;
  const along = de * bridge.de + dn * bridge.dn;
  const across = dn * bridge.de - de * bridge.dn;
  return z >= 22 && along >= -175 && along <= bridge.span + 175 && Math.abs(across) <= 8;
}

/** Clips a footprint to one side of a plane along the bridge's axis. */
function clip(
  ring: Float32Array,
  across: (e: number, n: number) => number,
  edge: number,
  side: number,
) {
  const out: number[] = [];
  let ae = ring[ring.length - 2];
  let an = ring[ring.length - 1];
  let ad = side * (across(ae, an) - edge);
  for (let i = 0; i < ring.length; i += 2) {
    const be = ring[i];
    const bn = ring[i + 1];
    const bd = side * (across(be, bn) - edge);
    if ((ad < 0 && bd > 0) || (ad > 0 && bd < 0)) {
      const t = ad / (ad - bd);
      out.push(ae + (be - ae) * t, an + (bn - an) * t);
    }
    if (bd >= 0) out.push(be, bn);
    [ae, an, ad] = [be, bn, bd];
  }
  return Float32Array.from(out);
}

/** Open the paired Gothic arches in each mapped tower for the street-level mesh. The survey
 * footprint keeps its buttresses. The centre pier fits between the promenade's two paths. */
export function brooklynTowerVolumes(bridge: BrooklynBridge, v: Volume): Volume[] | null {
  if (Math.abs(v.top - TOWER_HEIGHT) > 0.2 || v.base !== 0 || v.rings.length !== 1) return null;
  const e = (v.box[0] + v.box[2]) / 2;
  const n = (v.box[1] + v.box[3]) / 2;
  const tower = bridge.towers.find(([te, tn]) => Math.hypot(te - e, tn - n) < 6);
  if (!tower) return null;

  const across = (e: number, n: number) => (n - tower[1]) * bridge.de - (e - tower[0]) * bridge.dn;
  const ring = v.rings[0];
  const pieces: Volume[] = [{ ...v, top: ARCH_FOOT }];
  const band = (base: number, top: number, inner: number, outer: number) => {
    const rings = [
      clip(ring, across, -outer, -1),
      clip(clip(ring, across, -inner, 1), across, inner, -1),
      clip(ring, across, outer, 1),
    ];
    for (const part of rings) if (part.length >= 6) pieces.push({ ...v, base, top, rings: [part] });
  };
  band(ARCH_FOOT, ARCH_SPRING, INNER_PIER, OUTER_PIER);

  const width = OUTER_PIER - INNER_PIER;
  const center = (INNER_PIER + OUTER_PIER) / 2;
  const rise = (width * Math.sqrt(3)) / 2;
  for (let i = 0; i < ARCH_BANDS; i++) {
    const y = (rise * (i + 0.5)) / ARCH_BANDS;
    // Each half of the arch springs from a circle centred on the opposite jamb.
    const half = Math.sqrt(width ** 2 - y ** 2) - width / 2;
    band(
      ARCH_SPRING + (rise * i) / ARCH_BANDS,
      ARCH_SPRING + (rise * (i + 1)) / ARCH_BANDS,
      center - half,
      center + half,
    );
  }
  pieces.push({ ...v, base: ARCH_SPRING + rise });
  return pieces;
}
