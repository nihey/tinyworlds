import { describe, expect, it } from "vitest";
import { readCell } from "../cell";
import { WalkDataError, decodeCell } from "../format";

type Spec = [name: string, type: "u8" | "u16" | "i16" | "u32" | "i32", values: number[]];
const SIZE = { u8: 1, u16: 2, i16: 2, u32: 4, i32: 4 };

/** Bytes laid out as the pipeline's encoder does it. */
function encode(i: number, j: number, specs: Spec[]): Uint8Array {
  const header = new TextEncoder().encode(
    JSON.stringify({ v: 1, i, j, arrays: specs.map(([n, t, v]) => [n, t, v.length]) }),
  );
  let at = (4 + header.length + 3) & ~3;
  const start = at;
  for (const [, t, v] of specs) at = (at + v.length * SIZE[t] + 3) & ~3;
  const out = new Uint8Array(at);
  const view = new DataView(out.buffer);
  view.setUint32(0, header.length, true);
  out.set(header, 4);
  at = start;
  for (const [, t, v] of specs) {
    v.forEach((x, k) => {
      const o = at + k * SIZE[t];
      if (t === "u8") view.setUint8(o, x);
      else if (t === "u16") view.setUint16(o, x, true);
      else if (t === "i16") view.setInt16(o, x, true);
      else if (t === "u32") view.setUint32(o, x, true);
      else view.setInt32(o, x, true);
    });
    at = (at + v.length * SIZE[t] + 3) & ~3;
  }
  return out;
}

describe("readCell", () => {
  it("turns local dm into world metres", () => {
    // square (2, -1): origin (400, -200)
    const raw = encode(2, -1, [
      ["vol.rings", "u16", [1, 2]],
      ["vol.verts", "u16", [4, 3, 3]],
      [
        "vol.xy",
        "i16",
        [0, 0, 100, 0, 100, 100, 0, 100, 10, 10, 20, 10, 20, 20, 30, 30, 40, 30, 40, 40],
      ],
      ["vol.base", "u16", [0, 60]],
      ["vol.top", "u16", [300, 90]],
      ["vol.roofH", "u16", [5, 0]],
      ["vol.roofShape", "u8", [1, 0]],
      ["vol.wall", "u8", [2, 0]],
      ["vol.roof", "u8", [3, 0]],
      ["vol.glass", "u8", [4, 0]],
      ["vol.pattern", "u8", [5, 0]],
      ["vol.flags", "u8", [6, 0]],
      ["vol.seed", "u32", [99, 7]],
      ["tree.xy", "i16", [50, 60]],
      ["tree.kind", "u8", [3]],
      ["mask", "u8", [0]],
    ]);
    const c = readCell(decodeCell(raw));
    expect(c.key).toBe("2_-1");
    expect(c.volumes).toHaveLength(2);
    const [a, b] = c.volumes;
    const vol2Rings = b.rings.length;
    expect(a.rings).toHaveLength(1);
    expect(vol2Rings).toBe(2);
    expect(Array.from(a.rings[0])).toEqual([400, -200, 410, -200, 410, -190, 400, -190]);
    expect(a.base).toBe(0);
    expect(a.top).toBe(30);
    expect(a.roofH).toBe(0.5);
    expect([a.roofShape, a.wall, a.roof, a.glass, a.pattern, a.flags, a.seed]).toEqual([
      1, 2, 3, 4, 5, 6, 99,
    ]);
    expect(a.box).toEqual([400, -200, 410, -190]);
    expect(b.base).toBe(6);
    expect(b.top).toBe(9);
    expect(Array.from(b.rings[0])).toEqual([401, -199, 402, -199, 402, -198]);
    expect(Array.from(c.trees)).toEqual([405, -194, 3]);
    expect(c.mask).toEqual({ mode: 0, bits: null });
    expect(c.shore).toBeNull();
  });

  it("reads a mixed mask and the shore", () => {
    const mask = [2, ...new Array(1250).fill(0)];
    mask[1] = 0b101;
    const c = readCell(
      decodeCell(
        encode(0, 0, [
          ["mask", "u8", mask],
          ["shore", "u8", new Array(10000).fill(3)],
        ]),
      ),
    );
    expect(c.mask.mode).toBe(2);
    expect(c.mask.bits![0]).toBe(5);
    expect(c.shore).toHaveLength(10000);
  });

  it("reads the network in world metres", () => {
    const c = readCell(
      decodeCell(
        encode(1, 0, [
          ["node.id", "u32", [7, 8]],
          ["node.xyz", "i32", [2100, 100, 0, 2500, 100, 70]],
          ["node.flags", "u8", [1, 2]],
          ["node.bearing", "u8", [128, 0]],
          ["st.a", "u32", [7, 8, 7]],
          ["st.b", "u32", [8, 7, 8]],
          ["st.cls", "u8", [2, 5, 0]],
          ["st.flags", "u8", [0b1011, 0b100, 0]],
          ["st.width", "u16", [120, 80, 60]],
          ["st.verts", "u16", [2, 2, 2]],
          [
            "st.xyz",
            "i32",
            [2100, 100, 0, 2500, 100, 0, 2500, 100, 70, 2100, 100, 0, 0, 0, 0, 30, 40, 0],
          ],
          ["wk.a", "u32", [7]],
          ["wk.b", "u32", [8]],
          ["wk.flags", "u8", [0b1101]],
          ["wk.verts", "u16", [2]],
          ["wk.xyz", "i32", [2100, 100, 0, 2500, 100, 0]],
          ["elev.kind", "u8", [1]],
          ["elev.width", "u16", [40]],
          ["elev.verts", "u16", [2]],
          ["elev.xyz", "i32", [2100, 100, 70, 2500, 100, 70]],
          ["elev.own", "u8", [1, 0]],
          ["moor.xy", "i32", [2200, 300]],
          ["moor.heading", "u8", [255]],
          ["moor.kind", "u8", [1]],
          ["cab.verts", "u16", [2]],
          ["cab.kind", "u8", [4]],
          ["cab.xyz", "i32", [2100, 100, 80, 2200, 100, 90]],
        ]),
      ),
    );
    expect(c.nodes[0]).toMatchObject({ id: 7, e: 210, n: 10, z: 0, lights: true, portal: false });
    expect(c.nodes[0].bearing).toBeCloseTo((128 / 255) * Math.PI, 10);
    expect(c.nodes[1]).toMatchObject({ z: 7, lights: false, portal: true, bearing: 0 });
    const [s0, s1, s2] = c.streets;
    expect(s0).toMatchObject({
      key: "7-8",
      cls: 2,
      link: true,
      ow: 1,
      elevated: true,
      width: 12,
      length: 40,
    });
    expect(s1).toMatchObject({ link: false, ow: -1, elevated: false, width: 8 });
    expect(s2.length).toBe(5);
    expect(c.walks[0]).toMatchObject({
      key: "7-8",
      crosswalk: true,
      phase: 2,
      elevated: true,
      length: 40,
    });
    expect(c.elevated[0]).toMatchObject({ kind: 1, width: 4 });
    expect(Array.from(c.elevated[0].pts)).toEqual([210, 10, 7, 250, 10, 7]);
    expect(Array.from(c.elevated[0].own)).toEqual([1, 0]);
    expect(c.moorings[0]).toMatchObject({ e: 220, n: 30, kind: "motorboat" });
    expect(c.moorings[0].heading).toBeCloseTo(2 * Math.PI, 10);
    expect(c.cables[0].kind).toBe(4);
    expect(Array.from(c.cables[0].pts)).toEqual([210, 10, 8, 220, 10, 9]);
  });

  it("reads an empty square", () => {
    const c = readCell(decodeCell(encode(0, 0, [])));
    expect(c.volumes).toEqual([]);
    expect(c.mask.mode).toBe(0);
  });

  it("throws on arrays that disagree", () => {
    const raw = encode(0, 0, [
      ["vol.rings", "u16", [1]],
      ["vol.verts", "u16", [3]],
      ["vol.xy", "i16", [0, 0, 1, 1, 2, 2]],
    ]);
    expect(() => readCell(decodeCell(raw))).toThrow(WalkDataError);
  });
});
