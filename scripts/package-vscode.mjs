import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORE = join(ROOT, "packages", "core");
const VSC = join(ROOT, "packages", "vscode");

const run = (cmd, cwd = ROOT) => execSync(cmd, { stdio: "inherit", shell: "cmd.exe", cwd });

const vscPkg = JSON.parse(readFileSync(join(VSC, "package.json"), "utf8"));
const version = vscPkg.version;
const id = "takimcizgisi.ajan";
const staging = join(os.tmpdir(), `ajan-vsix-${Date.now()}`);
const depCache = join(os.tmpdir(), "ajan-vsix-deps");

const STAGE_EXT = join(staging, "extension");

function copyTree(src, dest) {
    mkdirSync(dest, { recursive: true });
    for (const entry of readdirSync(src, { withFileTypes: true })) {
        const s = join(src, entry.name);
        const d = join(dest, entry.name);
        if (entry.isDirectory()) copyTree(s, d);
        else cpSync(s, d, { force: true });
    }
}

try {
    console.log("[1/5] core dist");
    run("npm run build -w packages/core");
    if (!existsSync(join(CORE, "dist", "index.js"))) throw new Error("core dist eksik");

    console.log("[2/5] esbuild bundle");
    run("node esbuild.mjs", VSC);
    if (!existsSync(join(VSC, "out", "extension.js"))) throw new Error("out/extension.js eksik");

    console.log("[3/5] production node_modules (node-llama-cpp) hazirlaniyor");
    if (!existsSync(join(depCache, "node_modules", "node-llama-cpp"))) {
        mkdirSync(depCache, { recursive: true });
        writeFileSync(
            join(depCache, "package.json"),
            JSON.stringify({ name: "ajan-vsix-deps", private: true, dependencies: { "node-llama-cpp": "3.21.1" } }, null, 2)
        );
        writeFileSync(join(depCache, ".npmrc"), "package-lock=false\n", "utf8");
        run("npm install --omit=dev --no-audit --no-fund", depCache);
    }
    if (!existsSync(join(depCache, "node_modules", "node-llama-cpp"))) throw new Error("node-llama-cpp kurulamadi");

    console.log("[4/5] extension icerigi derleniyor");
    mkdirSync(STAGE_EXT, { recursive: true });
    for (const rel of ["out", "media"]) {
        if (existsSync(join(VSC, rel))) copyTree(join(VSC, rel), join(STAGE_EXT, rel));
    }
    for (const rel of ["package.json", "LICENSE", "README.md"]) {
        if (existsSync(join(VSC, rel))) cpSync(join(VSC, rel), join(STAGE_EXT, rel), { force: true });
    }
    copyTree(join(depCache, "node_modules"), join(STAGE_EXT, "node_modules"));

    const manifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Id="${id}" Version="${version}" Publisher="takimcizgisi" Language="*" />
    <DisplayName>AJAN</DisplayName>
    <Description xml:space="preserve">Otonom yerel AI kodlama asistanı (AJAN AI). Yerel LLM tabanlı sohbet ve kodlama ajanı.</Description>
    <Tags>AI;Local;LLM;Agent;Coding</Tags>
    <GalleryFlags>Public</GalleryFlags>
    <License>extension/LICENSE</License>
    <MoreInfo>https://github.com/takimcizgisi/ajan</MoreInfo>
    <Icon>extension/media/assets/ajan.png</Icon>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.95.0" />
      <Property Id="Microsoft.VisualStudio.Code.PreRelease" Value="false" />
    </Properties>
    <Icon>extension/media/assets/ajan.png</Icon>
  </Metadata>
  <Installations>
    <Installation Target="Microsoft.VisualStudio.Code" />
  </Installations>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" />
  </Assets>
</PackageManifest>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="vsixmanifest" ContentType="text/xml" />
  <Default Extension="json" ContentType="application/json" />
  <Default Extension="js" ContentType="text/javascript" />
  <Default Extension="css" ContentType="text/css" />
  <Default Extension="html" ContentType="text/html" />
  <Default Extension="md" ContentType="text/markdown" />
  <Default Extension="png" ContentType="image/png" />
  <Default Extension="svg" ContentType="image/svg+xml" />
  <Default Extension="woff" ContentType="font/woff" />
  <Default Extension="ttf" ContentType="font/ttf" />
  <Default Extension="txt" ContentType="text/plain" />
  <Default Extension="map" ContentType="application/json" />
  <Default Extension="node" ContentType="application/octet-stream" />
  <Default Extension="dll" ContentType="application/octet-stream" />
  <Default Extension="so" ContentType="application/octet-stream" />
  <Default Extension="dylib" ContentType="application/octet-stream" />
  <Default Extension="wasm" ContentType="application/wasm" />
  <Default Extension="bin" ContentType="application/octet-stream" />
  <Default Extension="exe" ContentType="application/octet-stream" />
  <Default Extension="eot" ContentType="font/eot" />
  <Default Extension="otf" ContentType="font/otf" />
  <Default Extension="htc" ContentType="text/plain" />
</Types>`;

    writeFileSync(join(staging, "extension.vsixmanifest"), manifest, "utf8");
    writeFileSync(join(staging, "[Content_Types].xml"), contentTypes, "utf8");

    console.log("[5/5] zip (vsix) uretiliyor");
    const vsixPath = join(VSC, `ajan-${version}.vsix`);
    rmSync(vsixPath, { force: true });
    execSync(`tar --format=zip -cf "${vsixPath}" -C "${staging}" extension extension.vsixmanifest "[Content_Types].xml"`, { stdio: "inherit", shell: "cmd.exe" });

    console.log(`VSIX hazir: ${vsixPath}`);
} finally {
    rmSync(staging, { recursive: true, force: true });
    for (const f of readdirSync(ROOT)) if (f.endsWith(".tgz")) rmSync(join(ROOT, f), { force: true });
}