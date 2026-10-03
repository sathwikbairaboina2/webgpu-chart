import { resolve } from "node:path";
import { defineConfig } from "vite";

// Library build: ESM only, zero runtime dependencies. Declarations come from tsconfig.lib.json.
export default defineConfig({
  build: {
    outDir: "dist/lib",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
    minify: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
  },
});
