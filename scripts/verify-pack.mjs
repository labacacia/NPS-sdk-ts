import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const requiredFiles = [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/core/index.js",
  "dist/ncp/index.js",
  "dist/nwp/index.js",
  "dist/nip/index.js",
  "dist/ndp/index.js",
  "dist/nop/index.js",
];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    throw new Error(`Missing npm package entrypoint: ${file}`);
  }
}

const pack = JSON.parse(execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
  encoding: "utf8",
}));
const packed = new Set(pack[0]?.files?.map((file) => file.path) ?? []);

for (const file of requiredFiles) {
  if (!packed.has(file)) {
    throw new Error(`npm package would omit required file: ${file}`);
  }
}

console.log(`npm pack verification passed (${packed.size} files).`);
