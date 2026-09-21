import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { extname, resolve } from "node:path";
import { load as loadYaml } from "js-yaml";
import AdmZip from "adm-zip";
import type { AgentTool } from "../config/types.js";
import { limitOutput, resolveUserPath } from "./utils.js";

function describeStructure(value: unknown, depth = 0): string {
    if (depth > 2) return typeof value;
    if (Array.isArray(value)) {
        const sample = value.slice(0, 3).map((v) => describeStructure(v, depth + 1));
        return `dizi[${value.length}]<${sample.join(", ")}${value.length > 3 ? ", …" : ""}>`;
    }
    if (value && typeof value === "object") {
        const keys = Object.keys(value as Record<string, unknown>);
        const shown = keys.slice(0, 12).map((k) => `${k}: ${describeStructure((value as Record<string, unknown>)[k], depth + 1)}`);
        return `nesne{${keys.length}}{ ${shown.join(", ")}${keys.length > 12 ? ", …" : ""} }`;
    }
    if (typeof value === "string") return `metin(${value.length})`;
    return String(value);
}

export const readDataTool: AgentTool = {
    name: "read_data",
    description:
        "JSON veya YAML dosyasını ayrıştırıp özetini ve yapısını döner. Yapılandırma dosyalarını incelemek için idealdir.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "JSON/YAML dosya yolu" }
        },
        required: ["path"]
    },
    handler: async (params: { path?: string }, ctx) => {
        const p = params.path?.trim();
        if (!p) return { ok: false, output: "path zorunludur." };
        const filePath = resolveUserPath(ctx.cwd, p);
        if (!existsSync(filePath)) return { ok: false, output: `Dosya bulunamadı: ${p}` };
        if (!statSync(filePath).isFile()) return { ok: false, output: `Bu bir dosya değil: ${p}` };
        const ext = extname(filePath).toLowerCase();
        let data: unknown;
        try {
            const raw = readFileSync(filePath, "utf8");
            if (ext === ".yaml" || ext === ".yml") {
                data = loadYaml(raw);
            } else if (ext === ".json") {
                data = JSON.parse(raw);
            } else {
                try {
                    data = JSON.parse(raw);
                } catch {
                    data = loadYaml(raw);
                }
            }
        } catch (err) {
            return { ok: false, output: `Ayrıştırma hatası: ${(err as Error).message}` };
        }
        const pretty = JSON.stringify(data, null, 2);
        const summary = `Dosya: ${filePath}\nYapı: ${describeStructure(data)}\n\n${pretty}`;
        return { ok: true, output: limitOutput(summary, Math.min(ctx.config.maxToolOutput ?? 40_000, 20_000)) };
    }
};

export const unzipFileTool: AgentTool = {
    name: "unzip_file",
    description: "ZIP arşivini hedef klasöre açar. Hedef verilmezse zip'in yanına açılır.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "ZIP dosyası yolu" },
            destination: { type: "string", description: "Hedef klasör (opsiyonel)" }
        },
        required: ["path"]
    },
    handler: async (params: { path?: string; destination?: string }, ctx) => {
        const p = params.path?.trim();
        if (!p) return { ok: false, output: "path zorunludur." };
        const zipPath = resolveUserPath(ctx.cwd, p);
        if (!existsSync(zipPath)) return { ok: false, output: `Dosya bulunamadı: ${p}` };
        let destDir: string;
        if (params.destination?.trim()) {
            destDir = resolveUserPath(ctx.cwd, params.destination.trim());
            if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
        } else {
            destDir = resolve(zipPath, "..");
        }
        try {
            const zip = new AdmZip(zipPath);
            const entries = zip.getEntries();
            zip.extractAllTo(destDir, true);
            const names = entries
                .filter((e) => !e.isDirectory)
                .slice(0, 30)
                .map((e) => e.entryName);
            const more = entries.length > 30 ? `\n… ve ${entries.length - 30} dosya daha` : "";
            return { ok: true, output: `${entries.length} girdi açıldı → ${destDir}\n${names.join("\n")}${more}` };
        } catch (err) {
            return { ok: false, output: `Açma başarısız: ${(err as Error).message}` };
        }
    }
};
