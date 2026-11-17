import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import {
  actionsOf,
  defaultBindings,
  keyLabel,
  loadBindings,
  rebind,
  saveBindings,
  STORAGE_KEY,
} from "../controls";

describe("default bindings", () => {
  it("are the usual keys of a street game", () => {
    const d = defaultBindings();
    expect(d.forward).toEqual(["KeyW", "ArrowUp"]);
    expect(d.left).toEqual(["KeyA", null]);
    expect(d.turnLeft).toEqual(["ArrowLeft", null]);
    expect(d.sprint).toEqual(["ShiftLeft", "ShiftRight"]);
    expect(d.jump).toEqual(["Space", null]);
    expect(d.enter).toEqual(["KeyF", null]);
    expect(d.accelerate).toEqual(["KeyW", "ArrowUp"]);
    expect(d.steerLeft).toEqual(["KeyA", "ArrowLeft"]);
    expect(d.handbrake).toEqual(["Space", null]);
    expect(d.horn).toEqual(["KeyE", null]);
    expect(d.exit).toEqual(["KeyF", null]);
    expect(d.camera).toEqual(["KeyV", null]);
    expect(d.lookBehind).toEqual(["KeyC", null]);
    expect(d.map).toEqual(["KeyM", null]);
    expect(d.menu).toEqual(["KeyP", null]);
    expect(d.pixelDown).toEqual(["BracketLeft", null]);
    expect(d.pixelUp).toEqual(["BracketRight", null]);
  });
});

describe("rebind", () => {
  it("takes a key from the group's other actions only, and leaves its input untouched", () => {
    const d = defaultBindings();
    const b = rebind(d, "jump", 0, "KeyE");
    expect(b.jump[0]).toBe("KeyE");
    expect(b.horn).toEqual(["KeyE", null]);
    expect(d.jump[0]).toBe("Space");
  });

  it("takes the key from the group's holder", () => {
    const b = rebind(defaultBindings(), "jump", 0, "KeyF");
    expect(b.enter).toEqual([null, null]);
    expect(b.exit).toEqual(["KeyF", null]);
  });

  it("gives an always-live key to nobody else", () => {
    const b = rebind(defaultBindings(), "map", 0, "KeyW");
    expect(b.forward).toEqual([null, "ArrowUp"]);
    expect(b.accelerate).toEqual([null, "ArrowUp"]);
    expect(b.map[0]).toBe("KeyW");
  });

  it("never puts one key in both slots of an action", () => {
    const b = rebind(defaultBindings(), "forward", 0, "ArrowUp");
    expect(b.forward).toEqual(["ArrowUp", null]);
  });
});

describe("loadBindings", () => {
  it("falls back to the defaults when storage throws, is empty or is garbage", () => {
    const d = defaultBindings();
    expect(
      loadBindings({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toEqual(d);
    expect(loadBindings({ getItem: () => "{" })).toEqual(d);
    expect(loadBindings({ getItem: () => "[1]" })).toEqual(d);
    expect(loadBindings({ getItem: () => null })).toEqual(d);
    expect(loadBindings(null)).toEqual(d);
  });

  it("keeps what is known, drops what is not and fills the rest", () => {
    const b = loadBindings({
      getItem: (k) =>
        k === STORAGE_KEY ? JSON.stringify({ jump: ["KeyJ", null], fly: ["KeyX", null] }) : null,
    });
    expect(b.jump).toEqual(["KeyJ", null]);
    expect(b).not.toHaveProperty("fly");
    expect({ ...b, jump: ["Space", null] }).toEqual(defaultBindings());
  });

  it("ignores a slot that is not a key", () => {
    const b = loadBindings({ getItem: () => JSON.stringify({ jump: [3, "KeyJ"] }) });
    expect(b.jump).toEqual([null, "KeyJ"]);
  });

  it("never binds one key to two actions that are live together, whatever the store says", () => {
    // edited by hand: J for walking and for jumping, M for the map and for steering
    const b = loadBindings({
      getItem: () =>
        JSON.stringify({
          forward: ["KeyJ", "ArrowUp"],
          jump: ["KeyJ", "KeyJ"],
          steerLeft: ["KeyM", "ArrowLeft"],
          sprint: ["ShiftLeft", "ShiftLeft"],
        }),
    });
    for (const group of ["foot", "drive"] as const)
      for (const code of ["KeyJ", "KeyM", "ShiftLeft", "KeyW", "Space"])
        expect(actionsOf(b, code, group).length, `${code} ${group}`).toBeLessThanOrEqual(1);
    // a key never sits in both slots of one action
    for (const [first, second] of Object.values(b)) if (first) expect(second).not.toBe(first);
    expect(b.sprint).toEqual(["ShiftLeft", null]);
  });

  it("keeps the defaults as they are", () => {
    expect(loadBindings({ getItem: () => JSON.stringify(defaultBindings()) })).toEqual(
      defaultBindings(),
    );
  });
});

describe("saveBindings", () => {
  it("writes JSON under its key", () => {
    const seen: string[][] = [];
    saveBindings({ setItem: (k, v) => void seen.push([k, v]) }, defaultBindings());
    expect(seen[0][0]).toBe("tinyworlds.walk.controls.v1");
    expect(JSON.parse(seen[0][1]).jump).toEqual(["Space", null]);
  });

  it("does not throw when storage does", () => {
    expect(() =>
      saveBindings(
        {
          setItem: () => {
            throw new Error("full");
          },
        },
        defaultBindings(),
      ),
    ).not.toThrow();
    expect(() => saveBindings(null, defaultBindings())).not.toThrow();
  });
});

describe("actionsOf", () => {
  it("lists a mode's actions for a key, and the always-live ones", () => {
    const d = defaultBindings();
    expect(actionsOf(d, "Space", "drive")).toEqual(["handbrake"]);
    expect(actionsOf(d, "Space", "foot")).toEqual(["jump"]);
    expect(actionsOf(d, "KeyW", "drive")).toEqual(["accelerate"]);
    expect(actionsOf(d, "KeyM", "foot")).toEqual(["map"]);
    expect(actionsOf(d, "KeyE", "foot")).toEqual([]);
  });
});

describe("keyLabel", () => {
  it("prints keys as they are on a sign", () => {
    expect(keyLabel("KeyW", en.walk.keys)).toBe("W");
    expect(keyLabel("Digit4", en.walk.keys)).toBe("4");
    expect(keyLabel("Numpad7", en.walk.keys)).toBe("Num 7");
    expect(keyLabel("ShiftLeft", en.walk.keys)).toBe(en.walk.keys.leftShift);
    expect(keyLabel("ArrowUp", en.walk.keys)).toBe(en.walk.keys.up);
    expect(keyLabel("BracketLeft", en.walk.keys)).toBe("[");
    expect(keyLabel("Backslash", en.walk.keys)).toBe("\\");
    expect(keyLabel("F5", en.walk.keys)).toBe("F5");
  });
});
