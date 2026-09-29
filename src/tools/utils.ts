import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";

export function limitOutput(text: string, maxChars?: number): string {
    const limit = maxChars ?? 40_000;
    if (text.length <= limit) return text;
    const truncated = text.slice(0, limit);
    return `${truncated}\n... [çıktı ${text.length - limit} karakter kesildi]`;
}

export const SKIP_DIRS = new Set<string>([
    "node_modules", ".git", "dist", "build", ".next", ".cache",
    "__pycache__", ".venv", "venv", ".idea", ".vscode", "coverage"
]);

/** Ağır veya gizli klasörlerde gezinmeyi atla (node_modules, dist, .git vb.) */
export function shouldSkipDir(name: string): boolean {
    return name.startsWith(".") || SKIP_DIRS.has(name);
}

export function toMb(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function homeFolder(key: string): string | null {
    const candidates: string[] = [];
    const home = os.homedir();
    candidates.push(path.join(home, key));
    const userProfile = process.env.USERPROFILE ?? process.env.HOME;
    if (userProfile) candidates.push(path.join(userProfile, key));
    const oneDrive = process.env.ONEDRIVE;
    if (oneDrive) candidates.push(path.join(oneDrive, key));
    for (const c of candidates) {
        try {
            if (existsSync(c)) return c;
        } catch {
            /* yut */
        }
    }
    return candidates[0] ?? null;
}

const FOLDER_PATTERNS: Array<{ regex: RegExp; key: "Desktop" | "Documents" | "Downloads" }> = [
    { regex: /masaüstü|masaustu|desktop/i, key: "Desktop" },
    { regex: /belgeler|belgelerim|belge|documents/i, key: "Documents" },
    { regex: /indirilenler|indirilen|indirmeler|downloads/i, key: "Downloads" }
];

/** 'masaüstü', 'belgeler', 'indirilenler' gibi adları kullanıcının gerçek klasörlerine çözer */
export function resolveUserPath(cwd: string, input: string): string {
    const trimmed = input.trim();
    for (const { regex, key } of FOLDER_PATTERNS) {
        const match = trimmed.match(new RegExp(`^(${regex.source})(?:[\\\\/](.*))?$`, "i"));
        if (!match) continue;
        const base = homeFolder(key);
        if (!base) continue;
        const rest = match[2];
        return rest ? path.resolve(base, rest) : base;
    }
    return path.isAbsolute(input) ? path.resolve(input) : path.resolve(cwd, input);
}

