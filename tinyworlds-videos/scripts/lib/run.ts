import { spawnSync } from "node:child_process";

/** Run a command, its output passed through, and stop if it fails. */
export function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed (exit ${result.status ?? "?"})`);
}

/**
 * Encode a render for the web: no sound, the size and quality asked for, and the index at the
 * front of the file so it starts before it has all arrived.
 */
export function encodeForWeb(
  source: string,
  target: string,
  opts: { width: number; height: number; crf: number },
  cwd: string,
): void {
  run(
    "ffmpeg",
    [
      "-v", "error", "-y", "-i", source, "-an",
      "-vf", `scale=${opts.width}:${opts.height}:flags=lanczos`,
      "-c:v", "libx264", "-preset", "veryslow", "-crf", String(opts.crf),
      "-pix_fmt", "yuv420p", "-profile:v", "high", "-movflags", "+faststart",
      target,
    ], // prettier-ignore
    cwd,
  );
}
