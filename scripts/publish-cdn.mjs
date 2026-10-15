import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const distDirectory = new URL("../dist/", import.meta.url);
const cdnDirectory = new URL("../cdn/v1/", import.meta.url);

await rm(cdnDirectory, { force: true, recursive: true });
await mkdir(cdnDirectory, { recursive: true });
await cp(distDirectory, cdnDirectory, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL("../src/index.ts", import.meta.url))],
  outfile: fileURLToPath(new URL("../cdn/v1/index.js", import.meta.url)),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: "external",
});

console.log("Published bundled SDK to cdn/v1/index.js");
