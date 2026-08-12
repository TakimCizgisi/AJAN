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
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, basename, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfigPath, getModelsDir, getCacheDir, getDataDir } from "../utils/paths.js";
import type { AjanConfig, ModelDefinition, RemoteModelsRegistry } from "./types.js";
import { logger } from "../utils/paths.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export const DEFAULT_CONFIG: AjanConfig = {
    modelId: "gemma-4-e2b-q4-k-m",
    contextSize: "auto",
    gpuLayers: "auto",
    gpu: "auto",
    cwd: process.cwd(),
    systemPrompt: [
        "Sen AJAN AI'sin; TakimCizgisi Yazilim Gelistirme Grubu'nun otonom yerel kodlama ajanisin.",
        "Görevleri tamamlamak için verilen araçları (tools) kullan: dosya oku/yaz, terminal komutu çalıştır.",
        "Düşüncelerini kısa ve öz tut. Kullanıcıya kod ile yanıt verirken tam dosya içerikleri yerine",
        "gerekli değişiklikleri açıkla; dosya yazma aracını gerçek değişiklikler için kullan.",
        "Dosya yolları için: göreli yollar kullan (örn. src/index.ts). Çalışma dizini: " + process.cwd() + "."
    ].join("\n"),
    session: {
        temperature: 0.6,
        topK: 64,
        topP: 0.9,
        maxTokens: 8192
    },
    toolTimeout: 60_000,
    maxToolOutput: 40_000,
    remoteModelsUrl: "https://raw.githubusercontent.com/takimcizgisi/ajan/main/config/models.json"
};

const bundledModelsPath = join(__dirname, "..", "..", "config", "models.json");

let cachedConfig: AjanConfig | undefined;

function readJson<T>(path: string): T {
    return JSON.parse(readFileSync(path, "utf8")) as T;
}

function resolveBundledModels(): ModelDefinition[] {
    try {
        const registry = readJson<RemoteModelsRegistry>(bundledModelsPath);
        if (Array.isArray(registry.models)) return registry.models;
    } catch (err) {
        logger.debug(`Bundled models okunamadi: ${String(err)}`);
    }
    return [];
}

function resolveRemoteModels(url?: string): ModelDefinition[] {
    if (!url) return [];
    const cachePath = join(getCacheDir(), "remote-models.json");
    try {
        const cached = readJson<RemoteModelsRegistry>(cachePath);
        if (cached && Array.isArray(cached.models)) {
            logger.debug(`Remote models cache'ten okundu (${cached.models.length} model)`);
            return cached.models;
        }
    } catch {
        /* cache yoksa umursama */
    }
    return [];
}

export async function refreshRemoteModels(url?: string): Promise<ModelDefinition[]> {
    const source = url ?? DEFAULT_CONFIG.remoteModelsUrl;
    if (!source) return [];
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(source, { signal: controller.signal, redirect: "follow" });
        clearTimeout(timer);
        if (!res.ok) {
            logger.debug(`Remote models fetch basarisiz: HTTP ${res.status}`);
            return resolveRemoteModels(url);
        }
        const registry = (await res.json()) as RemoteModelsRegistry;
        if (!Array.isArray(registry.models)) return [];
        const cachePath = join(getCacheDir(), "remote-models.json");
        writeFileSync(cachePath, JSON.stringify({ ...registry, updatedAt: new Date().toISOString() }, null, 2));
        logger.info(`Remote model listesi guncellendi: ${registry.models.length} model`);
        return registry.models;
    } catch (err) {
        logger.debug(`Remote models guncelleme basarisiz: ${String(err)}`);
        return resolveRemoteModels(url);
    }
}

export function getModelsRegistry(): ModelDefinition[] {
    const bundled = resolveBundledModels();
    const remote = resolveRemoteModels(DEFAULT_CONFIG.remoteModelsUrl);
    const merged = new Map<string, ModelDefinition>();
    for (const m of bundled) merged.set(m.id, m);
    for (const m of remote) merged.set(m.id, m);
    return [...merged.values()];
}

export function getModelById(id: string): ModelDefinition | undefined {
    return getModelsRegistry().find((m) => m.id === id);
}

export function loadConfig(forceReload = false): AjanConfig {
    if (cachedConfig && !forceReload) return cachedConfig;
    const cfgPath = getConfigPath();
    let fileCfg: Partial<AjanConfig> = {};
    if (existsSync(cfgPath)) {
        try {
            fileCfg = readJson<Partial<AjanConfig>>(cfgPath);
        } catch (err) {
            logger.warn(`config.json parse hatasi (varsayilan kullaniliyor): ${String(err)}`);
        }
    }
    cachedConfig = {
        ...DEFAULT_CONFIG,
        ...fileCfg,
        session: { ...DEFAULT_CONFIG.session, ...fileCfg.session }
    };
    return cachedConfig;
}

export function saveConfig(config: AjanConfig): void {
    const cfgPath = getConfigPath();
    const safe = JSON.parse(JSON.stringify(config)) as AjanConfig;
    if (safe.session) {
        for (const k of Object.keys(safe.session)) {
            if (safe.session[k as keyof typeof safe.session] == null) delete safe.session[k as keyof typeof safe.session];
        }
    }
    writeFileSync(cfgPath, JSON.stringify(safe, null, 2));
    cachedConfig = safe;
}

export function resolveModelFilePath(model: ModelDefinition): string {
    const modelsDir = getModelsDir();
    const fileName = model.fileName ?? basename(model.uri);
    return join(modelsDir, fileName);
}

export function isModelInstalled(model: ModelDefinition): boolean {
    return existsSync(resolveModelFilePath(model));
}

export function listInstalledModels(): { model: ModelDefinition; path: string; installed: boolean }[] {
    const modelsDir = getModelsDir();
    if (!existsSync(modelsDir)) return [];
    const entries = getModelsRegistry();
    const result: { model: ModelDefinition; path: string; installed: boolean }[] = [];
    for (const model of entries) {
        result.push({
            model,
            path: resolveModelFilePath(model),
            installed: isModelInstalled(model)
        });
    }
    return result;
}

export function removeModelFile(model: ModelDefinition): boolean {
    const file = resolveModelFilePath(model);
    if (!existsSync(file)) return false;
    try {
        rmSync(file, { force: true });
        return true;
    } catch (err) {
        logger.error(`Model silinemedi: ${String(err)}`);
        return false;
    }
}

export function resolveAbsolutePath(cwd: string, inputPath: string): string {
    if (isAbsolute(inputPath)) return inputPath;
    return join(cwd, inputPath);
}

export function ensureConfigDir(): void {
    mkdirSync(getDataDir(), { recursive: true });
    mkdirSync(getModelsDir(), { recursive: true });
}
