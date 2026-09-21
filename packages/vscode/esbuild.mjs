import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)));
const watch = process.argv.includes("--watch");

const common = {
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    external: ["vscode", "node-llama-cpp"],
    outfile: "out/extension.js",
    sourcemap: watch ? true : false,
    logLevel: "info",
    legalComments: "none",
    banner: {
        js: 'import { createRequire as __createRequire } from "node:module";\nconst require = __createRequire(import.meta.url);'
    },
    define: {
        "process.env.VSCODE_EXT": '"1"'
    }
};

function copyModels() {
    mkdirSync(join(root, "out", "config"), { recursive: true });
    cpSync(join(root, "..", "core", "config", "models.json"), join(root, "out", "config", "models.json"));
}

if (watch) {
    build({ ...common, watch: { onRebuild: (err) => console.log(err ? "[watch] hata" : "[watch] yeniden derlendi") } });
} else {
    build(common)
        .then(() => {
            copyModels();
            console.log("[esbuild] out/extension.js + out/config/models.json hazır");
        })
        .catch(() => process.exit(1));
}