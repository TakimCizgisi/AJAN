import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { AgentTool } from "../config/types.js";
import { limitOutput } from "./utils.js";

/** Kullanıcının açık klasöründe, projenin içindeki AJAN test klasörü: <cwd>/.ajan */
function playgroundPath(cwd: string): string {
    const dir = join(cwd, ".ajan");
    mkdirSync(dir, { recursive: true });
    return dir;
}

function todosPath(cwd: string): string {
    return join(playgroundPath(cwd), "todos.json");
}

type TodoItem = { text: string; done: boolean };

function loadTodos(cwd: string): TodoItem[] {
    try {
        if (existsSync(todosPath(cwd))) {
            const parsed = JSON.parse(readFileSync(todosPath(cwd), "utf8"));
            if (Array.isArray(parsed)) return parsed as TodoItem[];
        }
    } catch {
        /* bozuk dosya: sıfırla */
    }
    return [];
}

function clearDir(dir: string): number {
    let count = 0;
    for (const name of readdirSync(dir)) {
        rmSync(join(dir, name), { recursive: true, force: true });
        count++;
    }
    return count;
}

export const openPlaygroundTool: AgentTool = {
    name: "open_playground",
    description:
        "Açık klasörün içindeki AJAN TEST KLASÖRÜNÜ (<cwd>/.ajan) hazırlar. " +
        "Deneme/test/prototip yapmak istediğinde önce bunu çağır. " +
        "reset=false iken masaarkadaşları korur; reset=true ise klasörü bomboş hale getirir. " +
        "Kullanıcının gerçek proje dosyalarına kesinlikle dokunmaz; tüm denemeler bu klasörde yapılır.",
    parameters: {
        type: "object",
        properties: {
            reset: {
                type: "boolean",
                description: "true ise .ajan içeriğini komple temizler (varsayılan: false)"
            },
            note: { type: "string", description: "Ne yapacağın hakkında kısa bir not (opsiyonel)" }
        },
        required: []
    },
    handler: async (params: { reset?: boolean; note?: string }, ctx) => {
        const dir = playgroundPath(ctx.cwd);
        const before = readdirSync(dir).length;
        let cleared = 0;
        if (params.reset) cleared = clearDir(dir);
        const after = readdirSync(dir).length;
        const lines = [
            `.ajan test klasörü hazır: ${dir}`,
            `Önceki içerik: ${before} öğe; sonraki içerik: ${after} öğe${cleared > 0 ? ` (${cleared} temizlendi)` : ""}`
        ];
        if (params.note) lines.push(`Not: ${params.note}`);
        lines.push("KURAL: tüm denemeleri, geçici dosyaları ve riskli testleri BURADA yap; asıl projeye dokunma.");
        return { ok: true, output: lines.join("\n") };
    }
};

export const setTodosTool: AgentTool = {
    name: "set_todos",
    description:
        "Görev programını (.ajan/todos.json) günceller. " +
        "Bir göreve başlarken önce kısa bir TODO listesi planla ve bu araçla kaydet. " +
        "done=false adım halen beklemede, done=true tamamlandı demektir.",
    parameters: {
        type: "object",
        properties: {
            todos: {
                type: "array",
                description: "Yapılacaklar listesi",
                items: {
                    type: "object",
                    properties: {
                        text: { type: "string", description: "Adım açıklaması" },
                        done: { type: "boolean", description: "Tamamlandı mı (varsayılan false)" }
                    },
                    required: ["text"]
                }
            }
        },
        required: ["todos"]
    },
    handler: async (params: { todos?: TodoItem[] }, ctx) => {
        const raw = params.todos;
        if (!raw || raw.length === 0) return { ok: false, output: "todos listesi boş olamaz." };
        const items: TodoItem[] = raw.map((t) => ({
            text: String(t.text ?? "").trim(),
            done: t.done === true
        }));
        if (items.some((t) => !t.text)) return { ok: false, output: "Her TODO maddesi için text gerekli." };
        writeFileSync(todosPath(ctx.cwd), JSON.stringify(items, null, 2), "utf8");
        const lines = items.map((t, i) => `${t.done ? "[x]" : "[ ]"} ${i + 1}. ${t.text}`);
        return {
            ok: true,
            output: `TODO listesi kaydedildi (${items.length} madde): ${todosPath(ctx.cwd)}\n${lines.join("\n")}`
        };
    }
};

export const getTodosTool: AgentTool = {
    name: "get_todos",
    description: "Görev programını (.ajan/todos.json) okur. Kayıtlı TODO varsa döndürür, yoksa boş döner.",
    parameters: {
        type: "object",
        properties: {}
    },
    handler: async (_params: unknown, ctx) => {
        const items = loadTodos(ctx.cwd);
        if (items.length === 0) {
            return { ok: true, output: "Kayıtlı TODO yok. Göreve başlarken set_todos ile plan oluştur." };
        }
        const lines = items.map((t, i) => `${t.done ? "[x]" : "[ ]"} ${i + 1}. ${t.text}`);
        return { ok: true, output: limitOutput(`Görev programı (${items.length} madde):\n${lines.join("\n")}`, ctx.config.maxToolOutput) };
    }
};