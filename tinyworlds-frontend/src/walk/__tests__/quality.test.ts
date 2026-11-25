import { describe, expect, it } from "vitest";
import { CROWDS, QualityLadder, SLOW_FOR, SLOW_FPS } from "../quality";

/** Feeds `seconds` of frames at `fps`; every step the ladder asks for, in order. */
function run(
  ladder: QualityLadder,
  fps: number,
  seconds: number,
  can = { reflections: true, pixel: 3, pixelChosen: false },
) {
  const steps: string[] = [];
  for (let t = 0; t < seconds; t += 1 / fps) {
    const step = ladder.frame(1 / fps, can);
    if (!step) continue;
    steps.push(step);
    if (step === "reflections") can.reflections = false;
    if (step === "pixel") can.pixel++;
  }
  return steps;
}

describe("the automatic quality", () => {
  it("does nothing while the walk keeps up", () => {
    expect(run(new QualityLadder(), 45, 60)).toEqual([]);
    expect(run(new QualityLadder(), SLOW_FPS + 1, 60)).toEqual([]);
  });

  it("steps down when the frame rate stays under 30 for 3 s: reflections, people and cars twice, then the pixels to 5", () => {
    const ladder = new QualityLadder();
    // one window under 30 is enough, and no step comes before it is over
    expect(run(ladder, 20, SLOW_FOR - 0.1)).toEqual([]);
    const steps = run(new QualityLadder(), 20, 60);
    expect(steps).toEqual(["reflections", "crowd", "crowd", "pixel", "pixel"]);
  });

  it("lowers the crowd 150 → 90 → 60 people and 70 → 45 → 30 cars", () => {
    expect(CROWDS).toEqual([
      { people: 150, cars: 70 },
      { people: 90, cars: 45 },
      { people: 60, cars: 30 },
    ]);
    const ladder = new QualityLadder();
    run(ladder, 20, 60);
    expect(ladder.crowd).toEqual(CROWDS[2]);
  });

  it("passes by what is already off, and leaves pixels the visitor chose", () => {
    const steps = run(new QualityLadder(), 20, 60, {
      reflections: false,
      pixel: 3,
      pixelChosen: true,
    });
    expect(steps).toEqual(["crowd", "crowd"]);
  });

  it("never steps back up, however fast the walk runs afterwards", () => {
    const ladder = new QualityLadder();
    const can = { reflections: true, pixel: 3, pixelChosen: false };
    expect(run(ladder, 20, 7, can)).toEqual(["reflections", "crowd"]);
    expect(run(ladder, 120, 120, can)).toEqual([]);
    expect(ladder.crowd).toEqual(CROWDS[1]);
    expect(can.reflections).toBe(false);
  });

  it("does not count a hidden tab's gap, but counts a slow phone's long frames", () => {
    const ladder = new QualityLadder();
    const can = { reflections: true, pixel: 3, pixelChosen: false };
    // a 5 s gap (the tab was hidden) is no frame
    expect(ladder.frame(5, can)).toBeNull();
    expect(run(ladder, 45, 10, can)).toEqual([]);
    // 4 fps: each frame a quarter of a second, still counted
    expect(run(new QualityLadder(), 4, 4)).toEqual(["reflections"]);
  });

  it("keeps the crowd an earlier walk of the visit left it with", () => {
    const ladder = new QualityLadder(1);
    expect(ladder.crowd).toEqual(CROWDS[1]);
    expect(run(ladder, 20, 60)).toEqual(["reflections", "crowd", "pixel", "pixel"]);
  });
});
