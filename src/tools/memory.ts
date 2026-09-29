import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentTool } from "../config/types.js";
import { limitOutput } from "./utils.js";

type Note = { id: number; text: string; createdAt: string };

type NotesFile = { notes: Note[] };

function notesPath(): string {
    const base = process.env.AJAN_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".ajan");
    return join(base, "notes.json");
}

function loadNotes(): NotesFile {
    try {
        if (existsSync(notesPath())) {
            const parsed = JSON.parse(readFileSync(notesPath(), "utf8")) as Partial<NotesFile>;
            return { notes: Array.isArray(parsed.notes) ? parsed.notes : [] };
        }
    } catch {
        /* bozuk dosya: sıfırla */
    }
    return { notes: [] };
}

function saveNotes(data: NotesFile): void {
    writeFileSync(notesPath(), JSON.stringify(data, null, 2), "utf8");
}

export const noteAddTool: AgentTool = {
    name: "not_al",
    description:
        "Kalıcı hafızaya not alır. Kullanıcı tercihleri, proje kararları, önemli bilgiler için kullan. " +
        "Notlar oturumlar arasında korunur (~/.ajan/notes.json).",
    parameters: {
        type: "object",
        properties: {
            text: { type: "string", description: "Kaydedilecek not metni" }
        },
        required: ["text"]
    },
    handler: async (params: { text?: string }) => {
        const text = (params.text ?? "").trim();
        if (!text) return { ok: false, output: "Not metni boş olamaz." };
        const data = loadNotes();
        const id = data.notes.reduce((max, n) => Math.max(max, n.id), 0) + 1;
        data.notes.push({ id, text, createdAt: new Date().toISOString() });
        saveNotes(data);
        return { ok: true, output: `Not #${id} kaydedildi.` };
    }
};

export const noteReadTool: AgentTool = {
    name: "not_oku",
    description:
        "Kalıcı hafızadaki notları okur. query verilirse içinde o kelime geçen notlar döner; yoksa son 30 not.",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "Notlar içinde aranacak kelime (opsiyonel)" }
        },
        required: []
    },
    handler: async (params: { query?: string }, ctx) => {
        const data = loadNotes();
        let notes = data.notes;
        const q = params.query?.trim().toLowerCase();
        if (q) notes = notes.filter((n) => n.text.toLowerCase().includes(q));
        if (notes.length === 0) return { ok: true, output: q ? `"${params.query}" ile eşleşen not yok.` : "Hafızada not yok." };
        const slice = notes.slice(-30);
        const lines = slice.map((n) => `#${n.id} [${n.createdAt.slice(0, 10)}] ${n.text}`);
        const header = `${notes.length} not${q ? ` ("${params.query}")` : ""}${notes.length > slice.length ? ` (son ${slice.length} gösteriliyor)` : ""}:\n`;
        return { ok: true, output: limitOutput(header + lines.join("\n"), ctx.config.maxToolOutput) };
    }
};
