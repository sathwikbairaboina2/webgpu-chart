// Packs the library, installs the tarball into a temp project, runs it in Node and typechecks a consumer
// that has no @webgpu/types. Exits non-zero on any failure. Usage: pnpm pack:smoke (after pnpm build).
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
if (!existsSync(join(root, "dist/lib/index.js")) || !existsSync(join(root, "dist/lib/index.d.ts"))) {
  console.error("dist/lib is missing. Run pnpm build first.");
  process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), "gtc-pack-"));
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "pipe", encoding: "utf8" });

try {
  run(`pnpm pack --pack-destination "${dir}"`, root);
  const tgz = readdirSync(dir).find((f) => f.endsWith(".tgz"));
  if (!tgz) throw new Error("pnpm pack produced no tarball");
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
  run(`npm install --no-audit --no-fund "./${tgz}"`, dir);

  writeFileSync(
    join(dir, "smoke.mjs"),
    [
      'import { Ring, decimate, makeParams, VERSION, GpuChart } from "@sathwik/gpu-timeseries";',
      "const r = new Ring(8);",
      "r.append([0, 1, 2, 3], [1, 5, 2, 4]);",
      "const b = decimate(r, makeParams(r, { t0: 0, t1: 4 }, 2));",
      'if (b.f32[1] !== 5 || b.u32[4] !== 2) throw new Error("decimate returned the wrong bucket");',
      'if (typeof GpuChart.create !== "function") throw new Error("GpuChart missing");',
      "const s = await GpuChart.isSupported();",
      'console.log(`imported ${VERSION}; decimate ok; isSupported in Node: ${s.ok} (${s.reason?.slice(0, 40)}...)`);',
    ].join("\n"),
  );
  console.log(run("node smoke.mjs", dir).trim());

  writeFileSync(
    join(dir, "consumer.ts"),
    [
      'import { GpuChart, Ring, decimate, makeParams, type FrameStats, type ChartOptions } from "@sathwik/gpu-timeseries";',
      "const r: Ring = new Ring(4);",
      "export const frameMs = (s: FrameStats): number => s.frameMs;",
      'export const opts: ChartOptions = { capacity: 10, theme: "light" };',
      "export const create = (el: HTMLElement) => GpuChart.create(el, opts);",
      "export const buckets = decimate(r, makeParams(r, { t0: 0, t1: 1 }, 2));",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "bundler", lib: ["ES2023", "DOM"], strict: true, noEmit: true, skipLibCheck: false, types: [] },
      include: ["consumer.ts"],
    }),
  );
  run(`pnpm exec tsc -p "${join(dir, "tsconfig.json")}"`, root);
  console.log(`consumer typecheck ok without @webgpu/types (${tgz})`);
} catch (e) {
  console.error(String(e.stdout ?? ""), String(e.stderr ?? ""), e.message);
  process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
