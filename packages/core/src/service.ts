import type { ChatHistoryItem } from "node-llama-cpp";
import { AjanAgent, type AgentEvents } from "./core/agent.js";
import {
    loadConfig, saveConfig, getModelById, isModelInstalled,
    listInstalledModels as listInstalledFromDisk, removeModelFile,
    resolveModelFilePath, refreshRemoteModels, getModelsRegistry
} from "./config/configManager.js";
import {
    saveSession as saveSessionFile, loadSession as loadSessionFile,
    listSessions as listSessionsFromDisk, generateSessionId
} from "./utils/sessions.js";
import type { StoredSession, StoredMessage } from "./utils/sessions.js";
import type { AjanConfig, ModelDefinition } from "./config/types.js";

export type ServiceEvents = AgentEvents & {
    onModelLoadProgress?: (pct: number) => void;
    onModelLoadComplete?: () => void;
};

export type ModelWithStatus = {
    model: ModelDefinition;
    path: string;
    installed: boolean;
    active: boolean;
};

export class AjanService {
    private agent: AjanAgent | null = null;
    private config: AjanConfig;
    private events: ServiceEvents;
    private _active = false;
    private _currentAbort: AbortController | null = null;

    constructor(events: ServiceEvents = {}) {
        this.config = loadConfig();
        this.events = events;
    }

    // ── Agent Lifecycle ──

    private ensureAgent(): void {
        if (this.agent) return;
        this.agent = new AjanAgent({
            config: this.config,
            events: {
                onTextChunk: this.events.onTextChunk,
                onThinkingChunk: this.events.onThinkingChunk,
                onToolCall: this.events.onToolCall,
                onToolResult: this.events.onToolResult,
                onComplete: this.events.onComplete,
                onStepStart: this.events.onStepStart,
                onStepEnd: this.events.onStepEnd,
                onContextTrimmed: this.events.onContextTrimmed,
                onError: this.events.onError
            },
            onLoadProgress: this.events.onModelLoadProgress,
            onLoadComplete: this.events.onModelLoadComplete
        });
    }

    /** Event'leri güncelle (Electron IPC yeniden bağlanırken kullanılır) */
    updateEvents(events: ServiceEvents): void {
        this.events = events;
        // Agent zaten varsa, yeni event'leri uygulamak için dispose + recreate gerekir
        // Ancak çoğu durumda event'ler proxy üzerinden bağlanır, bu yüzden sadece saklıyoruz
    }

    // ── Prompt ──

    async sendMessage(message: string, modelId?: string): Promise<{
        ok: boolean; response?: string; steps?: number;
        completed?: boolean; error?: string;
    }> {
        if (this._active) return { ok: false, error: "Meşgul" };

        // Model değişikliği varsa
        if (modelId && modelId !== this.config.modelId) {
            this.config.modelId = modelId;
            saveConfig(this.config);
            await this.recreateAgent();
        }

        this.ensureAgent();
        if (!this.agent) return { ok: false, error: "Agent başlatılamadı" };

        this._active = true;
        const controller = new AbortController();
        this._currentAbort = controller;

        try {
            const result = await this.agent.promptTask(message, { signal: controller.signal });
            return {
                ok: true,
                response: result.response,
                steps: result.steps,
                completed: result.completed
            };
        } catch (err) {
            if (controller.signal.aborted) return { ok: false, error: "İptal edildi" };
            return { ok: false, error: (err as Error).message };
        } finally {
            if (this._currentAbort === controller) this._currentAbort = null;
            this._active = false;
        }
    }

    abort(): void {
        this._currentAbort?.abort();
    }

    async reset(): Promise<void> {
        this.agent?.resetConversation();
    }

    // ── History ──

    getChatHistory(): ChatHistoryItem[] {
        return this.agent?.getChatHistory() ?? [];
    }

    setChatHistory(history: ChatHistoryItem[]): void {
        this.agent?.setChatHistory(history);
    }

    getContextStats(): { usedTokens: number; contextSize: number } | null {
        return this.agent?.getContextStats() ?? null;
    }

    // ── Config ──

    getConfig(): AjanConfig {
        return { ...this.config };
    }

    async setConfig(patch: Record<string, unknown>): Promise<void> {
        const merged = { ...this.config, ...patch } as AjanConfig;
        if (patch.session && typeof patch.session === "object") {
            merged.session = { ...this.config.session, ...(patch.session as Record<string, unknown>) } as AjanConfig["session"];
        }
        saveConfig(merged);
        this.config = merged;
        await this.recreateAgent();
    }

    // ── Projects ──

    listProjects(): { path: string; active: boolean }[] {
        const projects = this.config.projects ?? [];
        return projects.map(path => ({ path, active: path === this.config.activeProject }));
    }

    async addProject(path: string): Promise<{ ok: boolean; error?: string }> {
        const projects = this.config.projects ?? [];
        if (projects.includes(path)) return { ok: true };
        this.config.projects = [...projects, path];
        saveConfig(this.config);
        return { ok: true };
    }

    async removeProject(path: string): Promise<{ ok: boolean; error?: string }> {
        const projects = this.config.projects ?? [];
        this.config.projects = projects.filter(p => p !== path);
        if (this.config.activeProject === path) this.config.activeProject = undefined;
        saveConfig(this.config);
        return { ok: true };
    }

    async setActiveProject(path: string | null): Promise<{ ok: boolean; error?: string }> {
        if (path === null) {
            this.config.activeProject = undefined;
            saveConfig(this.config);
            return { ok: true };
        }
        const projects = this.config.projects ?? [];
        if (!projects.includes(path)) return { ok: false, error: `Proje kayıtlı değil: ${path}` };
        this.config.activeProject = path;
        saveConfig(this.config);
        return { ok: true };
    }

    // ── Models ──

    getModelInfo(): { modelId: string; name: string; installed: boolean } | null {
        const model = getModelById(this.config.modelId);
        if (!model) return null;
        return {
            modelId: model.id,
            name: model.name,
            installed: isModelInstalled(model)
        };
    }

    listModels(): ModelWithStatus[] {
        const installed = listInstalledFromDisk();
        return installed.map(item => ({
            model: item.model,
            path: item.path,
            installed: item.installed,
            active: item.model.id === this.config.modelId
        }));
    }

    async installModel(modelId: string): Promise<{ ok: boolean; error?: string }> {
        const model = getModelById(modelId);
        if (!model) return { ok: false, error: `Model bulunamadı: ${modelId}` };
        try {
            const { downloadModel } = await import("./engine/modelManager.js");
            await downloadModel(model, {
                onProgress: (progress) => {
                    const pct = progress.totalSize > 0
                        ? Math.round((progress.downloadedSize / progress.totalSize) * 100)
                        : progress.percent ?? 0;
                    this.events.onModelLoadProgress?.(pct);
                }
            });
            return { ok: true };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    }

    async removeModel(modelId: string): Promise<{ ok: boolean; error?: string }> {
        const model = getModelById(modelId);
        if (!model) return { ok: false, error: `Model bulunamadı: ${modelId}` };
        const removed = removeModelFile(model);
        if (!removed) return { ok: false, error: "Model dosyası bulunamadı" };

        // Aktif model silindiyse config'i temizle/kurulu bir modele geç
        if (this.config.modelId === modelId) {
            const installed = listInstalledFromDisk().find(m => m.installed);
            if (installed) {
                this.config.modelId = installed.model.id;
            } else {
                this.config.modelId = "";
            }
            saveConfig(this.config);
            await this.recreateAgent();
        }
        return { ok: true };
    }

    async useModel(modelId: string): Promise<{ ok: boolean; error?: string }> {
        const model = getModelById(modelId);
        if (!model) return { ok: false, error: `Model bulunamadı: ${modelId}` };
        if (!isModelInstalled(model)) return { ok: false, error: `Model kurulu değil: ${modelId}` };
        this.config.modelId = modelId;
        saveConfig(this.config);
        await this.recreateAgent();
        return { ok: true };
    }

    async refreshModels(): Promise<{ ok: boolean; count?: number; error?: string }> {
        try {
            const models = await refreshRemoteModels();
            return { ok: true, count: models.length };
        } catch (err) {
            return { ok: false, error: (err as Error).message };
        }
    }

    getModelsRegistry() {
        return getModelsRegistry();
    }

    // ── Sessions ──

    async saveSession(session: StoredSession): Promise<void> {
        await saveSessionFile(session);
    }

    async loadSession(id: string): Promise<StoredSession | null> {
        const data = await loadSessionFile(id);
        if (data && this.agent) {
            this.agent.setChatHistory(data.history);
        }
        return data;
    }

    async listSessions(): Promise<StoredSession[]> {
        return await listSessionsFromDisk();
    }

    generateSessionId(): string {
        return generateSessionId();
    }

    // ── GPU ──

    async detectGpu(): Promise<string[]> {
        try {
            const { LlamaEngine } = await import("./engine/llama.js");
            return await LlamaEngine.detectSupportedGpus();
        } catch {
            return [];
        }
    }

    // ── Status ──

    get isActive(): boolean {
        return this._active;
    }

    // ── Internal ──

    private async recreateAgent(): Promise<void> {
        await this.agent?.dispose();
        this.agent = null;
        this.ensureAgent();
    }

    async dispose(): Promise<void> {
        this._currentAbort?.abort();
        await this.agent?.dispose();
        this.agent = null;
    }
}
