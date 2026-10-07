import { cp, mkdir, rm } from "node:fs/promises";

const distDirectory = new URL("../dist/", import.meta.url);
const cdnDirectory = new URL("../cdn/v1/", import.meta.url);

await rm(cdnDirectory, { force: true, recursive: true });
await mkdir(cdnDirectory, { recursive: true });
await cp(distDirectory, cdnDirectory, { recursive: true });

console.log("Published dist to cdn/v1");
