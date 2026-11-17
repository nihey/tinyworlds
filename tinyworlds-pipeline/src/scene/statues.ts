import type { StatuePiece } from "../cities/types.js";
import { turnGrid } from "../projection.js";
import { disc } from "./medieval.js";

/**
 * A statue piece's footprint, in the view's grid metres. `p`, `q` is the statue's spot on the
 * view's grid; the piece's offset and box are written along the city's street grid, so they are
 * turned by `turnDeg` (the view's bearing less the grid's) to stand the same way on the ground.
 */
export function statueRing(piece: StatuePiece, p: number, q: number, turnDeg: number): number[] {
  const [dp, dq] = turnGrid(piece.dp, piece.dq, turnDeg);
  const pc = p + dp;
  const qc = q + dq;
  if ("r" in piece) return disc(pc, qc, piece.r, 8);
  const ring: number[] = [];
  for (const [sp, sq] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const [cp, cq] = turnGrid(sp * piece.hp, sq * piece.hq, turnDeg);
    ring.push(pc + cp, qc + cq);
  }
  return ring;
}
