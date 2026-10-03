// Writes the README headline and bench table from bench/results/latest.json.
// Usage: pnpm bench:table            (rewrite README.md)
//        pnpm bench:table --check    (exit 1 when README.md does not match the JSON)
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { applyToReadme, type BenchFile } from "../src/bench/report";

const root = resolve(import.meta.dirname, "..");
const file = JSON.parse(readFileSync(join(root, "bench/results/latest.json"), "utf8")) as BenchFile;
const readmePath = join(root, "README.md");
const before = readFileSync(readmePath, "utf8");
const after = applyToReadme(before, file);

if (process.argv.includes("--check")) {
  if (after !== before) {
    console.error("README.md bench section does not match bench/results/latest.json. Run pnpm bench:table.");
    process.exit(1);
  }
  console.log("README.md matches bench/results/latest.json");
} else {
  writeFileSync(readmePath, after);
  console.log("README.md updated from bench/results/latest.json");
}
