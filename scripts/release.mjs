/**
 * AJAN üretim betiği — motor (daemon) + istemci kütüphanesi.
 *
 *   npm run release                 → typecheck + build + npm pack, npm'e yayınlamaz
 *   npm run release -- --publish    → hepsi + npm publish --access public
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

const has = (f) => process.argv.includes(f);

function npm(args) {
    const cli = process.env.npm_execpath ?? join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    execFileSync(process.execPath, [cli, ...args], { stdio: "inherit", cwd: ROOT });
}

function step(title) {
    console.log(`\n[1m> ${title}[0m`);
}

console.log(`AJAN ${pkg.version} — üretim`);

step("typecheck");
npm(["run", "typecheck"]);

step("build");
npm(["run", "build"]);

step("çıktılar");
const expected = ["out/ajan-engine.js"];
const missing = expected.filter((f) => !existsSync(join(ROOT, f)));
if (missing.length > 0) {
    console.error(`build çıktısı eksik: ${missing.join(", ")}`);
    process.exit(1);
}
for (const f of expected) {
    console.log(`  ${f}  (${(statSync(join(ROOT, f)).size / (1024 * 1024)).toFixed(2)} MB)`);
}

step("npm pack");
npm(["pack", "--ignore-scripts"]);
const tgz = readdirSync(ROOT).find((f) => f.endsWith(".tgz"));
if (!tgz) {
    console.error("tgz üretilmedi");
    process.exit(1);
}
console.log(`  ${tgz}`);

if (has("--publish")) {
    step("npm publish");
    npm(["publish", "--access", "public", tgz]);
    console.log(`\n[32mYayınlandı: ${pkg.name}@${pkg.version}[0m`);
} else {
    console.log(`\nYayınlamak için: npm run release -- --publish`);
}
