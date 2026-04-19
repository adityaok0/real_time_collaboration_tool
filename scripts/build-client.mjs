import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

await mkdir(path.join(rootDir, "public"), { recursive: true });

await build({
  entryPoints: [path.join(rootDir, "src", "client.js")],
  bundle: true,
  format: "esm",
  platform: "browser",
  sourcemap: true,
  target: ["es2022"],
  outfile: path.join(rootDir, "public", "client.js"),
  logLevel: "info"
});
