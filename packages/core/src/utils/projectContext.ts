import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MAX_CONTEXT_CHARS = 20_000;

const CANDIDATES = ["AGENTS.md", "AJAN.md"] as const;

/** cwd içinde AGENTS.md veya AJAN.md varsa içeriğini sistem promptuna eklenebilir metin olarak döndürür */
export function loadProjectContext(cwd: string): string {
    for (const name of CANDIDATES) {
        const file = join(cwd, name);
        if (!existsSync(file)) continue;
        try {
            const content = readFileSync(file, "utf8").trim();
            if (!content) return "";
            const limited = content.length > MAX_CONTEXT_CHARS ? `${content.slice(0, MAX_CONTEXT_CHARS)}\n... [proje notları kesildi]` : content;
            return `\n\n--- PROJE NOTLARI (${name}) ---\n${limited}\n--- PROJE NOTLARI SONU ---`;
        } catch {
            /* okunamayan not dosyasını yut */
        }
    }
    return "";
}
