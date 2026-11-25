import type { Eye } from "./cameras";
import type { Person } from "./people";
import type { WalkWorld } from "./world";

export const SWING_SECONDS = 0.32;
export const CONTACT_SECONDS = 0.075;
const REACH = 2.05;
const WIDTH = 0.44;
const TOP = 1.8;
const SAMPLE = 0.1;

/** The first standing pedestrian along the center of the view, within reach and with a clear path. */
export function punchTarget(
  eye: Eye,
  people: Person[],
  world: Pick<WalkWorld, "blocked">,
): Person | null {
  const east = Math.sin(eye.yaw);
  const north = Math.cos(eye.yaw);
  const level = Math.cos(eye.pitch);
  const rise = Math.sin(eye.pitch);
  let target: Person | null = null;
  let distance = REACH;

  for (const person of people) {
    if (person.state === "down" || person.state === "swimming") continue;
    const de = person.e - eye.e;
    const dn = person.n - eye.n;
    const ahead = de * east + dn * north;
    const side = de * north - dn * east;
    if (ahead <= 0 || ahead > REACH + WIDTH || Math.abs(side) >= WIDTH) continue;

    const half = Math.sqrt(WIDTH * WIDTH - side * side);
    let first = Math.max(0, (ahead - half) / level);
    let last = Math.min(distance, (ahead + half) / level);
    if (Math.abs(rise) < 1e-6) {
      if (eye.z < person.z || eye.z > person.z + TOP) continue;
    } else {
      const foot = (person.z - eye.z) / rise;
      const head = (person.z + TOP - eye.z) / rise;
      first = Math.max(first, Math.min(foot, head));
      last = Math.min(last, Math.max(foot, head));
    }
    if (first > last || (target !== null && first >= distance)) continue;
    distance = first;
    target = person;
  }

  if (!target) return null;
  const samples = Math.max(1, Math.ceil(distance / SAMPLE));
  for (let i = 1; i <= samples; i++) {
    const at = (i / samples) * distance;
    const along = at * level;
    if (
      world.blocked(
        eye.e + east * along,
        eye.n + north * along,
        0.06,
        eye.z + rise * at - 0.08,
        0.16,
      )
    )
      return null;
  }
  return target;
}
