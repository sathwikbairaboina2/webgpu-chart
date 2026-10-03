// Converts demo-video/demo.webm to docs/demo.gif with a two-pass palette. Retries smaller until under 5 MB.
// Needs ffmpeg on PATH. Usage: pnpm demo:gif
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(import.meta.dirname, "..");
const input = join(root, "demo-video/demo.webm");
const output = join(root, "docs/demo.gif");
const palette = join(tmpdir(), "webgpu-chart-palette.png");
const LIMIT = 5 * 1024 * 1024;
// The first second of a Playwright video is the blank page before load.
const SKIP_S = "1.2";

try {
  execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
} catch {
  console.error("ffmpeg is not on PATH");
  process.exit(1);
}
if (!existsSync(input)) {
  console.error("demo-video/demo.webm is missing. Run pnpm demo:record first.");
  process.exit(1);
}

// Random-walk data changes most pixels every frame, so the palette is small and undithered.
for (const [fps, width, colors] of [[10, 800, 32], [10, 720, 32], [8, 720, 24], [8, 640, 24]]) {
  const base = `fps=${fps},scale=${width}:-1:flags=lanczos`;
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-ss", SKIP_S, "-i", input, "-vf", `${base},palettegen=max_colors=${colors}:stats_mode=diff`, palette]);
  execFileSync("ffmpeg", [
    "-loglevel", "error", "-y", "-ss", SKIP_S, "-i", input, "-i", palette,
    "-lavfi", `${base}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`,
    output,
  ]);
  const size = statSync(output).size;
  console.log(`docs/demo.gif: ${size} bytes at ${fps} fps, ${width} px wide, ${colors} colors`);
  if (size < LIMIT) {
    rmSync(palette, { force: true });
    process.exit(0);
  }
}
console.error("could not get the GIF under 5 MB");
process.exit(1);
