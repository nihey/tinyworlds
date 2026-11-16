import { describe, expect, it } from "vitest";
import { fallDamage } from "../health";
import { newPlayer, SWIM, SPRINT, stepFoot, WALK, type FootInput, type Player } from "../player";
import { WalkWorld } from "../world";
import type { WalkIndex } from "../walk-index";
import { boxVolume, deckWay, makeCell, waterRect } from "./fixtures";

const none: FootInput = { forward: 0, strafe: 0, turn: 0, sprint: false, jump: false };
const fwd: FootInput = { ...none, forward: 1 };
const EAST = Math.PI / 2;

function world(...cells: ReturnType<typeof makeCell>[]) {
  const w = new WalkWorld({} as WalkIndex);
  for (const c of cells) w.add(c);
  return w;
}

function run(p: Player, input: FootInput, w: WalkWorld, seconds: number, jumpOnce = false) {
  const ev = { hurt: 0, splashed: false, landed: null as string | null };
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) {
    const e = stepFoot(p, jumpOnce && t > 0 ? { ...input, jump: false } : input, w, 1 / 60);
    ev.hurt += e.hurt;
    ev.splashed ||= e.splashed;
    ev.landed = e.landed ?? ev.landed;
  }
  return ev;
}

describe("walking", () => {
  it("moves 4.5 m in a second along the yaw, 11 sprinting", () => {
    const w = world(makeCell(0, 0));
    const p = newPlayer(20, 20, 0, EAST);
    run(p, fwd, w, 1);
    expect(p.e - 20).toBeCloseTo(WALK, 1);
    expect(p.n).toBeCloseTo(20, 3);
    const q = newPlayer(20, 20, 0, 0);
    run(q, { ...fwd, sprint: true }, w, 1);
    expect(q.n - 20).toBeCloseTo(SPRINT, 1);
  });

  it("strafes to the right of the yaw and turns with the arrow keys", () => {
    const w = world(makeCell(0, 0));
    const p = newPlayer(20, 20, 0, 0);
    run(p, { ...none, strafe: 1 }, w, 1);
    expect(p.e - 20).toBeCloseTo(WALK, 1);
    const q = newPlayer(20, 20, 0, 0);
    run(q, { ...none, turn: 1 }, w, 1);
    expect(q.yaw).toBeCloseTo(2.2, 2);
  });

  it("steps onto a curb but is stopped by a wall", () => {
    const w = world(makeCell(0, 0, { volumes: [boxVolume(30, 0, 40, 100)] }));
    const p = newPlayer(20, 20, 0, EAST);
    run(p, fwd, w, 5);
    expect(p.e).toBeLessThan(30);
  });

  it("never passes a wall in a long frame", () => {
    const w = world(makeCell(0, 0, { volumes: [boxVolume(21, 0, 30, 100)] }));
    const p = newPlayer(20, 20, 0, EAST);
    stepFoot(p, { ...fwd, sprint: true }, w, 5);
    expect(p.e).toBeLessThan(21);
  });
});

describe("jumping and falling", () => {
  it("lands after about 0.8 s on flat ground, unhurt", () => {
    const w = world(makeCell(0, 0));
    const p = newPlayer(20, 20, 0, 0);
    stepFoot(p, { ...none, jump: true }, w, 1 / 60);
    let t = 1 / 60;
    while (p.airFrom !== null && t < 3) {
      stepFoot(p, none, w, 1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeGreaterThan(0.75);
    expect(t).toBeLessThan(0.9);
    expect(p.z).toBe(0);
    expect(p.life).toBe(100);
  });

  it("lands on a 1.1 m roof but not a 1.3 m one", () => {
    for (const [roof, expected] of [
      [1.1, 1.1],
      [1.3, 0],
    ]) {
      const w = world(makeCell(0, 0));
      w.roofs = (e) => (e >= 22 ? roof : null);
      const p = newPlayer(20, 20, 0, EAST);
      run(p, { ...fwd, jump: true }, w, 1.5, true);
      expect(p.z).toBeCloseTo(expected, 3);
      if (roof > 1.2) expect(p.e).toBeLessThan(22);
      else expect(p.e).toBeGreaterThanOrEqual(22);
    }
  });

  it("hurts by the fall's damage when stepping off a 10 m deck", () => {
    const w = world(
      makeCell(0, 0, {
        elevated: [
          deckWay([
            [0, 50, 10],
            [60, 50, 10],
          ]),
        ],
      }),
    );
    const p = newPlayer(60, 50, 10, EAST);
    const ev = run(p, fwd, w, 4);
    expect(ev.hurt).toBeCloseTo(fallDamage(10, "ground"), 1);
    expect(p.life).toBeCloseTo(100 - fallDamage(10, "ground"), 1);
    expect(p.z).toBe(0);
    expect(p.sinceHurt).toBeLessThan(3);
  });

  it("is killed by a 20 m fall", () => {
    const w = world(
      makeCell(0, 0, {
        elevated: [
          deckWay([
            [0, 50, 20],
            [60, 50, 20],
          ]),
        ],
      }),
    );
    const p = newPlayer(60, 50, 20, EAST);
    run(p, fwd, w, 6);
    expect(p.life).toBe(0);
  });
});

describe("water", () => {
  const sea = () => world(makeCell(0, 0, { mask: waterRect(0, 0, 100, 0, 200, 200) }));

  it("swims at 1.6 m/s with the feet at the surface, and cannot jump", () => {
    const w = sea();
    const p = newPlayer(98, 100, 0, EAST);
    const ev = run(p, fwd, w, 1.5);
    expect(ev.splashed).toBe(true);
    expect(p.mode).toBe("swim");
    expect(p.z).toBeCloseTo(-0.6);
    expect(p.life).toBe(100);
    const e0 = p.e;
    run(p, fwd, w, 1);
    expect(p.e - e0).toBeCloseTo(SWIM, 1);
    run(p, { ...fwd, jump: true }, w, 0.5);
    expect(p.z).toBeCloseTo(-0.6);
  });

  it("lands in water from a height unhurt", () => {
    const w = world(
      makeCell(0, 0, {
        mask: waterRect(0, 0, 100, 0, 200, 200),
        elevated: [
          deckWay([
            [0, 100, 20],
            [120, 100, 20],
          ]),
        ],
      }),
    );
    const p = newPlayer(110, 100, 20, 0);
    p.e = 110;
    // step off the deck's side into the water below
    p.n = 100 + 6;
    run(p, none, w, 3);
    expect(p.life).toBe(100);
    expect(p.mode).toBe("swim");
  });

  it("climbs out against a 0.6 m quay", () => {
    const w = sea();
    const p = newPlayer(103, 100, 0, EAST + Math.PI);
    p.mode = "swim";
    p.z = -0.6;
    run(p, fwd, w, 2);
    expect(p.mode).toBe("foot");
    expect(p.z).toBe(0);
    expect(p.e).toBeLessThan(100);
  });

  it("will not climb a quay that stands higher than 0.8 m above the water", () => {
    const w = world();
    w.add(
      makeCell(0, 0, {
        mask: waterRect(0, 0, 100, 0, 200, 200),
        volumes: [boxVolume(0, 0, 100, 200, 0, 1.5)],
      }),
    );
    const p = newPlayer(103, 100, -0.6, EAST + Math.PI);
    p.mode = "swim";
    run(p, fwd, w, 3);
    expect(p.mode).toBe("swim");
    expect(p.e).toBeGreaterThanOrEqual(99);
  });
});

describe("other modes", () => {
  it("does nothing while driving or down", () => {
    const w = world(makeCell(0, 0));
    const p = newPlayer(20, 20, 0, 0);
    p.mode = "down";
    expect(stepFoot(p, fwd, w, 1)).toEqual({ hurt: 0, landed: null, splashed: false });
    expect(p.n).toBe(20);
  });
});
