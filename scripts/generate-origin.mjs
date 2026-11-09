import { readFile, writeFile } from "node:fs/promises";

async function readOriginFile(name) {
  let content;
  try {
    content = await readFile(new URL(`../${name}`, import.meta.url), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  const line = content.replace(/^\uFEFF/, "").split(/\r?\n/)
    .find((entry) => /^\s*ESS_ORIGIN\s*=/.test(entry));
  if (!line) throw new Error(`${name} must define ESS_ORIGIN`);

  const value = line.slice(line.indexOf("=") + 1).trim();
  return value.replace(/^(["'])(.*)\1$/, "$2");
}

const configuredOrigin = await readOriginFile(".env")
  ?? process.env.ESS_ORIGIN
  ?? await readOriginFile(".env.example");
if (!configuredOrigin) throw new Error("ESS_ORIGIN is required to build EssAuth");

let url;
try {
  url = new URL(configuredOrigin);
} catch {
  throw new Error("ESS_ORIGIN must be an absolute HTTP(S) origin");
}
if (!(["http:", "https:"].includes(url.protocol))
  || !url.hostname
  || url.username
  || url.password
  || url.pathname !== "/"
  || url.search
  || url.hash) {
  throw new Error("ESS_ORIGIN must be an HTTP(S) origin without credentials, path, query, or fragment");
}

const origin = url.origin;
await writeFile(
  new URL("../src/internal/core/sdk-origin.ts", import.meta.url),
  `// Generated at build time from ESS_ORIGIN. Do not edit.\nexport const ESS_ORIGIN = ${JSON.stringify(origin)};\n`,
  "utf8",
);
console.log(`EssAuth origin: ${origin}`);
