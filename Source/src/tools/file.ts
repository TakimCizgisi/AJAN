import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname, isAbsolute } from "node:path";
import type { AgentTool } from "../config/types.js";
import { limitOutput } from "./utils.js";

function resolvePath(cwd: string, input: string): string {
    return isAbsolute(input) ? resolve(input) : resolve(cwd, input);
}

function globToRegExp(glob: string): RegExp {
    const escaped = glob
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "@@DOUBLE_STAR@@")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]")
        .replace(/@@DOUBLE_STAR@@/g, ".*");
    return new RegExp(`^${escaped}$`);
}

function normalizeLines(text: string): string {
    return text.replace(/\r\n/g, "\n");
}

export const readFileTool: AgentTool = {
    name: "read_file",
    description: "Bir dosyanın içeriğini okur. Büyük dosyalar için offset/limit ile kısmi okuma yapılabilir.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Okunacak dosyanın yolu (cwd'ye göre göreli veya mutlak)" },
            offset: { type: "integer", description: "Başlangıç satır numarası (1 tabanlı)" },
            limit: { type: "integer", description: "Okunacak maksimum satır sayısı" }
        },
        required: ["path"]
    },
    handler: async (params: { path: string; offset?: number; limit?: number }, ctx) => {
        const filePath = resolvePath(ctx.cwd, params.path);
        if (!existsSync(filePath)) {
            return { ok: false, output: `Dosya bulunamadı: ${params.path}` };
        }
        const stat = statSync(filePath);
        if (!stat.isFile()) {
            return { ok: false, output: `Bu bir dosya değil: ${params.path}` };
        }
        if (stat.size > 2 * 1024 * 1024 && !params.offset && !params.limit) {
            return {
                ok: false,
                output: `Dosya çok büyük (${stat.size} bayt). offset/limit parametreleriyle kısmi okuma yapın.`
            };
        }
        const content = normalizeLines(readFileSync(filePath, "utf8"));
        const lines = content.split("\n");
        const totalLines = lines.length;
        const start = params.offset ? Math.max(1, params.offset) : 1;
        const end = params.limit ? Math.min(totalLines, start + params.limit - 1) : totalLines;
        const slice = lines.slice(start - 1, end);
        const numbered = slice.map((line, i) => `${String(start + i).padStart(6)} | ${line}`).join("\n");
        const header = `Dosya: ${filePath}\nSatırlar: ${start}-${end} / ${totalLines}\n`;
        return { ok: true, output: header + numbered };
    }
};

export const writeFileTool: AgentTool = {
    name: "write_file",
    description:
        "Bir dosyaya içerik yazar (oluşturur veya üzerine yazar). append=true ise sona ekler. " +
        "Klasörler otomatik oluşturulur.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Yazılacak dosyanın yolu" },
            content: { type: "string", description: "Dosya içeriği" },
            append: { type: "boolean", description: "true ise içeriği dosyanın sonuna ekler (varsayılan: false)" }
        },
        required: ["path", "content"]
    },
    handler: async (params: { path: string; content: string; append?: boolean }, ctx) => {
        const filePath = resolvePath(ctx.cwd, params.path);
        mkdirSync(dirname(filePath), { recursive: true });
        const content = normalizeLines(params.content);
        writeFileSync(filePath, content, { encoding: "utf8", flag: params.append ? "a" : "w" });
        const action = params.append ? "eklendi" : "yazıldı";
        return { ok: true, output: `Dosya ${action}: ${filePath} (${Buffer.byteLength(content)} bayt)` };
    }
};

export const listDirTool: AgentTool = {
    name: "list_dir",
    description: "Bir dizindeki dosya ve klasörleri listeler. recursive=true ile alt dizinler de dahil edilir.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Listelenecek dizin (varsayılan: cwd)" },
            recursive: { type: "boolean", description: "Alt dizinleri de listele (varsayılan: false)" }
        }
    },
    handler: async (params: { path?: string; recursive?: boolean }, ctx) => {
        const dirPath = resolvePath(ctx.cwd, params.path ?? ".");
        if (!existsSync(dirPath)) {
            return { ok: false, output: `Dizin bulunamadı: ${params.path ?? "."}` };
        }
        if (!statSync(dirPath).isDirectory()) {
            return { ok: false, output: `Bu bir dizin değil: ${params.path ?? "."}` };
        }
        const entries: string[] = [];
        const walk = (current: string, depth: number): void => {
            let children;
            try {
                children = readdirSync(current, { withFileTypes: true });
            } catch (err) {
                entries.push(`  ${"  ".repeat(depth)}[hata: ${(err as Error).message}]`);
                return;
            }
            for (const child of children) {
                const childPath = join(current, child.name);
                const isDir = child.isDirectory();
                const indent = "  ".repeat(depth);
                const rel = childPath.replace(dirPath, ".").replace(/\\/g, "/");
                if (isDir) {
                    entries.push(`${indent}${rel}/`);
                    if (params.recursive && depth < 5) walk(childPath, depth + 1);
                } else {
                    const size = statSync(childPath).size;
                    entries.push(`${indent}${rel} (${size} bayt)`);
                }
            }
        };
        walk(dirPath, 0);
        return { ok: true, output: `Dizin: ${dirPath}\n${entries.join("\n")}` };
    }
};

export const searchFilesTool: AgentTool = {
    name: "search_files",
    description: "Bir dizindeki dosyaları isim desenine (glob) göre arar.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Aranacak dizin (varsayılan: cwd)" },
            pattern: { type: "string", description: "Glob deseni, ör. '*.ts' veya '**/*.ts'" }
        },
        required: ["pattern"]
    },
    handler: async (params: { path?: string; pattern: string }, ctx) => {
        const dirPath = resolvePath(ctx.cwd, params.path ?? ".");
        const matches: string[] = [];
        const pattern = params.pattern.replace(/^\/+/, "").replace(/\\/g, "/");
        const regex = globToRegExp(pattern);
        const walk = (current: string, depth: number): void => {
            if (depth > 8) return;
            let children;
            try {
                children = readdirSync(current, { withFileTypes: true });
            } catch {
                return;
            }
            for (const child of children) {
                const childPath = join(current, child.name);
                const rel = childPath.replace(dirPath, "").replace(/^[\\/]+/, "").replace(/\\/g, "/");
                if (child.isDirectory()) {
                    if (rel.split("/").some((p) => p.startsWith(".")) || child.name === "node_modules") continue;
                    if (regex.test(`${rel}/`)) matches.push(`${rel}/`);
                    walk(childPath, depth + 1);
                } else {
                    if (regex.test(rel)) matches.push(rel);
                }
            }
        };
        walk(dirPath, 0);
        const result = matches.length > 0 ? matches.join("\n") : "Eşleşen dosya bulunamadı.";
        return { ok: true, output: `Glob: ${params.pattern}\n${result}` };
    }
};

export const grepTool: AgentTool = {
    name: "grep_files",
    description: "Dosyalarda içerik araması yapar. pattern bir regex'dir.",
    parameters: {
        type: "object",
        properties: {
            path: { type: "string", description: "Aranacak dizin (varsayılan: cwd)" },
            pattern: { type: "string", description: "Regex deseni" },
            include: { type: "string", description: "Dosya deseni filtresi, ör. '*.ts'" }
        },
        required: ["pattern"]
    },
    handler: async (params: { path?: string; pattern: string; include?: string }, ctx) => {
        const dirPath = resolvePath(ctx.cwd, params.path ?? ".");
        const regex = new RegExp(params.pattern);
        const results: string[] = [];
        let fileCount = 0;
        const walk = (current: string, depth: number): void => {
            if (depth > 8 || fileCount > 500) return;
            let children;
            try {
                children = readdirSync(current, { withFileTypes: true });
            } catch {
                return;
            }
            for (const child of children) {
                if (child.name.startsWith(".") || child.name === "node_modules") continue;
                const childPath = join(current, child.name);
                if (child.isDirectory()) {
                    walk(childPath, depth + 1);
                } else {
                    if (params.include && !child.name.match(new RegExp(`^${params.include.replace(/\./g, "\\.").replace(/\*/g, ".*")}$`))) continue;
                    fileCount++;
                    if (statSync(childPath).size > 2 * 1024 * 1024) continue;
                    try {
                        const lines = normalizeLines(readFileSync(childPath, "utf8")).split("\n");
                        for (let i = 0; i < lines.length; i++) {
                            const line = lines[i] ?? "";
                            if (regex.test(line)) {
                                results.push(`${childPath.replace(dirPath, ".")}:${i + 1}: ${line.trim().slice(0, 200)}`);
                            }
                        }
                    } catch {
                        /* okunamayan dosyayı atla */
                    }
                }
            }
        };
        walk(dirPath, 0);
        return { ok: true, output: limitOutput(results.join("\n"), ctx.config.maxToolOutput) };
    }
};
