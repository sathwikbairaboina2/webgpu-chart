// Writes the README and DEVDOCS headline and the README bench table from bench/results/latest.json.
// Usage: pnpm bench:table            (rewrite README.md and docs/DEVDOCS.md)
//        pnpm bench:table --check    (exit 1 when either does not match the JSON)
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { applyToReadme, type BenchFile } from "../src/bench/report";

const root = resolve(import.meta.dirname, "..");
const file = JSON.parse(readFileSync(join(root, "bench/results/latest.json"), "utf8")) as BenchFile;
// README.md gets the headline and the table; docs/DEVDOCS.md gets the headline only.
const targets = ["README.md", "docs/DEVDOCS.md"].map((p) => {
  const path = join(root, p);
  const before = readFileSync(path, "utf8");
  return { p, path, before, after: applyToReadme(before, file) };
});

if (process.argv.includes("--check")) {
  const stale = targets.filter((t) => t.after !== t.before);
  if (stale.length > 0) {
    console.error(`${stale.map((t) => t.p).join(", ")} does not match bench/results/latest.json. Run pnpm bench:table.`);
    process.exit(1);
  }
  console.log("README.md and docs/DEVDOCS.md match bench/results/latest.json");
} else {
  for (const t of targets) writeFileSync(t.path, t.after);
  console.log("README.md and docs/DEVDOCS.md updated from bench/results/latest.json");
}
