import { rmSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

for (const t of ["out", "release"]) {
    const p = join(ROOT, t);
    rmSync(p, { recursive: true, force: true });
    console.log(`silindi: ${t}`);
}

for (const f of readdirSync(ROOT)) {
    if (f.endsWith(".tgz")) {
        rmSync(join(ROOT, f), { force: true });
        console.log(`silindi: ${f}`);
    }
}
