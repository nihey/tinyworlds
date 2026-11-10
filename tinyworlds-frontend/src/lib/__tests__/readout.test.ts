import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "@/i18n";
import { viewReadout } from "../readout";

const EN = DICTIONARIES["en-US"].credit;
const PT = DICTIONARIES["pt-BR"].credit;

describe("viewReadout", () => {
  it("says where the middle of the view is and how far in", () => {
    expect(viewReadout(40.7484, -73.9857, 1.5, EN)).toBe("40.7484° N  73.9857° W  ·  1.5×");
    expect(viewReadout(-21.1775, -47.8103, 0.25, EN)).toBe("21.1775° S  47.8103° W  ·  25%");
  });

  it("writes the numbers the way the language does", () => {
    expect(viewReadout(-21.1775, -47.8103, 2, PT)).toBe("21,1775° S  47,8103° O  ·  2,0×");
  });

  it("leaves the coordinates out for a place that does not exist: only the zoom is left", () => {
    expect(viewReadout(0.0123, -0.0456, 1.5, EN, true)).toBe("1.5×");
    expect(viewReadout(0.0123, -0.0456, 0.5, PT, true)).toBe("50%");
    expect(viewReadout(0.0123, -0.0456, 3, PT, true)).toBe("3,0×");
  });
});
