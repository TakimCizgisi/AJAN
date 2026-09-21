import { AjanBackend } from "./ajanService.js";
import type { AjanService } from "@takimcizgisi/core";

type StoredMessage = {
    kind: "user" | "assistant" | "thought" | "info" | "tool";
    text?: string;
    name?: string;
    state?: "running" | "done" | "error";
    startedAt?: number;
    elapsed?: number;
    output?: string;
};

type StoredSession = {
    id: string;
    title: string;
    mode: string;
    createdAt: string;
    updatedAt: string;
    history: unknown[];
    messages: StoredMessage[];
    todos?: { text: string; done: boolean }[];
};

export type WebviewPoster = (message: unknown) => unknown;

export type IncomingMessage =
    | { type: "send"; text: string; modelId?: string }
    | { type: "abort" }
    | { type: "new-chat" }
    | { type: "get-state" }
    | { type: "set-config"; patch: Record<string, unknown> }
    | { type: "model-install"; id: string }
    | { type: "model-remove"; id: string }
    | { type: "model-use"; id: string }
    | { type: "model-refresh" }
    | { type: "session-list" }
    | { type: "session-load"; id: string }
    | { type: "session-save"; session: StoredSession }
    | { type: "session-delete"; id: string }
    | { type: "get-status" };

/**
 * Webview'den gelen AJAN API isteklerini AjanService'e bağlar.
 * AJAN olayları (ServiceEvents) webview'e postMessage ile aktarılır.
 */
export class AjanBackendBridge {
    private readonly backend: AjanBackend;
    private readonly poster: WebviewPoster;
    private loading = false;

    constructor(backend: AjanBackend, poster: WebviewPoster) {
        this.backend = backend;
        this.poster = poster;
    }

    private send(message: unknown): void {
        void Promise.resolve(this.poster(message));
    }

    async handle(msg: IncomingMessage): Promise<void> {
        switch (msg.type) {
            case "send": {
                const result = await this.backend.sendMessage(msg.text, msg.modelId);
                this.send({ type: "found", ok: result.ok, error: result.error });
                break;
            }
            case "abort":
                this.backend.abort();
                this.send({ type: "busy", active: false });
                break;
            case "new-chat":
                await this.backend.newSession();
                this.send({ type: "new-chat-ok" });
                break;
            case "get-state":
                await this.sendState();
                break;
            case "get-status":
                this.send({
                    type: "status",
                    ...this.statusPayload()
                });
                break;
            case "set-config":
                await this.backend.setConfig(msg.patch);
                await this.sendState();
                break;
            case "model-install": {
                this.loading = true;
                this.send({ type: "busy", active: true, loading: true });
                let result: { ok: boolean; error?: string };
                try {
                    result = await this.backend.installModel(msg.id);
                } catch (err) {
                    result = { ok: false, error: String((err as Error)?.message ?? err) };
                } finally {
                    this.loading = false;
                    this.send({ type: "busy", active: false, loading: false });
                }
                this.send({ type: "model-result", id: msg.id, action: "install", ok: result.ok, error: result.error });
                await this.sendState();
                break;
            }
            case "model-remove": {
                const result = await this.backend.removeModel(msg.id);
                this.send({ type: "model-result", id: msg.id, action: "remove", ok: result.ok, error: result.error });
                await this.sendState();
                break;
            }
            case "model-use": {
                const result = await this.backend.useModel(msg.id);
                this.send({ type: "model-result", id: msg.id, action: "use", ok: result.ok, error: result.error });
                await this.sendState();
                break;
            }
            case "model-refresh": {
                const result = await this.backend.refreshModels();
                this.send({ type: "model-refresh-result", ok: result.ok, count: result.count, error: result.error });
                await this.sendState();
                break;
            }
            case "session-list": {
                const sessions = await this.backend.listSessions();
                this.send({ type: "sessions", sessions: sessions.map(s => ({ id: s.id, title: s.title, updatedAt: s.updatedAt })) });
                break;
            }
            case "session-load": {
                const data = await this.backend.loadSession(msg.id);
                this.send({ type: "session-loaded", ok: !!data, data });
                break;
            }
            case "session-save": {
                try {
                    await this.backend.service.saveSession(msg.session as Parameters<AjanService["saveSession"]>[0]);
                    this.send({ type: "session-saved", ok: true });
                } catch {
                    this.send({ type: "session-saved", ok: false });
                }
                break;
            }
            default:
                this.send({ type: "error", message: `Bilinmeyen mesaj: ${(msg as { type?: string }).type}` });
        }
    }

    private async sendState(): Promise<void> {
        const config = this.backend.getConfig();
        const models = this.backend.listModels();
        const modelInfo = this.backend.getModelInfo();
        const sessions = await this.backend.listSessions();
        const projects = await this.backend.listProjects();
        const gpu = await this.getGpu();
        this.send({
            type: "state",
            payload: {
                config,
                models,
                modelInfo,
                sessions: sessions.map(s => ({ id: s.id, title: s.title, updatedAt: s.updatedAt })),
                projects,
                gpu,
                cwd: process.cwd(),
                status: this.statusPayload()
            }
        });
    }

    private gpuCache?: { at: number; value: string[] };

    private async getGpu(): Promise<string[]> {
        const now = Date.now();
        if (this.gpuCache) {
            if (now - this.gpuCache.at < 60_000) return this.gpuCache.value;
        }
        const value = await this.backend.detectGpu().catch(() => []);
        this.gpuCache = { at: now, value };
        return value;
    }

    private statusPayload(): Record<string, unknown> {
        return {
            active: this.backend.isActive,
            loading: this.loading,
            context: this.backend.getContextStats(),
            cwd: process.cwd()
        };
    }

    async dispose(): Promise<void> {
        await this.backend.dispose();
    }
}