import { rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url);
const targets = ["dist", "out", "release", "packages/core/dist", "packages/vscode/out", "packages/ajan/dist", "packages/ajan/release"];

for (const t of targets) {
    const p = join(ROOT.pathname, t);
    try {
        rmSync(p, { recursive: true, force: true });
        console.log(`silindi: ${t}`);
    } catch {
        /* yok */
    }
}