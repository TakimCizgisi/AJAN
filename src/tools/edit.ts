import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { AgentTool } from "../config/types.js";
import { resolveUserPath } from "./utils.js";

function normalizeLines(text: string): string {
    return text.replace(/\r\n/g, "\n");
}

export const editFileTool: AgentTool = {
    name: "edit_file",
    description:
        "Bir dosyada tam eşleşen eski metni yeni metinle değiştirir (hedefli düzenleme). " +
        "Eski metin dosyada yalnızca BİR kez geçmelidir; birden fazla geçiyorsa replaceAll=true kullanın. " +
        "Küçük ve hedefli değişikliklerde write_file'a göre daha güvenilirdir.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Düzenlenecek dosyanın yolu" },
            oldString: { type: "string", description: "Değiştirilecek mevcut metin (birebir eşleşme)" },
            newString: { type: "string", description: "Eski metnin yerine geçecek yeni metin" },
            replaceAll: { type: "boolean", description: "true ise tüm eşleşmeleri değiştirir (varsayılan: false)" },
            cwd: { type: "string", description: "Göreli yolların çözüleceği dizin" }
        },
        required: ["path", "oldString", "newString"]
    },
    handler: async (params: { path: string; oldString: string; newString: string; replaceAll?: boolean; cwd?: string }, ctx) => {
        const filePath = resolveUserPath(params.cwd ?? ctx.cwd, params.path);
        if (!existsSync(filePath)) {
            return { ok: false, output: `Dosya bulunamadı: ${params.path}` };
        }
        const original = normalizeLines(readFileSync(filePath, "utf8"));
        const oldText = normalizeLines(params.oldString);
        const newText = normalizeLines(params.newString);

        if (oldText.length === 0) {
            return { ok: false, output: "oldString boş olamaz." };
        }

        const count = original.split(oldText).length - 1;
        if (count === 0) {
            return { ok: false, output: `Eşleşme bulunamadı: "${params.oldString.slice(0, 120)}". Dosya içeriği değişmiş olabilir; read_file ile kontrol edin.` };
        }
        if (count > 1 && !params.replaceAll) {
            return {
                ok: false,
                output: `"${params.oldString.slice(0, 120)}" dosyada ${count} kez geçiyor. Tek bir eşleşmeyi hedefleyin ya da replaceAll=true kullanın.`
            };
        }

        const result = params.replaceAll ? original.split(oldText).join(newText) : original.replace(oldText, newText);
        writeFileSync(filePath, result, "utf8");
        return { ok: true, output: `Dosya düzenlendi: ${filePath} (${params.replaceAll ? count : 1} değişiklik)` };
    }
};
