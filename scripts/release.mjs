/**
 * AJAN monorepo üretim betiği.
 * Varsayılan: her paketi derler (core → vscode → ajan) ve çıktıları doğrular.
 * `--publish-core` ile @takimcizgisi/core npm'e yayınlanır (registry kontrolü yok).
 * `--publish-vscode` ile VSCode uzantısı @takimcizgisi/ajan-vscode olarak npm'e yayınlanır
 *   (uzantı manifesti marketplace için `ajan` adını korur; npm sürümü @takimcizgisi/ajan-vscode üzerinden yayınlanır).
 * `--publish-ajan` ile ana masaüstü paketi @takimcizgisi/ajan npm'e yayınlanır.
 * `--publish-electron` ile Electron paketi electron-builder üzerinden paketlenir (release/ dizinine).
 * `--publish-all` üsttekilerin tamamını sırayla çalıştırır (tek komutla tüm sürümler).
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("..", import.meta.url);

const run = (cmd, cwd = ROOT) => {
    console.log(`\n> ${cmd}`);
    execSync(cmd, { cwd, stdio: "inherit", shell: true });
};

const flag = (name) => process.argv.includes(name);

function publishVscodeNpm() {
    const vsc = new URL("./packages/vscode/", ROOT);
    const manifest = JSON.parse(readFileSync(new URL("./packages/vscode/package.json", ROOT), "utf8"));
    const staging = mkdtempSync(join(tmpdir(), "ajan-vscode-npm-"));
    try {
        for (const rel of ["out", "media"]) cpSync(new URL(rel + "/", vsc), join(staging, rel), { recursive: true });
        for (const rel of ["README.md", "LICENSE"]) {
            try {
                cpSync(new URL(rel, vsc), join(staging, rel));
            } catch { /* eksikse atla */ }
        }
        const manifestPath = join(staging, "package.json");
        writeFileSync(
            manifestPath,
            JSON.stringify(
                {
                    name: "@takimcizgisi/ajan-vscode",
                    displayName: manifest.displayName,
                    description: manifest.description,
                    version: manifest.version,
                    publisher: manifest.publisher,
                    license: manifest.license,
                    type: "module",
                    engines: manifest.engines,
                    categories: manifest.categories,
                    icon: manifest.icon,
                    repository: manifest.repository,
                    main: "./out/extension.js",
                    contributes: manifest.contributes,
                    files: ["out", "media", "README.md", "LICENSE"],
                    publishConfig: { access: "public" },
                    dependencies: {
                        "@takimcizgisi/core": manifest.version,
                        "node-llama-cpp": "3.21.1"
                    }
                },
                null,
                2
            )
        );
        run("npm pack --ignore-scripts .", staging);
        const tgz = `takimcizgisi-ajan-vscode-${manifest.version}.tgz`;
        run(`npm publish --access public ${join(staging, tgz)}`);
        return tgz;
    } finally {
        rmSync(staging, { recursive: true, force: true });
    }
}

function publishAjanNpm() {
    const ajan = new URL("./packages/ajan/", ROOT);
    const manifest = JSON.parse(readFileSync(new URL("./packages/ajan/package.json", ROOT), "utf8"));
    const staging = mkdtempSync(join(tmpdir(), "ajan-npm-"));
    try {
        for (const rel of ["dist", "src/renderer"]) cpSync(new URL(rel + "/", ajan), join(staging, rel), { recursive: true });
        for (const rel of ["README.md", "LICENSE"]) {
            try {
                cpSync(new URL(rel, ajan), join(staging, rel));
            } catch { /* eksikse atla */ }
        }
        const manifestPath = join(staging, "package.json");
        writeFileSync(
            manifestPath,
            JSON.stringify(
                {
                    name: "@takimcizgisi/ajan",
                    version: manifest.version,
                    description: manifest.description,
                    license: manifest.license,
                    author: manifest.author,
                    type: "module",
                    main: "./dist/main/index.js",
                    files: ["dist", "src/renderer"],
                    engines: manifest.engines,
                    repository: manifest.repository,
                    publishConfig: { access: "public" }
                },
                null,
                2
            )
        );
        run("npm pack --ignore-scripts .", staging);
        const tgz = `takimcizgisi-ajan-${manifest.version}.tgz`;
        run(`npm publish --access public ${join(staging, tgz)}`);
        return tgz;
    } finally {
        rmSync(staging, { recursive: true, force: true });
    }
}

const publishAll = flag("--publish-all");
if (publishAll) {
    process.argv.push("--publish-core", "--publish-vscode", "--publish-ajan", "--publish-electron");
}

console.log("AJAN monorepo üretimi başlıyor…");

run("npm run build -w packages/core");
run("npm run build -w packages/vscode");
run("npm run build -w packages/ajan");
run("node scripts/package-vscode.mjs");

const CORE = new URL("./packages/core/package.json", ROOT);
const core = JSON.parse(readFileSync(CORE, "utf8"));
const tgz = `takimcizgisi-core-${core.version}.tgz`;
run("npm pack --ignore-scripts ./packages/core");
if (!existsSync(new URL(`./${tgz}`, ROOT))) {
    console.error(`Artefakt bulunamadı: ${tgz}`);
    process.exit(1);
}

if (flag("--publish-core")) {
    run(`npm publish --access public ./${tgz}`);
} else {
    console.log(`\nnpm yayını için: npm run release -- --publish-core  (paket: ${tgz})`);
}

if (flag("--publish-vscode")) {
    const vscTgz = publishVscodeNpm();
    console.log(`\n@takimcizgisi/ajan-vscode yayınlandı: ${vscTgz}`);
} else {
    console.log("\nVSCode uzantısının npm yayını için: npm run release -- --publish-vscode  (@takimcizgisi/ajan-vscode)");
}

if (flag("--publish-ajan")) {
    const ajanTgz = publishAjanNpm();
    console.log(`\n@takimcizgisi/ajan yayınlandı: ${ajanTgz}`);
} else {
    console.log("\nAna masaüstü paketinin npm yayını için: npm run release -- --publish-ajan  (@takimcizgisi/ajan)");
}

if (flag("--publish-electron")) {
    process.env.AJAN_EB_OUTPUT = fileURLToPath(new URL("./release/", ROOT));
    run("npm run dist -w packages/ajan");
    console.log(`\nElectron kurulumları: ${process.env.AJAN_EB_OUTPUT}`);
} else {
    console.log("\nElectron paketi için: npm run release -- --publish-electron");
}

console.log("\nÜretim tamamlandı.");