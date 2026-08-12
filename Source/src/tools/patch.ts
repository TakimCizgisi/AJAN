import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, isAbsolute } from "node:path";
import type { AgentTool } from "../config/types.js";
import { logger } from "../utils/paths.js";

function resolvePath(cwd: string, input: string): string {
    return isAbsolute(input) ? resolve(input) : resolve(cwd, input);
}

type Hunk = {
    oldStart: number;
    newStart: number;
    lines: { type: " " | "+" | "-"; text: string }[];
};

function parseUnifiedDiff(diff: string): { file: string; hunks: Hunk[] } | null {
    const lines = diff.replace(/\r\n/g, "\n").split("\n");
    let file: string | undefined;
    const hunks: Hunk[] = [];
    let current: Hunk | undefined;

    for (const rawLine of lines) {
        if (rawLine.startsWith("--- ")) {
            file = rawLine.slice(4).replace(/^\s*[ab]\//, "").trim();
            continue;
        }
        if (rawLine.startsWith("+++ ")) continue;
        const hunkMatch = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(rawLine);
        if (hunkMatch) {
            current = {
                oldStart: parseInt(hunkMatch[1] ?? "1", 10),
                newStart: parseInt(hunkMatch[3] ?? "1", 10),
                lines: []
            };
            hunks.push(current);
            continue;
        }
        if (!current) continue;
        if (rawLine.startsWith("+")) {
            current.lines.push({ type: "+", text: rawLine.slice(1) });
        } else if (rawLine.startsWith("-")) {
            current.lines.push({ type: "-", text: rawLine.slice(1) });
        } else if (rawLine.startsWith(" ")) {
            current.lines.push({ type: " ", text: rawLine.slice(1) });
        } else if (rawLine.startsWith("\\")) {
            continue;
        }
    }

    if (!file || hunks.length === 0) return null;
    return { file, hunks };
}

function applyHunks(original: string, hunks: Hunk[]): { result: string; changedLines: number } {
    const lines = original.split("\n");
    const newLines: string[] = [];
    let oldLine = 1;
    let changedLines = 0;

    for (const hunk of hunks) {
        while (oldLine < hunk.oldStart && oldLine <= lines.length) {
            newLines.push(lines[oldLine - 1] ?? "");
            oldLine++;
        }
        let oldPos = hunk.oldStart;
        let contextMatched = true;
        const contextCheck = hunk.lines.filter((l) => l.type !== "+");
        for (const cl of contextCheck) {
            const current = lines[oldPos - 1];
            if (current !== cl.text) {
                contextMatched = false;
                break;
            }
            oldPos++;
        }
        if (!contextMatched) {
            throw new Error(
                `Hunk satırları eşleşmiyor (${hunk.oldStart}. satır civarı). Dosya içeriği güncelliğini yitirmiş olabilir.`
            );
        }
        for (const line of hunk.lines) {
            if (line.type === "-") {
                oldLine++;
                changedLines++;
            } else if (line.type === "+") {
                newLines.push(line.text);
                changedLines++;
            } else {
                newLines.push(line.text);
                oldLine++;
            }
        }
        oldPos = 0;
    }
    while (oldLine <= lines.length) {
        newLines.push(lines[oldLine - 1] ?? "");
        oldLine++;
    }
    return { result: newLines.join("\n"), changedLines };
}

export const applyPatchTool: AgentTool = {
    name: "apply_patch",
    description:
        "Unified diff formatında bir yamayı dosyaya uygular. Eksiksiz dosya değişiklikleri için write_file'ı tercih edin. " +
        "Yama formatı: --- a/yol + +++ b/yol + @@ -eskiSatır,sayı +yeniSatır,sayı @@ + satırlar. " +
        "Küçük ve hedefli değişikliklerde daha güvenilirdir.",
    parameters: {
        type: "object",
        properties: {
            patch: { type: "string", description: "Uygulanacak unified diff içeriği" },
            cwd: { type: "string", description: "Göreli yolların çözüleceği dizin" }
        },
        required: ["patch"]
    },
    handler: async (params: { patch: string; cwd?: string }, ctx) => {
        const parsed = parseUnifiedDiff(params.patch);
        if (!parsed) {
            return { ok: false, output: "Geçerli bir unified diff bulunamadı. --- a/yol ve @@ hunk satırları gerekli." };
        }
        const filePath = resolvePath(params.cwd ?? ctx.cwd, parsed.file);
        if (!existsSync(filePath)) {
            return { ok: false, output: `Yamalanacak dosya bulunamadı: ${parsed.file}` };
        }
        const original = readFileSync(filePath, "utf8");
        try {
            const { result, changedLines } = applyHunks(original, parsed.hunks);
            writeFileSync(filePath, result, "utf8");
            logger.debug(`Patch uygulandi: ${filePath} (${changedLines} satir degisti)`);
            return { ok: true, output: `Yama uygulandı: ${filePath} (${changedLines} satır değişti)` };
        } catch (err) {
            return { ok: false, output: `Yama uygulanamadı: ${(err as Error).message}` };
        }
    }
};

export { parseUnifiedDiff };
