/** What `canDrawWalk` asks of a canvas. */
interface ContextSource {
  getContext(id: string): unknown;
}

/**
 * Whether this browser can draw the walk (and read its squares). The renderer needs WebGL 2 (three.js has not drawn
 * with WebGL 1 since r163): an old phone, a blocked GPU or a browser with it switched off gets
 * null, and the walk then says so and stays on the map. The test context is let go at once,
 * since a page may only hold a few.
 */
export function canDrawWalk(
  make: () => ContextSource | null = () => document.createElement("canvas"),
  scope: { DecompressionStream?: unknown } = globalThis,
): boolean {
  // the squares come gzipped and are unzipped by the browser (Safari before 16.4 has WebGL 2
  // and cannot): without it every square would fail, and the drop would say "No street here"
  if (typeof scope.DecompressionStream !== "function") return false;
  try {
    const gl = make()?.getContext("webgl2") as {
      getExtension?: (name: string) => { loseContext?: () => void } | null;
    } | null;
    if (!gl) return false;
    gl.getExtension?.("WEBGL_lose_context")?.loseContext?.();
    return true;
  } catch {
    return false;
  }
}
