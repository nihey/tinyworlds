import { f32, u32, u8, type Arr } from "./store.js";

/** Where a scene's geometry is collected before it is written out as flat typed arrays. */

/** Rings of polygons in map px, with a bounding box per polygon. */
export class PolySink {
  ringStart = u32();
  vertStart = u32();
  xy = f32();
  bbox = f32();
  count = 0;
  private rings = 0;
  private verts = 0;
  private minX = 0;
  private minY = 0;
  private maxX = 0;
  private maxY = 0;

  begin(): void {
    this.ringStart.push(this.rings);
    this.minX = this.minY = Infinity;
    this.maxX = this.maxY = -Infinity;
  }
  /** Add a ring from flat map-px coordinates. */
  ring(map: ArrayLike<number>, n: number): void {
    this.vertStart.push(this.verts);
    for (let i = 0; i < n; i++) {
      const x = map[i * 2];
      const y = map[i * 2 + 1];
      this.xy.push2(x, y);
      if (x < this.minX) this.minX = x;
      if (x > this.maxX) this.maxX = x;
      if (y < this.minY) this.minY = y;
      if (y > this.maxY) this.maxY = y;
    }
    this.verts += n;
    this.rings++;
  }
  end(): number {
    this.bbox.push4(this.minX, this.minY, this.maxX, this.maxY);
    return this.count++;
  }
  arrays(prefix: string): Record<string, Arr> {
    this.ringStart.push(this.rings);
    this.vertStart.push(this.verts);
    return {
      [`${prefix}.ringStart`]: this.ringStart.finish(),
      [`${prefix}.vertStart`]: this.vertStart.finish(),
      [`${prefix}.xy`]: this.xy.finish(),
      [`${prefix}.bbox`]: this.bbox.finish(),
    };
  }
}

/** Paths in map px, each with a kind, a width in metres and flags. */
export class LineSink {
  vertStart = u32();
  xy = f32();
  bbox = f32();
  kind = u8();
  flags = u8();
  width = f32();
  count = 0;
  private verts = 0;

  add(map: ArrayLike<number>, n: number, kind: number, widthM: number, flags: number): void {
    if (n < 2) return;
    this.vertStart.push(this.verts);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = map[i * 2];
      const y = map[i * 2 + 1];
      this.xy.push2(x, y);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    this.verts += n;
    this.bbox.push4(minX, minY, maxX, maxY);
    this.kind.push(kind);
    this.flags.push(flags);
    this.width.push(widthM);
    this.count++;
  }
  arrays(prefix: string): Record<string, Arr> {
    this.vertStart.push(this.verts);
    return {
      [`${prefix}.vertStart`]: this.vertStart.finish(),
      [`${prefix}.xy`]: this.xy.finish(),
      [`${prefix}.bbox`]: this.bbox.finish(),
      [`${prefix}.kind`]: this.kind.finish(),
      [`${prefix}.flags`]: this.flags.finish(),
      [`${prefix}.width`]: this.width.finish(),
    };
  }
}
