/**
 * How aggressively to fetch tiles, given the link and whether the view is moving.
 * Samples come from finished tile downloads; the browser's connection hint fills the gap
 * before any sample is in.
 */

export interface ConnectionHint {
  effectiveType?: string;
  downlinkMbps?: number;
  rttMs?: number;
}

export interface LoadPolicy {
  /** in-flight tile downloads */
  maxLoads: number;
  /** tiles of prefetch around the view */
  ring: number;
  /** while moving, skip native tiles and only keep a stand-in */
  deferNative: boolean;
  /** a download nobody has asked for in this long is cancelled */
  staleMs: number;
}

export const FAST_POLICY: LoadPolicy = {
  maxLoads: 12,
  ring: 1,
  deferNative: false,
  staleMs: 700,
};

export const MID_POLICY: LoadPolicy = {
  maxLoads: 6,
  ring: 1,
  deferNative: false,
  staleMs: 700,
};

export const SLOW_POLICY: LoadPolicy = {
  maxLoads: 3,
  ring: 0,
  deferNative: false,
  staleMs: 500,
};

export const CRAWL_POLICY: LoadPolicy = {
  maxLoads: 2,
  ring: 0,
  deferNative: false,
  staleMs: 400,
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** A link that can take many 512 px tiles at once (local disk, or a fat pipe). */
export function isLocalHost(hostname: string | undefined): boolean {
  if (!hostname) return false;
  return LOCAL_HOSTS.has(hostname);
}

export function initialPolicy(hostname?: string, connection?: ConnectionHint | null): LoadPolicy {
  if (isLocalHost(hostname)) return { ...FAST_POLICY };
  const type = connection?.effectiveType;
  if (type === "slow-2g" || type === "2g") return { ...CRAWL_POLICY };
  if (type === "3g") return { ...SLOW_POLICY };
  const rtt = connection?.rttMs;
  const down = connection?.downlinkMbps;
  if (typeof rtt === "number" && rtt >= 300) return { ...CRAWL_POLICY };
  if (typeof down === "number" && down > 0 && down < 0.7) return { ...CRAWL_POLICY };
  if (typeof down === "number" && down < 2) return { ...SLOW_POLICY };
  if (type === "4g" || (typeof down === "number" && down >= 5)) return { ...MID_POLICY };
  return { ...MID_POLICY };
}

export interface NetworkEstimate {
  /** exponential moving average, bytes / second; 0 if unknown */
  bytesPerSec: number;
  /** exponential moving average of whole-request time, ms; 0 if unknown */
  rttMs: number;
  samples: number;
}

export function emptyEstimate(): NetworkEstimate {
  return { bytesPerSec: 0, rttMs: 0, samples: 0 };
}

/** Fold one finished download into the running estimate. */
export function addSample(
  estimate: NetworkEstimate,
  bytes: number,
  durationMs: number,
): NetworkEstimate {
  // a tiny overview tile is mostly latency; it would make a fat local link look slow
  if (!(bytes >= 40_000) || !(durationMs > 0)) return estimate;
  const bps = (bytes * 1000) / durationMs;
  const a = estimate.samples === 0 ? 1 : 0.35;
  return {
    bytesPerSec: estimate.bytesPerSec === 0 ? bps : estimate.bytesPerSec * (1 - a) + bps * a,
    rttMs: estimate.rttMs === 0 ? durationMs : estimate.rttMs * (1 - a) + durationMs * a,
    samples: estimate.samples + 1,
  };
}

/**
 * Pick a policy from the estimate (once we have a sample) or the initial guess.
 * `speed` is the view's motion in CSS px per second; above the threshold a slow
 * link stays on coarser tiles until the view settles.
 */
export function policyFor(
  initial: LoadPolicy,
  estimate: NetworkEstimate,
  moving: boolean,
  speed: number,
): LoadPolicy {
  // `initial` is a clean template (FAST/MID/…), never a previous output with the ring already off
  let base = initial;
  if (estimate.samples >= 1) {
    const bps = estimate.bytesPerSec;
    const rtt = estimate.rttMs;
    if (bps >= 2_000_000 && rtt <= 80) base = FAST_POLICY;
    else if (bps >= 400_000 && rtt <= 200) base = MID_POLICY;
    else if (bps >= 80_000) base = SLOW_POLICY;
    else base = CRAWL_POLICY;
  }
  const deferNative = moving && speed >= 700 && base.maxLoads <= 6;
  const ring = deferNative ? 0 : base.ring;
  return { ...base, deferNative, ring };
}

/**
 * How many extra tiles to fetch ahead of a pan, in each grid direction.
 * `vx`/`vy` are CSS px per second (right and down positive).
 */
export function aheadTiles(
  ring: number,
  vx: number,
  vy: number,
): { aheadTx: number; aheadTy: number } {
  if (ring <= 0) return { aheadTx: 0, aheadTy: 0 };
  const speed = Math.hypot(vx, vy);
  if (speed < 200) return { aheadTx: 0, aheadTy: 0 };
  const extra = speed >= 1400 ? 2 : 1;
  const aheadTx = Math.abs(vx) >= Math.abs(vy) * 0.35 ? Math.sign(vx) * extra : 0;
  const aheadTy = Math.abs(vy) >= Math.abs(vx) * 0.35 ? Math.sign(vy) * extra : 0;
  return { aheadTx, aheadTy };
}
