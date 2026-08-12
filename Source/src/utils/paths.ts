/**
 * ============================================================
 * 
 *   AJAN
 *   Copyright (C) 2026 TakımÇizgisi
 *   Tüm hakları saklıdır.
 * 
 * ============================================================
 * 
 *   BU KODU YAZANLAR:
 * 
 *   ┌──────┬──────────────────────┬─────────────────────────┐
 *   │ No   │ Yazar Adı            │ Görev/Rol               │
 *   ├──────┼──────────────────────┼─────────────────────────┤
 *   │  1   │ İbrahim Anadol       │ Direkt Tüm Sistem       │
 *   │      │ (@ibrahimanadol)     │ (Ana Fikir Sahibi)      │
 *   │      │ GitHub'da            │                         │
 *   └──────┴──────────────────────┴─────────────────────────┘
 * 
 *   Son Güncelleme: 11.08.2026
 *   Versiyon: 1.0.0
 * 
 * ============================================================
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
    currentLevel = level;
}

const levelOrder: Record<LogLevel, number> = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4
};

function log(level: LogLevel, tag: string, ...args: unknown[]): void {
    if (levelOrder[level] > levelOrder[currentLevel]) return;
    const prefix = `[${tag}]`;
    if (level === "error") {
        console.error(prefix, ...args);
    } else if (level === "warn") {
        console.warn(prefix, ...args);
    } else {
        console.log(prefix, ...args);
    }
}

export const logger = {
    error: (...args: unknown[]) => log("error", "hata", ...args),
    warn: (...args: unknown[]) => log("warn", "uyari", ...args),
    info: (...args: unknown[]) => log("info", "bilgi", ...args),
    debug: (...args: unknown[]) => log("debug", "debug", ...args)
};

export function getDataDir(): string {
    const base = process.env.AJAN_HOME ?? join(os.homedir(), ".ajan");
    mkdirSync(base, { recursive: true });
    return base;
}

export function getModelsDir(): string {
    const dir = join(getDataDir(), "models");
    mkdirSync(dir, { recursive: true });
    return dir;
}

export function getConfigPath(): string {
    return join(getDataDir(), "config.json");
}

export function getCacheDir(): string {
    const dir = join(getDataDir(), "cache");
    mkdirSync(dir, { recursive: true });
    return dir;
}

export function getLogDir(): string {
    const dir = join(getDataDir(), "logs");
    mkdirSync(dir, { recursive: true });
    return dir;
}
