import { resolve } from "node:path";
import { defineConfig } from "vite";

// Cross-origin isolation gives performance.now() 5 us resolution instead of 100 us (bench precision).
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// Demo, bench and GPU test pages. The library build is vite.lib.config.ts.
export default defineConfig({
  base: "./",
  server: { port: 5430, strictPort: true, headers: isolation },
  preview: { port: 5431, strictPort: true, headers: isolation },
  build: {
    outDir: "dist/demo",
    emptyOutDir: true,
    target: "es2022",
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        bench: resolve(import.meta.dirname, "bench.html"),
        "gpu-test": resolve(import.meta.dirname, "gpu-test.html"),
      },
    },
  },
});
