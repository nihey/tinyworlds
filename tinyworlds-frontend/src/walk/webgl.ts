/** What `canDrawWalk` asks of a canvas. */
interface ContextSource {
  getContext(id: string): unknown;
}

/**
 * Whether this browser can draw the walk. The renderer needs WebGL 2 (three.js has not drawn
 * with WebGL 1 since r163): an old phone, a blocked GPU or a browser with it switched off gets
 * null, and the walk then says so and stays on the map. The test context is let go at once,
 * since a page may only hold a few.
 */
export function canDrawWalk(
  make: () => ContextSource | null = () => document.createElement("canvas"),
): boolean {
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
