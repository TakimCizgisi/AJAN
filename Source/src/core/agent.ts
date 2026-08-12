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
import type { LlamaChatSession } from "node-llama-cpp";
import { LlamaEngine } from "../engine/llama.js";
import { buildSessionFunctions, createCoreTools, type ToolEvents } from "../tools/registry.js";
import type { AgentTool, AjanConfig, ModelDefinition, ToolExecutionContext } from "../config/types.js";
import { getModelById, loadConfig, resolveModelFilePath } from "../config/configManager.js";
import { logger } from "../utils/paths.js";

export type AgentEvents = {
    /** Model token token üretirken (akış) */
    onTextChunk?: (text: string) => void;
    /** Model düşünce/akıl yürütme segmentleri üretirken (akış) */
    onThinkingChunk?: (text: string) => void;
    /** Bir araç çağrılmadan önce */
    onToolCall?: (name: string, params: unknown) => void;
    /** Bir araç sonucu döndüğünde */
    onToolResult?: (name: string, ok: boolean, output: string) => void;
    /** Nihai yanıt tamamlandığında */
    onComplete?: (response: string) => void;
    /** Hata oluştuğunda */
    onError?: (error: Error) => void;
};

export type AgentOptions = {
    model?: ModelDefinition;
    config?: AjanConfig;
    modelPath?: string;
    systemPrompt?: string;
    tools?: AgentTool[];
    events?: AgentEvents;
    onLoadProgress?: (pct: number) => void;
    onLoadComplete?: () => void;
    signal?: AbortSignal;
    temperature?: number; // <-- Yeni eklenen özellik
};

export class AjanAgent {
    private engine: LlamaEngine | undefined;
    private session: LlamaChatSession | undefined;
    private readonly model: ModelDefinition;
    private readonly config: AjanConfig;
    private readonly modelPath: string;
    private systemPrompt: string;
    private readonly tools: AgentTool[];
    private readonly events: AgentEvents;
    private readonly onLoadProgress?: (pct: number) => void;
    private readonly onLoadComplete?: () => void;
    private readonly signal?: AbortSignal;
    private readonly temperature?: number;

    constructor(options: AgentOptions) {
        const config = options.config ?? loadConfig();
        this.config = config;
        this.events = options.events ?? {};
        this.onLoadProgress = options.onLoadProgress;
        this.onLoadComplete = options.onLoadComplete;
        this.signal = options.signal;
        this.temperature = options.temperature;

        if (options.model) {
            this.model = options.model;
        } else {
            const id = config.modelId;
            const found = getModelById(id);
            if (!found) {
                throw new Error(`Model bulunamadı: ${id}. 'ajan model list' ile uygun modelleri görün.`);
            }
            this.model = found;
        }

        this.modelPath = options.modelPath ?? resolveModelFilePath(this.model);
        this.systemPrompt = options.systemPrompt ?? config.systemPrompt ?? "";
        this.tools = options.tools ?? createCoreTools({ cwd: config.cwd ?? process.cwd(), config });
    }

    get engineInfo(): { modelPath: string; modelId: string } {
        return { modelPath: this.modelPath, modelId: this.model.id };
    }

    private async ensureSession(signal?: AbortSignal): Promise<LlamaChatSession> {
        if (this.session) return this.session;
        this.engine = new LlamaEngine({
            modelPath: this.modelPath,
            config: this.config,
            chatWrapperName: this.model.chatWrapper,
            onProgress: (pct) => this.onLoadProgress?.(pct),
            signal: signal ?? this.signal
        });
        await this.engine.createContext();
        this.onLoadComplete?.();
        this.session = this.engine.createSession(this.systemPrompt);
        return this.session;
    }

    async prompt(userPrompt: string, options?: { signal?: AbortSignal }): Promise<string> {
        const session = await this.ensureSession(options?.signal ?? this.signal);
        const toolEvents: ToolEvents = {
            onToolCall: (name, params) => this.events.onToolCall?.(name, params),
            onToolResult: (name, ok, output) => this.events.onToolResult?.(name, ok, output)
        };
        const ctx: ToolExecutionContext = {
            cwd: this.config.cwd ?? process.cwd(),
            config: this.config
        };
        const functions = buildSessionFunctions(this.tools, ctx, toolEvents);
        const sessionOpts = this.config.session ?? {};

        logger.debug(`Prompt gonderiliyor (${userPrompt.length} karakter)`);
        const response = await session.prompt(userPrompt, {
            functions,
            documentFunctionParams: true,
            temperature: this.temperature ?? sessionOpts.temperature,
            topP: sessionOpts.topP,
            topK: sessionOpts.topK,
            maxTokens: sessionOpts.maxTokens,
            seed: sessionOpts.seed,
            onTextChunk: (text) => this.events.onTextChunk?.(text),
            onResponseChunk: (chunk) => {
                if (chunk.type === "segment" && chunk.segmentType === "thought") {
                    this.events.onThinkingChunk?.(chunk.text);
                }
            },
            signal: options?.signal ?? this.signal
        });

        this.events.onComplete?.(response);
        return response;
    }

    /** Oturumdaki geçmişi temizler (yeni konuşma) */
    resetConversation(): void {
        this.session?.resetChatHistory();
    }

    /** Sistem promptunu değiştirir; aktif oturum varsa geçmiş temizlenip yeni sistem promptuyla yeniden kurulur */
    async setSystemPrompt(prompt: string): Promise<void> {
        this.systemPrompt = prompt;
        if (this.engine && this.session) {
            this.session = await this.engine.resetSession(prompt);
        }
    }

    async dispose(): Promise<void> {
        await this.engine?.dispose();
        this.engine = undefined;
        this.session = undefined;
    }
}
