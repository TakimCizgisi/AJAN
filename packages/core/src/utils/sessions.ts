import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ChatHistoryItem } from "node-llama-cpp";

export type StoredMessage = {
    kind: "user" | "assistant" | "thought" | "info" | "tool";
    text?: string;
    name?: string;
    state?: "running" | "done" | "error";
    startedAt?: number;
    elapsed?: number;
    output?: string;
};

export type TodoItem = {
    text: string;
    done: boolean;
};

export type StoredSession = {
    id: string;
    title: string;
    mode: string;
    createdAt: string;
    updatedAt: string;
    history: ChatHistoryItem[];
    messages: StoredMessage[];
    todos?: TodoItem[];
};

const ID_RE = /^[A-Za-z0-9._-]+$/;

function sessionsDir(): string {
    return path.join(os.homedir(), ".ajan", "sessions");
}

function sessionPath(id: string): string {
    return path.join(sessionsDir(), `${id}.json`);
}

function isValidId(id: string): boolean {
    return ID_RE.test(id) && !id.includes("..");
}

export function generateSessionId(date = new Date()): string {
    const p = (n: number): string => String(n).padStart(2, "0");
    return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

export async function saveSession(session: StoredSession): Promise<void> {
    await fs.mkdir(sessionsDir(), { recursive: true });
    await fs.writeFile(sessionPath(session.id), JSON.stringify(session, null, 2), "utf8");
}

export async function loadSession(id: string): Promise<StoredSession | null> {
    if (!isValidId(id)) return null;
    try {
        const raw = await fs.readFile(sessionPath(id), "utf8");
        const data = JSON.parse(raw) as StoredSession;
        if (!data || typeof data !== "object" || typeof data.id !== "string") return null;
        return data;
    } catch {
        return null;
    }
}

export async function deleteSession(id: string): Promise<void> {
    if (!isValidId(id)) return;
    try {
        await fs.rm(sessionPath(id), { force: true });
    } catch {
        /* yok say */
    }
}

export async function listSessions(): Promise<StoredSession[]> {
    try {
        const entries = await fs.readdir(sessionsDir());
        const sessions: StoredSession[] = [];
        for (const entry of entries) {
            if (!entry.endsWith(".json")) continue;
            const data = await loadSession(entry.slice(0, -5));
            if (data) sessions.push(data);
        }
        sessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
        return sessions;
    } catch {
        return [];
    }
}
