import { existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AgentTool } from "../config/types.js";
import { resolveUserPath } from "./utils.js";

export const moveFileTool: AgentTool = {
    name: "move_file",
    description:
        "Dosya veya klasörü taşır / yeniden adlandırır. Hedef dizin yoksa oluşturulur. Var olan dosyanın üzerine yazmaz.",
    parameters: {
        type: "object",
        properties: {
            source: { type: "string", description: "Kaynak yol" },
            destination: { type: "string", description: "Hedef yol (dosya veya klasör)" }
        },
        required: ["source", "destination"]
    },
    handler: async (params: { source?: string; destination?: string }, ctx) => {
        const src = params.source?.trim();
        const dest = params.destination?.trim();
        if (!src || !dest) return { ok: false, output: "source ve destination zorunludur." };
        const srcPath = resolveUserPath(ctx.cwd, src);
        const destPath = resolveUserPath(ctx.cwd, dest);
        if (srcPath === destPath) return { ok: false, output: "Kaynak ve hedef aynı." };
        if (!existsSync(srcPath)) return { ok: false, output: `Kaynak bulunamadı: ${src}` };
        if (existsSync(destPath)) return { ok: false, output: `Hedef zaten var: ${dest} (önce silin)` };
        try {
            mkdirSync(dirname(destPath), { recursive: true });
            renameSync(srcPath, destPath);
            return { ok: true, output: `Taşındı: ${srcPath} → ${destPath}` };
        } catch (err) {
            return { ok: false, output: `Taşıma başarısız: ${(err as Error).message}` };
        }
    }
};

export const deleteFileTool: AgentTool = {
    name: "delete_file",
    description:
        "Dosya veya klasör siler. Klasörler için recursive:true gerekir. Dikkatli kullan — geri alınamaz.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Silinecek yol" },
            recursive: { type: "boolean", description: "Klasörü içeriğiyle sil (varsayılan: false)" }
        },
        required: ["path"]
    },
    handler: async (params: { path?: string; recursive?: boolean }, ctx) => {
        const p = params.path?.trim();
        if (!p) return { ok: false, output: "path zorunludur." };
        const target = resolveUserPath(ctx.cwd, p);
        if (!existsSync(target)) return { ok: false, output: `Bulunamadı: ${p}` };
        const cwdResolved = resolve(ctx.cwd);
        if (target === cwdResolved || cwdResolved.startsWith(target + "\\") || cwdResolved.startsWith(target + "/")) {
            return { ok: false, output: "Çalışma dizinini veya üstünü silemezsin." };
        }
        const stat = statSync(target);
        const isDir = stat.isDirectory();
        if (isDir && !params.recursive) {
            return { ok: false, output: `"${p}" bir klasör; silmek için recursive:true ver.` };
        }
        try {
            rmSync(target, { recursive: isDir, force: true });
            return { ok: true, output: `Silindi: ${target}${isDir ? " (klasör)" : ""}` };
        } catch (err) {
            return { ok: false, output: `Silme başarısız: ${(err as Error).message}` };
        }
    }
};
