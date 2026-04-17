import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index:        "src/index.ts",
    "core/index": "src/core/index.ts",
    "ncp/index":  "src/ncp/index.ts",
    "nwp/index":  "src/nwp/index.ts",
    "nip/index":  "src/nip/index.ts",
    "ndp/index":  "src/ndp/index.ts",
    "nop/index":  "src/nop/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  target: "es2022",
});
