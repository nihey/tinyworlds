/**
 * A small WKB reader: enough for what DuckDB's ST_AsWKB emits (2D or Z/M points, lines, polygons
 * and their multi/collection forms). Coordinates come back flat: [x0, y0, x1, y1, ...].
 */
export const enum GeomKind {
  Point = 0,
  Line = 1,
  Polygon = 2,
}

export interface Geom {
  kind: GeomKind;
  /**
   * Polygon: one entry per polygon, each a list of rings (outer first).
   * Line: one entry per line, holding a single path.
   * Point: one entry per point, holding a single [x, y].
   */
  parts: Float64Array[][];
}

export function readWkb(bytes: Uint8Array): Geom | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  let kind: GeomKind | null = null;
  const parts: Float64Array[][] = [];

  const readCoords = (n: number, dims: number, le: boolean): Float64Array => {
    const out = new Float64Array(n * 2);
    for (let i = 0; i < n; i++) {
      out[i * 2] = view.getFloat64(pos, le);
      out[i * 2 + 1] = view.getFloat64(pos + 8, le);
      pos += 8 * dims;
    }
    return out;
  };

  const readGeometry = (): void => {
    const le = view.getUint8(pos) === 1;
    pos += 1;
    let type = view.getUint32(pos, le);
    pos += 4;
    let dims = 2;
    if (type & 0x80000000) dims++; // EWKB Z
    if (type & 0x40000000) dims++; // EWKB M
    if (type & 0x20000000) pos += 4; // EWKB SRID
    type &= 0x0fffffff;
    if (type >= 3000) {
      dims = 4;
      type -= 3000;
    } else if (type >= 2000) {
      dims = 3;
      type -= 2000;
    } else if (type >= 1000) {
      dims = 3;
      type -= 1000;
    }

    switch (type) {
      case 1: // Point
        kind ??= GeomKind.Point;
        parts.push([readCoords(1, dims, le)]);
        break;
      case 2: {
        // LineString
        kind ??= GeomKind.Line;
        const n = view.getUint32(pos, le);
        pos += 4;
        parts.push([readCoords(n, dims, le)]);
        break;
      }
      case 3: {
        // Polygon
        kind ??= GeomKind.Polygon;
        const ringCount = view.getUint32(pos, le);
        pos += 4;
        const rings: Float64Array[] = [];
        for (let r = 0; r < ringCount; r++) {
          const n = view.getUint32(pos, le);
          pos += 4;
          rings.push(readCoords(n, dims, le));
        }
        if (rings.length > 0) parts.push(rings);
        break;
      }
      case 4: // MultiPoint
      case 5: // MultiLineString
      case 6: // MultiPolygon
      case 7: {
        // GeometryCollection
        const n = view.getUint32(pos, le);
        pos += 4;
        for (let i = 0; i < n; i++) readGeometry();
        break;
      }
      default:
        throw new Error(`Unsupported WKB geometry type ${type}`);
    }
  };

  readGeometry();
  if (kind === null || parts.length === 0) return null;
  // a collection may mix kinds; keep only parts of the first kind seen
  return { kind, parts };
}
