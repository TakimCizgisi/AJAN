/**
 * Daemon çekirdeği: tek `AjanService`, seri işlem kuyruğu, olay yayını.
 *
 * Model belleği ve bağlam tek örnek üzerinden paylaşılır; bu yüzden modele
 * dokunan istekler (chat, install, use-model, set-config) sıraya girer.
 * Durum okuyan istekler (status, list) kuyruğu atlar.
 */
import { AjanService, type ServiceEvents } from "../service.js";
import type { ChatHistoryItem } from "node-llama-cpp";
import type { EventFrame, HistoryMessage, StatusReport } from "../protocol/messages.js";
import { PROTOCOL_VERSION } from "../protocol/messages.js";
import { buildGpuReport } from "./gpu.js";
import { AJAN_VERSION } from "../version.js";

type Listener = (event: EventFrame) => void;

/** Modele dokunan işlemler bu listede sırayla çalışır. */
type ExclusiveTask = () => Promise<void>;

export class Runner {
    private readonly service: AjanService;
    private readonly listeners = new Set<Listener>();
    private queue: Promise<void> = Promise.resolve();
    private busy = false;

    /** Sohbet dışı olayların varsayılan yayıncısı (model yükleme, durum) */
    private readonly baseEvents: ServiceEvents;

    /** Ajanın çalışma dizini (durum raporunda döner). */
    readonly cwd: string;

    constructor(cwd: string) {
        this.cwd = cwd;
        const events: ServiceEvents = {
            onTextChunk: (text) => this.emit({ event: "text-chunk", text }),
            onThinkingChunk: (text) => this.emit({ event: "thinking-chunk", text }),
            onToolCall: (name, args) => this.emit({ event: "tool-call", name, args: (args ?? {}) as Record<string, unknown> }),
            onToolResult: (name, ok, output) => this.emit({ event: "tool-result", name, ok, output }),
            onStepStart: (step, maxSteps) => this.emit({ event: "step-start", step, maxSteps }),
            onStepEnd: (step) => this.emit({ event: "step-end", step }),
            // `updateEvents` birleştirdiği için sohbet bitince bu geri yüklenmezse
            // `onError` bir sonraki hatada kapalı socket'e gider. Şimdiden tanımlı olmalı.
            onError: (err) => this.emit({ event: "error", message: err.message }),
            onModelLoadProgress: (pct) => this.emit({ event: "load-progress", pct }),
            onModelLoadComplete: () => this.emit({ event: "load-complete" })
        };
        this.baseEvents = events;
        this.service = new AjanService(events, cwd);
    }

    get instance(): AjanService {
        return this.service;
    }

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    get clientCount(): number {
        return this.listeners.size;
    }

    get isBusy(): boolean {
        return this.busy;
    }

    private emit(event: EventFrame): void {
        for (const listener of this.listeners) {
            try {
                listener(event);
            } catch {
                /* dinleyici hatası istemciyi düşürmemeli */
            }
        }
    }

    /** Modele dokunan işlemleri sıraya alır; işlem bitene kadar bekler. */
    private exclusive<T>(task: () => Promise<T>): Promise<T> {
        const run = this.queue.then(async () => {
            this.busy = true;
            try {
                return await task();
            } finally {
                this.busy = false;
            }
        });
        // Kuyruğun kendisi asla reddedilmesin; bir işlem hata verirse sonrakiler yine aksın.
        this.queue = run.then(
            () => undefined,
            () => undefined
        );
        return run;
    }

    // ── İşlemler ──

    /**
     * Sohbet gönderir. Çıktı akışı yalnızca `target` alıcısına gider: motor
     * paylaşılan, yanıt akışı değil. `target` verilmezse tüm bağlı istemcilere
     * yayın yapılır (tek istemcili kullanımda aynı davranış).
     */
    async sendMessage(
        text: string,
        modelId?: string,
        target?: Listener
    ): Promise<{ ok: boolean; response?: string; steps?: number; error?: string }> {
        return this.exclusive(async () => {
            // Model yükleme ilerlemesi herkese açık: yükleme motor genelinde
            // tek seferlik bir olaydır, sohbetten bağımsız.
            const chatEvents: ServiceEvents = {
                onTextChunk: (t) => this.to(target, { event: "text-chunk", text: t }),
                onThinkingChunk: (t) => this.to(target, { event: "thinking-chunk", text: t }),
                onToolCall: (name, args) =>
                    this.to(target, { event: "tool-call", name, args: (args ?? {}) as Record<string, unknown> }),
                onToolResult: (name, ok, output) => this.to(target, { event: "tool-result", name, ok, output }),
                onStepStart: (step, maxSteps) => this.to(target, { event: "step-start", step, maxSteps }),
                onStepEnd: (step) => this.to(target, { event: "step-end", step }),
                onError: (err) => this.to(target, { event: "error", message: err.message }),
                onModelLoadProgress: (pct) => this.emit({ event: "load-progress", pct }),
                onModelLoadComplete: () => this.emit({ event: "load-complete" })
            };
            this.service.updateEvents(chatEvents);
            try {
                const result = await this.service.sendMessage(text, modelId);
                if (!result.ok) this.to(target, { event: "error", message: result.error ?? "bilinmeyen hata" });
                else this.to(target, { event: "complete", response: result.response ?? "", steps: result.steps ?? 0 });
                return result;
            } finally {
                // Yayını eski hedefe döndür: istek bittiğinde olaylar kalıcı olarak
                // tek istemciye bağlı kalmasın.
                this.service.updateEvents(this.baseEvents);
            }
        });
    }

    private to(target: Listener | undefined, event: EventFrame): void {
        if (target) target(event);
        else this.emit(event);
    }

    setConfig(patch: Record<string, unknown>): Promise<void> {
        return this.exclusive(() => this.service.setConfig(patch));
    }

    useModel(id: string): Promise<{ ok: boolean; error?: string }> {
        return this.exclusive(() => this.service.useModel(id));
    }

    installModel(id: string): Promise<{ ok: boolean; error?: string }> {
        return this.exclusive(() => this.service.installModel(id));
    }

    removeModel(id: string): Promise<{ ok: boolean; error?: string }> {
        return this.exclusive(() => this.service.removeModel(id));
    }

    refreshModels(): Promise<{ ok: boolean; count?: number; error?: string }> {
        return this.exclusive(() => this.service.refreshModels());
    }

    reset(): Promise<void> {
        return this.exclusive(() => this.service.reset());
    }

    abort(): void {
        this.service.abort();
    }

    listModels() {
        return this.service.listModels();
    }

    listSessions() {
        return this.service.listSessions();
    }

    loadSession(id: string) {
        return this.service.loadSession(id);
    }

    saveSession(session: Parameters<AjanService["saveSession"]>[0]) {
        return this.service.saveSession(session);
    }

    deleteSession(id: string) {
        return this.service.deleteSession(id);
    }

    getHistory(): HistoryMessage[] {
        return toHistoryMessages(this.service.getChatHistory());
    }

    setHistory(history: ChatHistoryItem[]): void {
        this.service.setChatHistory(history);
    }

    async status(): Promise<StatusReport> {
        const model = this.service.getModelInfo();
        const config = this.service.getConfig();
        return {
            protocol: PROTOCOL_VERSION,
            version: AJAN_VERSION,
            modelId: config.modelId,
            modelName: model?.name ?? config.modelId,
            installed: model?.installed ?? false,
            loading: false,
            busy: this.busy,
            cwd: this.cwd,
            gpu: await buildGpuReport(this.service),
            context: this.service.getContextStats(),
            reasoning: this.service.getReasoningInfo(),
            config,
            clients: this.clientCount,
            uptimeSec: Math.round(process.uptime())
        };
    }

    async dispose(): Promise<void> {
        await this.service.dispose();
    }
}

/**
 * node-llama-cpp geçmişini istemciye gönderilebilir sade biçime çevirir.
 * Düşünme segmentleri ayrı `thought` mesajı olarak ayrılır; araç çağrıları
 * `tool` türüne düşer.
 */
export function toHistoryMessages(history: ChatHistoryItem[]): HistoryMessage[] {
    const out: HistoryMessage[] = [];
    for (const item of history) {
        if (item.type === "user") {
            out.push({ kind: "user", text: textOf(item.text) });
            continue;
        }
        if (item.type !== "model") continue;
        let text = "";
        let thought = "";
        for (const part of item.response) {
            if (typeof part === "string") {
                text += part;
                continue;
            }
            if (part.type === "segment") {
                if (part.segmentType === "thought") thought += part.text;
                else text += part.text;
                continue;
            }
            if (part.type === "functionCall") {
                out.push({ kind: "tool", text: part.name, name: part.name });
            }
        }
        if (thought) out.push({ kind: "thought", text: thought });
        if (text) out.push({ kind: "assistant", text });
    }
    return out;
}

function textOf(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value);
}
