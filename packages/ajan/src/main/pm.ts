import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import type { PkgInfo, PmCatalogResult, PmPackage, PmPackageDefinition, PmStatus } from "../shared/ipc.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
const REPO_ROOT = resolve(PKG_ROOT, "..");
const CORE_DIR = join(REPO_ROOT, "packages", "core");
const VSCODE_DIR = join(REPO_ROOT, "packages", "vscode");
const CORE_ID = "@takimcizgisi/core";
export const VSIX_ID = "takimcizgisi.ajan";

const SHELL = process.env.comspec ?? (process.platform === "win32" ? "cmd.exe" : "/bin/sh");

const REGISTRY = "https://registry.npmjs.org";
const GH_REPO = "takimcizgisi/ajan";
const CATALOG_URL = `https://raw.githubusercontent.com/${GH_REPO}/main/packages.json`;
const CATALOG_FALLBACK = join(PKG_ROOT, "src", "renderer", "assets", "packages.json");

function appVersion(): string | null {
    return getVersion(join(PKG_ROOT, "package.json"));
}

async function registryDoc(name: string): Promise<{ latest?: string; description?: string } | null> {
    try {
        const res = await fetch(`${REGISTRY}/${encodeURIComponent(name).replace(/%2F/g, "/")}`, {
            headers: { accept: "application/vnd.npm.install-v1+json" }
        });
        if (!res.ok) return null;
        const doc = (await res.json()) as { "dist-tags"?: { latest?: string }; description?: string };
        return { latest: doc["dist-tags"]?.latest, description: doc.description };
    } catch (err) {
        console.warn(`[ajan-pm] registry sorgusu başarısız (${name}):`, (err as Error).message);
        return null;
    }
}

function isUpdate(current: string | null, latest: string | null): boolean {
    if (!current || !latest) return false;
    const a = current.split(".").map((n) => parseInt(n, 10) || 0);
    const b = latest.split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0);
    }
    return false;
}

function dataDir(): string {
    return process.env.AJAN_HOME ?? join(os.homedir(), ".ajan");
}

export function managedDir(): string {
    const dir = join(dataDir(), "packages");
    mkdirSync(dir, { recursive: true });
    return dir;
}

function coreInstallPath(): string {
    return join(managedDir(), "node_modules", "@takimcizgisi", "core");
}

function getVersion(file: string): string | null {
    try {
        const pkg = JSON.parse(readFileSync(file, "utf8")) as { version?: string };
        return pkg.version ?? null;
    } catch {
        return null;
    }
}

const run = (cmd: string, cwd: string): void => {
    console.log(`> ${cmd}`);
    const env = { ...process.env };
    delete env.npm_config_allow_scripts;
    try {
        execSync(cmd, { cwd, stdio: "inherit", shell: SHELL, env });
    } catch (err) {
        throw new Error(`Komut başarısız: ${cmd}\n${(err as Error).message}`);
    }
};

function findVsixCandidates(): string[] {
    const candidates: string[] = [];
    for (const dir of [VSCODE_DIR, join(dataDir(), "vsix")]) {
        try {
            const files = readdirSync(dir);
            candidates.push(...files.filter((f) => f.startsWith("ajan-") && f.endsWith(".vsix")).map((f) => join(dir, f)));
        } catch {
            /* dizin yok */
        }
    }
    return candidates;
}

function findCodeCli(): string | null {
    const local = process.env.LOCALAPPDATA ?? "";
    const prog = process.env.ProgramFiles ?? "";
    const exes = [
        join(local, "Programs", "Microsoft VS Code Insiders", "Code - Insiders.exe"),
        join(local, "Programs", "Microsoft VS Code", "Code.exe"),
        join(prog, "Microsoft VS Code Insiders", "Code - Insiders.exe"),
        join(prog, "Microsoft VS Code", "Code.exe")
    ];
    for (const exe of exes) {
        if (!existsSync(exe)) continue;
        const base = dirname(exe);
        const candidates = [
            join(base, "resources", "app", "out", "cli.js"),
            ...(existsSync(base)
                ? readdirSync(base).map((d) => join(base, d, "resources", "app", "out", "cli.js"))
                : [])
        ];
        if (candidates.some((c) => existsSync(c))) return exe;
    }
    for (const c of ["code-insiders", "code"]) {
        try {
            execSync(`where ${c}`, { stdio: "ignore", shell: SHELL });
            return c;
        } catch {
            /* yok */
        }
    }
    return null;
}

function isVsixInstalled(): boolean {
    const cli = findCodeCli();
    if (!cli) return false;
    try {
        const out = execSync(`"${cli}" --list-extensions`, { encoding: "utf8", shell: SHELL, stdio: ["ignore", "pipe", "ignore"] });
        return out.split(/\r?\n/).some((l) => l.trim() === VSIX_ID);
    } catch {
        return false;
    }
}

function localCoreAvailable(): boolean {
    return existsSync(join(CORE_DIR, "package.json"));
}

export async function pmStatus(): Promise<PmStatus> {
    const corePkg = join(coreInstallPath(), "package.json");
    let version: string | null = null;
    let installed = false;
    if (existsSync(corePkg)) {
        installed = true;
        version = getVersion(corePkg) ?? version;
    }
    return {
        managedDir: managedDir(),
        appVersion: appVersion(),
        core: { installed, version, path: installed ? coreInstallPath() : null },
        vscode: { id: VSIX_ID, installed: isVsixInstalled(), vsixFound: findVsixCandidates().length > 0 }
    };
}

async function pkgRow(name: string): Promise<PkgInfo> {
    const local = join(localNodeModules(name), "package.json");
    const current = existsSync(local) ? getVersion(local) : null;
    const doc = await registryDoc(name);
    const latest = doc?.latest ?? null;
    return {
        name,
        current,
        latest,
        updateAvailable: isUpdate(current, latest),
        compatible: true,
        installed: current !== null,
        description: doc?.description
    };
}

function localNodeModules(name: string): string {
    const scoped = name.split("/");
    if (scoped.length === 2 && scoped[0] && scoped[1]) {
        return join(PKG_ROOT, "node_modules", scoped[0]!, scoped[1]!);
    }
    return join(PKG_ROOT, "node_modules", name);
}

export async function pmUpdates(): Promise<PkgInfo[]> {
    const names = ["@takimcizgisi/core", "@takimcizgisi/ajan-vscode", "node-llama-cpp"];
    const rows: PkgInfo[] = [];
    for (const name of names) {
        rows.push(await pkgRow(name));
    }
    return rows;
}

export async function pmEcosystem(): Promise<PkgInfo[]> {
    const known = ["@takimcizgisi/core", "@takimcizgisi/ajan-vscode", "@takimcizgisi/ajan"];
    const seen = new Map<string, PkgInfo>();
    try {
        const res = await fetch(`${REGISTRY}/-/v1/search?text=${encodeURIComponent("scope:takimcizgisi")}&size=25`, {
            headers: { accept: "application/json" }
        });
        if (res.ok) {
            const data = (await res.json()) as { objects: Array<{ package: { name: string; version: string; description?: string } }> };
            for (const obj of data.objects) {
                const p = obj.package;
                seen.set(p.name, {
                    name: p.name,
                    current: getVersion(join(localNodeModules(p.name), "package.json")),
                    latest: p.version,
                    updateAvailable: isUpdate(getVersion(join(localNodeModules(p.name), "package.json")), p.version),
                    compatible: known.includes(p.name),
                    installed: existsSync(join(localNodeModules(p.name), "package.json")),
                    description: p.description
                });
            }
        }
    } catch (err) {
        console.warn("[ajan-pm] ekosistem araması başarısız:", (err as Error).message);
    }
    for (const name of known) {
        if (!seen.has(name)) {
            const row = await pkgRow(name);
            seen.set(name, { ...row, compatible: true });
        }
    }
    return [...seen.values()];
}

export async function pmInstallCore(): Promise<{ ok: boolean; version?: string; error?: string }> {
    try {
        if (localCoreAvailable() && !process.env.AJAN_PM_REGISTRY_ONLY) {
            const dist = join(CORE_DIR, "dist", "index.js");
            if (!existsSync(dist)) run("npm run build", CORE_DIR);
            const dest = coreInstallPath();
            mkdirSync(dirname(dest), { recursive: true });
            rmSync(dest, { recursive: true, force: true });
            mkdirSync(dest, { recursive: true });
            for (const rel of ["package.json", "dist", "config"]) {
                const src = join(CORE_DIR, rel);
                if (!existsSync(src)) continue;
                cpSync(src, join(dest, rel), {
                    recursive: true,
                    filter: (p) => !p.split(/[\\/]/).includes("node_modules")
                });
            }
            const version = getVersion(join(dest, "package.json"));
            console.log(`[ajan-pm] ${CORE_ID} yönetim dizinine kopyalandı (v${version ?? "?"})`);
            return { ok: true, version: version ?? undefined };
        }
        const dir = managedDir();
        const spec = process.env.AJAN_PM_CORE_VERSION ?? "latest";
        writeFileSync(
            join(dir, "package.json"),
            JSON.stringify(
                { name: "ajan-managed-packages", private: true, dependencies: { [CORE_ID]: spec }, allowScripts: ["node-llama-cpp"] },
                null,
                2
            )
        );
        run("npm install --no-audit --no-fund", dir);
        const version = getVersion(join(coreInstallPath(), "package.json"));
        return { ok: true, version: version ?? undefined };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

function buildVsixFromSource(): string | null {
    try {
        const dist = join(CORE_DIR, "dist", "index.js");
        if (!existsSync(dist)) run("npm run build", CORE_DIR);
        run("npm run build", VSCODE_DIR);
        run("npm run package", VSCODE_DIR);
        const built = findVsixCandidates().find((p) => !p.includes(dataDir()));
        return built ?? null;
    } catch (err) {
        console.warn("[ajan-pm] VSIX kaynaktan üretilemedi:", (err as Error).message);
        return null;
    }
}

export async function pmInstallVscode(): Promise<{ ok: boolean; error?: string }> {
    try {
        const cli = findCodeCli();
        if (!cli) {
            return { ok: false, error: "VSCode CLI bulunamadı. 'code' komutunu PATH'e ekleyin." };
        }
        let vsix = findVsixCandidates()[0] ?? null;
        if (!vsix && existsSync(join(VSCODE_DIR, "package.json"))) {
            vsix = buildVsixFromSource();
        }
        if (!vsix) {
            return { ok: false, error: "Kurulabilir VSIX bulunamadı. Önce paketleme yapmalısınız (npm run vscode:package)." };
        }
        run(`"${cli}" --install-extension "${vsix}" --force`, managedDir());
        if (!isVsixInstalled()) {
            return { ok: false, error: "Uzantı kurulum görünmüyor; VSCode'u kapatıp tekrar deneyin." };
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}

async function urlToDataUrl(url: string): Promise<string | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const ct = (res.headers.get("content-type") ?? "image/png").split(";")[0] ?? "image/png";
        if (!ct.startsWith("image/")) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        return `data:${ct};base64,${buf.toString("base64")}`;
    } catch (err) {
        console.warn("[ajan-pm] logo indirilemedi:", (err as Error).message);
        return null;
    }
}

type ManifestSource = { defs: PmPackageDefinition[]; source: "github" | "local" };

async function loadManifest(): Promise<ManifestSource> {
    try {
        const res = await fetch(CATALOG_URL, { headers: { "user-agent": "ajan-desktop" } });
        if (res.ok) {
            const defs = (await res.json()) as PmPackageDefinition[];
            if (Array.isArray(defs) && defs.length > 0) return { defs, source: "github" };
        }
    } catch (err) {
        console.warn("[ajan-pm] katalog çekilemedi, yerel kopyaya dönüyorum:", (err as Error).message);
    }
    const defs = (await readFileJson(CATALOG_FALLBACK)) as PmPackageDefinition[];
    return { defs, source: "local" };
}

async function readFileJson(file: string): Promise<unknown> {
    return JSON.parse(readFileSync(file, "utf8"));
}

let npmPrefixCache: string | null = null;
function npmGlobalPrefix(): string {
    if (npmPrefixCache) return npmPrefixCache;
    try {
        npmPrefixCache = execSync("npm prefix -g", { encoding: "utf8", shell: SHELL }).trim();
    } catch {
        npmPrefixCache = process.platform === "win32" ? join(os.homedir(), "AppData", "Roaming", "npm") : "/usr/local";
    }
    return npmPrefixCache;
}

function globalNodeModules(name: string): string {
    const parts = name.split("/");
    if (name.startsWith("@")) {
        return join(npmGlobalPrefix(), process.platform === "win32" ? "node_modules" : "lib", "node_modules", parts[0]!, parts[1]!);
    }
    return join(npmGlobalPrefix(), process.platform === "win32" ? "node_modules" : "lib", "node_modules", name);
}

function installedExtVersion(): string | null {
    for (const base of [join(os.homedir(), ".vscode"), join(os.homedir(), ".vscode-server"), join(os.homedir(), ".vscode-insiders")]) {
        const dir = join(base, "extensions");
        if (!existsSync(dir)) continue;
        try {
            const entry = readdirSync(dir).find((d) => /^takimcizgisi\.ajan-/i.test(d));
            if (entry) return getVersion(join(dir, entry, "package.json"));
        } catch { /* yok */ }
    }
    return null;
}

function detectCurrent(def: PmPackageDefinition): string | null {
    switch (def.kind) {
        case "core": {
            const f = join(managedDir(), "node_modules", "@takimcizgisi", "core", "package.json");
            return existsSync(f) ? getVersion(f) : null;
        }
        case "vscode":
            return installedExtVersion();
        case "npm-global":
            return def.npmName ? (existsSync(join(globalNodeModules(def.npmName), "package.json")) ? getVersion(join(globalNodeModules(def.npmName), "package.json")) : null) : null;
        case "npm-local":
            return def.npmName ? (existsSync(join(localNodeModules(def.npmName), "package.json")) ? getVersion(join(localNodeModules(def.npmName), "package.json")) : null) : null;
        case "app":
            return appVersion();
        default:
            return null;
    }
}

export async function pmCatalog(): Promise<PmCatalogResult> {
    const { defs, source } = await loadManifest();
    const packages: PmPackage[] = [];
    for (const def of defs) {
        let latest: string | null = null;
        let registryError: string | null = null;
        if (def.npmName) {
            const doc = await registryDoc(def.npmName);
            if (doc?.latest) latest = doc.latest;
            else registryError = "npm'de bulunamadı (henüz yayınlanmamış olabilir)";
        }
        const current = detectCurrent(def);
        packages.push({
            ...def,
            logo: def.logoUrl ? await urlToDataUrl(def.logoUrl) : null,
            current,
            latest,
            updateAvailable: isUpdate(current, latest),
            installed: current !== null,
            registryError
        });
    }
    return { packages, source, fetchedAt: new Date().toISOString() };
}

export async function pmInstallPackage(id: string): Promise<{ ok: boolean; label?: string; error?: string }> {
    const { defs } = await loadManifest();
    const def = defs.find((d) => d.id === id);
    if (!def) return { ok: false, error: `Katalogda paket yok: ${id}` };
    if (!def.commands.length) return { ok: false, error: "Bu paketin kurulum komutu yok." };
    try {
        for (const entry of def.commands) {
            let cmd = entry.cmd;
            if (cmd === "pm:core") {
                const r = await pmInstallCore();
                if (!r.ok) return { ok: false, error: r.error ?? "AJAN Core kurulamadı." };
                continue;
            }
            if (cmd === "pm:vscode") {
                const r = await pmInstallVscode();
                if (!r.ok) return { ok: false, error: r.error ?? "VSCode uzantısı kurulamadı." };
                continue;
            }
            cmd = cmd
                .replaceAll("{{managedDir}}", `"${managedDir()}"`)
                .replaceAll("{{dataDir}}", `"${dataDir()}"`)
                .replaceAll("{{repoRoot}}", `"${REPO_ROOT}"`);
            const vsix = findVsixCandidates()[0];
            if (vsix) cmd = cmd.replaceAll("{{vsix}}", `"${vsix}"`);
            run(cmd, managedDir());
        }
        return { ok: true, label: def.label };
    } catch (err) {
        return { ok: false, error: (err as Error).message };
    }
}