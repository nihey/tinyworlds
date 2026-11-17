import type { Strings } from "@/i18n/types";

export type ActionId =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "turnLeft"
  | "turnRight"
  | "sprint"
  | "jump"
  | "enter"
  | "accelerate"
  | "brake"
  | "steerLeft"
  | "steerRight"
  | "handbrake"
  | "horn"
  | "exit"
  | "camera"
  | "lookBehind"
  | "map"
  | "menu"
  | "pixelDown"
  | "pixelUp";

/** On foot, at the wheel (or helm), or in both. */
export type Group = "foot" | "drive" | "any";

/** Every action, in the controls menu's order. */
export const ACTIONS: readonly { id: ActionId; group: Group }[] = [
  { id: "forward", group: "foot" },
  { id: "back", group: "foot" },
  { id: "left", group: "foot" },
  { id: "right", group: "foot" },
  { id: "turnLeft", group: "foot" },
  { id: "turnRight", group: "foot" },
  { id: "sprint", group: "foot" },
  { id: "jump", group: "foot" },
  { id: "enter", group: "foot" },
  { id: "accelerate", group: "drive" },
  { id: "brake", group: "drive" },
  { id: "steerLeft", group: "drive" },
  { id: "steerRight", group: "drive" },
  { id: "handbrake", group: "drive" },
  { id: "horn", group: "drive" },
  { id: "exit", group: "drive" },
  { id: "camera", group: "drive" },
  { id: "lookBehind", group: "drive" },
  { id: "map", group: "any" },
  { id: "menu", group: "any" },
  { id: "pixelDown", group: "any" },
  { id: "pixelUp", group: "any" },
];

/** `KeyboardEvent.code`s: two keys per action, so a layout's quirks never lock anyone out. */
export type Bindings = Record<ActionId, [string | null, string | null]>;

export const STORAGE_KEY = "tinyworlds.walk.controls.v1";

const GROUP_OF = Object.fromEntries(ACTIONS.map((a) => [a.id, a.group])) as Record<ActionId, Group>;

export function defaultBindings(): Bindings {
  return {
    forward: ["KeyW", "ArrowUp"],
    back: ["KeyS", "ArrowDown"],
    left: ["KeyA", null],
    right: ["KeyD", null],
    turnLeft: ["ArrowLeft", null],
    turnRight: ["ArrowRight", null],
    sprint: ["ShiftLeft", "ShiftRight"],
    jump: ["Space", null],
    enter: ["KeyF", null],
    accelerate: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    steerLeft: ["KeyA", "ArrowLeft"],
    steerRight: ["KeyD", "ArrowRight"],
    handbrake: ["Space", null],
    horn: ["KeyE", null],
    exit: ["KeyF", null],
    camera: ["KeyV", null],
    lookBehind: ["KeyC", null],
    map: ["KeyM", null],
    menu: ["KeyP", null],
    pixelDown: ["BracketLeft", null],
    pixelUp: ["BracketRight", null],
  };
}

/** Two actions can share a key only if they are never live together. */
const clash = (a: Group, b: Group) => a === "any" || b === "any" || a === b;

/**
 * Gives `code` to one slot of an action and takes it from every action it would clash with: the
 * others of its group and of `any`; an `any` action takes it from all. Returns a new object.
 */
export function rebind(b: Bindings, id: ActionId, slot: 0 | 1, code: string): Bindings {
  const next = {} as Bindings;
  for (const { id: other } of ACTIONS) {
    const [x, y] = b[other];
    if (other === id) {
      // the same key never sits in both slots of one action
      const mine: [string | null, string | null] = [x, y];
      mine[slot === 0 ? 1 : 0] =
        mine[slot === 0 ? 1 : 0] === code ? null : mine[slot === 0 ? 1 : 0];
      mine[slot] = code;
      next[other] = mine;
    } else if (clash(GROUP_OF[id], GROUP_OF[other])) {
      next[other] = [x === code ? null : x, y === code ? null : y];
    } else next[other] = [x, y];
  }
  return next;
}

/** The actions `code` triggers in a mode: that group's and the always-live ones. */
export function actionsOf(b: Bindings, code: string, group: "foot" | "drive"): ActionId[] {
  return ACTIONS.filter(
    (a) => (a.group === group || a.group === "any") && (b[a.id][0] === code || b[a.id][1] === code),
  ).map((a) => a.id);
}

/**
 * What was kept, or the defaults: storage may be blocked, empty or edited by hand. What was kept
 * is given out again key by key through `rebind`, in the menu's order, so a store edited by hand
 * cannot leave one key on two actions that are live together: the later one keeps it.
 */
export function loadBindings(storage: Pick<Storage, "getItem"> | null): Bindings {
  const kept = defaultBindings();
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return kept;
    const saved: unknown = JSON.parse(raw);
    if (typeof saved !== "object" || saved === null || Array.isArray(saved)) return kept;
    const slotOf = (v: unknown) => (typeof v === "string" && v ? v : null);
    for (const { id } of ACTIONS) {
      const pair = (saved as Record<string, unknown>)[id];
      if (Array.isArray(pair)) kept[id] = [slotOf(pair[0]), slotOf(pair[1])];
    }
    let out = Object.fromEntries(ACTIONS.map((a) => [a.id, [null, null]])) as Bindings;
    for (const { id } of ACTIONS)
      for (const slot of [0, 1] as const) {
        const code = kept[id][slot];
        if (code && !(slot === 1 && code === kept[id][0])) out = rebind(out, id, slot, code);
      }
    return out;
  } catch {
    return defaultBindings();
  }
}

export function saveBindings(storage: Pick<Storage, "setItem"> | null, b: Bindings): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    // blocked storage: the keys last for this visit
  }
}

const NAMED: Record<string, keyof Strings["walk"]["keys"]> = {
  Space: "space",
  ShiftLeft: "leftShift",
  ShiftRight: "rightShift",
  ControlLeft: "leftCtrl",
  ControlRight: "rightCtrl",
  AltLeft: "leftAlt",
  AltRight: "rightAlt",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  Enter: "enter",
  Tab: "tab",
  Backspace: "backspace",
  CapsLock: "capsLock",
};

const PUNCTUATION: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Backquote: "`",
};

/** A key as it is printed on a sign. */
export function keyLabel(code: string, keys: Strings["walk"]["keys"]): string {
  const named = NAMED[code];
  if (named) return keys[named];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  const pad = /^Numpad(\w+)$/.exec(code);
  if (pad) return `Num ${pad[1]}`;
  return PUNCTUATION[code] ?? code;
}
