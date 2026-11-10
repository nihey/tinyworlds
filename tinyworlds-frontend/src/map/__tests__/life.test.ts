import { describe, expect, it } from "vitest";
import { flightDistance, headingOf, HEADINGS, poseAt, type Pose, type Track } from "../life";

// an L-shaped route: 100 px right, then 50 px down the screen (which is 100 px of ground)
const track: Track = {
  pts: Float32Array.from([0, 0, 100, 0, 100, 50]),
  cum: Float32Array.from([0, 100, 200]),
  length: 200,
  minX: 0,
  minY: 0,
  maxX: 100,
  maxY: 50,
};
const pose = (): Pose => ({ x: 0, y: 0, dx: 0, dy: 0 });

describe("poseAt", () => {
  it("interpolates along the first leg", () => {
    const p = poseAt(track, 25, pose());
    expect(p.x).toBeCloseTo(25);
    expect(p.y).toBeCloseTo(0);
    expect(p.dx).toBeGreaterThan(0);
  });

  it("turns the corner and halves vertical travel on screen", () => {
    const p = poseAt(track, 150, pose());
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(25);
    expect(p.dy).toBeGreaterThan(0);
  });

  it("clamps at both ends", () => {
    expect(poseAt(track, -10, pose()).x).toBeCloseTo(0);
    expect(poseAt(track, 999, pose()).y).toBeCloseTo(50);
  });
});

describe("poseAt with altitudes", () => {
  // a plane coming down the same route: 300 m up, 100 m at the corner, on the ground at the end
  const approach: Track = { ...track, alt: Float32Array.from([300, 100, 0]) };

  it("is on the ground when the track has no altitudes", () => {
    expect(poseAt(track, 50, pose()).alt).toBe(0);
  });

  it("descends evenly between points", () => {
    expect(poseAt(approach, 0, pose()).alt).toBeCloseTo(300);
    expect(poseAt(approach, 50, pose()).alt).toBeCloseTo(200);
    expect(poseAt(approach, 150, pose()).alt).toBeCloseTo(50);
    expect(poseAt(approach, 200, pose()).alt).toBeCloseTo(0);
  });
});

describe("flightDistance", () => {
  it("goes round a circuit forever", () => {
    expect(flightDistance(200, 10, true, 0, 0, 0)).toBeCloseTo(0);
    expect(flightDistance(200, 10, true, 0, 0, 5)).toBeCloseTo(50);
    expect(flightDistance(200, 10, true, 0, 0, 25)).toBeCloseTo(50);
    expect(flightDistance(200, 10, true, 0, 0.5, 5)).toBeCloseTo(150);
  });

  it("flies a one-way route, stays out of sight for the pause, then flies it again", () => {
    // 20 s in the air, 10 s away
    expect(flightDistance(200, 10, false, 10, 0, 5)).toBeCloseTo(50);
    expect(flightDistance(200, 10, false, 10, 0, 20)).toBeCloseTo(200);
    expect(flightDistance(200, 10, false, 10, 0, 24)).toBe(-1);
    expect(flightDistance(200, 10, false, 10, 0, 35)).toBeCloseTo(50);
  });

  it("is nowhere on a track that cannot be flown", () => {
    expect(flightDistance(0, 10, true, 0, 0, 5)).toBe(-1);
    expect(flightDistance(200, 0, false, 10, 0, 5)).toBe(-1);
  });
});

describe("headingOf", () => {
  it("counts sixteen headings clockwise from screen-right", () => {
    expect(headingOf(1, 0)).toBe(0);
    expect(headingOf(0, 1)).toBe(HEADINGS / 4);
    expect(headingOf(-1, 0)).toBe(HEADINGS / 2);
    expect(headingOf(0, -1)).toBe((HEADINGS * 3) / 4);
  });

  it("reads a 2:1 street diagonal as 45° on the ground", () => {
    expect(headingOf(2, 1)).toBe(HEADINGS / 8);
    expect(headingOf(2, -1)).toBe((HEADINGS * 7) / 8);
  });
});
