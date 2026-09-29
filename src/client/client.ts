/**
 * Motor istemcisi: `AjanEngine` bağlantısını kurar, istek gönderir, olayları
 * abone olunan geri çağrılara dağıtır.
 *
 * Kullanım:
 * ```ts
 * const engine = await AjanEngine.connect();
 * await engine.ask("merhaba", { onText: (t) => process.stdout.write(t) });
 * ```
 */
import { connect } from "node:net";
import { ClientChannel, defaultSocketPath } from "../protocol/channel.js";
import type { StoredSession } from "../utils/sessions.js";
import {
    PROTOCOL_VERSION,
    type EventFrame,
    type GpuReport,
    type HistoryMessage,
    type ModelEntry,
    type RequestFrame,
    type SessionSummary,
    type StatusReport
} from "../protocol/messages.js";

export type EngineEventListener = (event: EventFrame) => void;

export type AskOptions = {
    /** Hangi modelle çalışsın; verilmezse motorun varsayılanı */
    modelId?: string;
    /** Token akışı (parça parça) */
    onText?: (text: string) => void;
    /** Düşünme/akıl yürütme akışı */
    onThinking?: (text: string) => void;
    /** Araç çağrısı */
    onToolCall?: (name: string, args: unknown) => void;
    /** Araç sonucu */
    onToolResult?: (name: string, ok: boolean, output: string) => void;
    /** Model yükleniyor */
    onLoadProgress?: (pct: number) => void;
    /** Adım ilerlemesi */
    onStep?: (step: number, maxSteps: number) => void;
};

export class EngineError extends Error {}

/** Hata sarmalayıcı: istek başarısızsa tip daraltması yerine istisna fırlatır. */
async function unwrap<T>(p: Promise<{ ok: true; result: T } | { ok: false; error: string }>): Promise<T> {
    const r = await p;
    if (!r.ok) throw new EngineError(r.error);
    return r.result;
}

export class AjanEngine {
    private constructor(
        private readonly channel: ClientChannel,
        private readonly socketPath: string
    ) {}

    static async connect(socketPath = defaultSocketPath()): Promise<AjanEngine> {
        const socket = await new Promise<import("node:net").Socket>((resolve, reject) => {
            const s = connect(socketPath);
            s.once("connect", () => resolve(s));
            s.once("error", (err) => {
                const e = err as NodeJS.ErrnoException;
                reject(
                    e.code === "ENOENT"
                        ? new EngineError(`AJAN motoru çalışmıyor (socket yok: ${socketPath}). 'ajan start' ile başlat.`)
                        : e.code === "ECONNREFUSED"
                          ? new EngineError(`AJAN motoru yanıt vermiyor (${socketPath}). 'ajan start' ile yeniden başlat.`)
                          : err
                );
            });
        });
        // Dinleyiciler bağlandıktan sonra takılmalı ki ilk olay kaçmasın.
        let engine!: AjanEngine;
        const channel = new ClientChannel(
            (event) => engine.dispatch(event),
            (reason) => engine.notifyClose(reason)
        );
        engine = new AjanEngine(channel, socketPath);
        channel.attach(socket);
        await engine.ping();
        return engine;
    }

    get path(): string {
        return this.socketPath;
    }

    // ── Olay dağıtımı ──

    private listeners = new Set<EngineEventListener>();
    private closeListeners = new Set<(reason?: Error) => void>();

    on(listener: EngineEventListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    onClose(listener: (reason?: Error) => void): () => void {
        this.closeListeners.add(listener);
        return () => this.closeListeners.delete(listener);
    }

    private dispatch(event: EventFrame): void {
        for (const l of this.listeners) {
            try {
                l(event);
            } catch {
                /* abone hatası istemciyi düşürmemeli */
            }
        }
    }

    private notifyClose(reason?: Error): void {
        for (const l of this.closeListeners) {
            try {
                l(reason);
            } catch {
                /* yoksay */
            }
        }
    }

    /** Mesaj gönderir ve akışı geri çağrılara bağlar, tam yanıtı döner. */
    async ask(text: string, options: AskOptions = {}): Promise<string> {
        let answer = "";
        let failure: string | undefined;
        let stop = (): void => {};
        // `complete` hiç gelmezse asılı kalmamak için hata yollarında da çözülür.
        let settle: () => void = () => {};
        const done = new Promise<void>((resolve) => {
            settle = resolve;
            stop = this.on((event) => {
                switch (event.event) {
                    case "text-chunk":
                        answer += event.text;
                        options.onText?.(event.text);
                        break;
                    case "thinking-chunk":
                        options.onThinking?.(event.text);
                        break;
                    case "tool-call":
                        options.onToolCall?.(event.name, event.args);
                        break;
                    case "tool-result":
                        options.onToolResult?.(event.name, event.ok, event.output);
                        break;
                    case "load-progress":
                        options.onLoadProgress?.(event.pct);
                        break;
                    case "step-start":
                        options.onStep?.(event.step, event.maxSteps);
                        break;
                    case "error":
                        failure = event.message;
                        break;
                    case "complete":
                        if (!answer) answer = event.response;
                        stop();
                        resolve();
                        break;
                }
            });
        });

        try {
            await unwrap(
                this.channel.request({
                    type: "chat",
                    text,
                    ...(options.modelId ? { modelId: options.modelId } : {})
                } as RequestFrame["req"])
            );
        } catch (err) {
            stop();
            settle();
            throw err;
        }
        await done;
        if (failure) throw new EngineError(failure);
        return answer;
    }

    /** Bir isteği gönderip ham sonucu döner (tip belirtilmiş yardımcılar). */
    private send(req: RequestFrame["req"]): Promise<unknown> {
        return unwrap(this.channel.request(req));
    }

    async ping(): Promise<{ protocol: number; version: string }> {
        const r = (await this.send({ type: "ping" })) as { type: "pong"; protocol: number; version: string };
        return { protocol: r.protocol, version: r.version };
    }

    async status(): Promise<StatusReport> {
        const r = (await this.send({ type: "status" })) as { type: "status"; status: StatusReport };
        return r.status;
    }

    async getGpu(): Promise<GpuReport> {
        return (await this.status()).gpu;
    }

    async listModels(): Promise<ModelEntry[]> {
        const r = (await this.send({ type: "list-models" })) as { type: "models"; models: ModelEntry[]; error?: string };
        if (r.error) throw new EngineError(r.error);
        return r.models;
    }

    async installModel(id: string): Promise<{ ok: boolean; error?: string }> {
        const r = (await this.send({ type: "install-model", id })) as { type: "model"; ok: boolean; error?: string };
        return { ok: r.ok, error: r.error };
    }

    async removeModel(id: string): Promise<{ ok: boolean; error?: string }> {
        const r = (await this.send({ type: "remove-model", id })) as { type: "model"; ok: boolean; error?: string };
        return { ok: r.ok, error: r.error };
    }

    async useModel(id: string): Promise<{ ok: boolean; error?: string }> {
        const r = (await this.send({ type: "use-model", id })) as { type: "model"; ok: boolean; error?: string };
        return { ok: r.ok, error: r.error };
    }

    async refreshModels(): Promise<{ ok: boolean; count: number; error?: string }> {
        const r = (await this.send({ type: "refresh-models" })) as { type: "models-refreshed"; ok: boolean; count: number; error?: string };
        return { ok: r.ok, count: r.count, error: r.error };
    }

    /** Güncel config; `status` zarfı zaten taşıyor, ayrı istek gerekmez. */
    async getConfig(): Promise<Record<string, unknown>> {
        return (await this.status()).config as unknown as Record<string, unknown>;
    }

    async setConfig(patch: Record<string, unknown>): Promise<void> {
        await this.send({ type: "set-config", patch });
    }

    async newChat(): Promise<void> {
        await this.send({ type: "new-chat" });
    }

    async abort(): Promise<void> {
        await this.send({ type: "abort" });
    }

    async getHistory(): Promise<HistoryMessage[]> {
        const r = (await this.send({ type: "get-history" })) as { type: "history"; messages: HistoryMessage[] };
        return r.messages;
    }

    async listSessions(): Promise<SessionSummary[]> {
        const r = (await this.send({ type: "list-sessions" })) as { type: "sessions"; sessions: SessionSummary[] };
        return r.sessions;
    }

    async loadSession(id: string): Promise<StoredSession | null> {
        const r = (await this.send({ type: "load-session", id })) as { type: "session"; session: StoredSession | null; ok: boolean; error?: string };
        if (r.error) throw new EngineError(r.error);
        return r.session;
    }

    async saveSession(session: StoredSession): Promise<void> {
        await this.send({ type: "save-session", session });
    }

    async deleteSession(id: string): Promise<void> {
        await this.send({ type: "delete-session", id });
    }

    async shutdown(): Promise<void> {
        await this.send({ type: "shutdown" });
    }

    /** Sürüm/protokol uyumluluğunu doğrular. */
    static assertCompatible(ping: { protocol: number }): void {
        if (ping.protocol !== PROTOCOL_VERSION) {
            throw new EngineError(
                `Protokol uyuşmazlığı: istemci v${PROTOCOL_VERSION}, motor v${ping.protocol}. ` +
                    "`ajan stop && ajan start` ile motoru yenile."
            );
        }
    }

    /** Bağlantıyı kapatır; bekleyen istekler hata ile reddedilir. */
    close(): void {
        this.channel.close();
    }
}
