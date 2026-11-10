import { describe, expect, it } from "vitest";
import { bitAt, decodeBitset } from "../bitset";

describe("bitset", () => {
  it("decodes base64 into bytes", () => {
    // bytes 0b00000101, 0b10000000
    const bits = decodeBitset(Buffer.from([0x05, 0x80]).toString("base64"));
    expect([...bits]).toEqual([0x05, 0x80]);
  });

  it("reads bits LSB-first", () => {
    const bits = decodeBitset(Buffer.from([0x05, 0x80]).toString("base64"));
    const set = Array.from({ length: 16 }, (_, i) => bitAt(bits, i));
    expect(set.map((b, i) => (b ? i : -1)).filter((i) => i >= 0)).toEqual([0, 2, 15]);
  });

  it("treats out-of-range bits as unset", () => {
    const bits = decodeBitset(Buffer.from([0xff]).toString("base64"));
    expect(bitAt(bits, 8)).toBe(false);
    expect(bitAt(bits, -1)).toBe(false);
    expect(bitAt(decodeBitset(""), 0)).toBe(false);
  });
});
