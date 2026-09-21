import { copyFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "dist", "preload.js");
const dest = join(root, "dist", "preload.mjs");
copyFileSync(src, dest);
rmSync(src, { force: true });
console.log("[ajan] preload.mjs üretildi");