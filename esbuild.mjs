import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const watch = process.argv.includes("--watch");
const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const shared = {
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node20",
    logLevel: "info",
    legalComments: "none",
    external: ["node-llama-cpp"]
};

const banner = {
    js: [
        '#!/usr/bin/env node',
        // CJS bağımlılıklar (adm-zip vb.) bundle edildiğinde `require` ararlar;
        // ESM çıktısında require yoktur, bu köprü onları çalıştırır.
        'import { createRequire as __ajanCreateRequire } from "node:module";',
        'import { fileURLToPath as __ajanFileURLToPath } from "node:url";',
        'import { dirname as __ajanDirname } from "node:path";',
        'const require = __ajanCreateRequire(import.meta.url);'
    ].join("\n")
};

// Daemon: named pipe / unix socket üzerinden dinleyen tek çalışma zamanı.
const engine = {
    ...shared,
    entryPoints: ["src/daemon/main.ts"],
    outfile: "out/ajan-engine.js",
    sourcemap: watch,
    banner,
    define: {
        __AJAN_VERSION__: JSON.stringify(version)
    }
};

const targets = [engine];

if (watch) {
    for (const t of targets) {
        build({
            ...t,
            watch: {
                onRebuild: (err) => console.log(err ? "[watch] hata" : "[watch] yeniden derlendi")
            }
        });
    }
} else {
    await Promise.all(targets.map((t) => build(t)))
        .then(() => console.log(`[esbuild] ${targets.map((t) => t.outfile).join(" + ")} hazır`))
        .catch(() => process.exit(1));
}

export { root };
