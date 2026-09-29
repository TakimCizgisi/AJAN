import type { LlamaChatSession, ChatHistoryItem } from "node-llama-cpp";
import { existsSync } from "node:fs";
import { LlamaEngine, type ActiveGpu } from "../engine/llama.js";
import { buildSessionFunctions, createCoreTools, type ToolEvents } from "../tools/registry.js";
import type {
    AgentTool,
    AjanConfig,
    ModelDefinition,
    ReasoningMode,
    ToolExecutionContext,
    ToolExecutionSignal
} from "../config/types.js";
import { getModelById, loadConfig, resolveModelFilePath, buildDefaultSystemPrompt } from "../config/configManager.js";
import { loadProjectContext } from "../utils/projectContext.js";
import { logger } from "../utils/paths.js";

function historyItemText(item: ChatHistoryItem): string {
    if (item.type === "system" || item.type === "user") {
        return typeof item.text === "string" ? item.text : JSON.stringify(item.text);
    }
    return item.response.filter((p): p is string => typeof p === "string").join("\n");
}

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
    /** Otonom bir adım başladığında */
    onStepStart?: (step: number, maxSteps: number) => void;
    /** Otonom adım bittiğinde (o turdaki araç çağrısı sayısıyla) */
    onStepEnd?: (step: number, maxSteps: number, toolCalls: number) => void;
    /** Context sıkıştırıldığında (eski turlar kırpıldı) */
    onContextTrimmed?: (removedItems: number) => void;
    /** Hata oluştuğunda */
    onError?: (error: Error) => void;
};

export type AgentOptions = {
    model?: ModelDefinition;
    config?: AjanConfig;
    modelPath?: string;
    cwd?: string;
    tools?: AgentTool[];
    events?: AgentEvents;
    onLoadProgress?: (pct: number) => void;
    onLoadComplete?: () => void;
    signal?: AbortSignal;
    temperature?: number;
};

export type AjanTaskResult = {
    response: string;
    steps: number;
    maxSteps: number;
    completed: boolean;
    budgetExhausted: boolean;
};

export class AjanAgent {
    private engine: LlamaEngine | undefined;
    private session: LlamaChatSession | undefined;
    private readonly model: ModelDefinition;
    private readonly config: AjanConfig;
    private readonly modelPath: string;
    private readonly cwd: string;
    private systemPrompt: string;
    private readonly tools: AgentTool[];
    private events: AgentEvents;
    private readonly onLoadProgress?: (pct: number) => void;
    private readonly onLoadComplete?: () => void;
    private readonly signal?: AbortSignal;
    private readonly temperature?: number;
    private pendingHistory: ChatHistoryItem[] | undefined;

    /**
     * Yayın hedefini değiştirir.
     *
     * Daemon tek modeli paylaştığı için her sohbet isteğinin çıktısı yalnızca
     * soran istemciye gitmelidir. Ajanı yeniden kurmadan yönlendirme değiştirmek,
     * yüklü modeli bozmadan yayını daraltmanın tek yoludur.
     */
    setEvents(events: AgentEvents): void {
        this.events = events;
    }

    constructor(options: AgentOptions) {
        const config = options.config ?? loadConfig();
        this.config = config;
        this.cwd = options.cwd ?? process.cwd();
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
        // Dosya yoksa node-llama-cpp'in ENOENT'sini yüzeye çıkarmak yerine
        // ne yapılması gerektiğini söyleyen bir hata ver.
        if (!existsSync(this.modelPath)) {
            throw new Error(
                `Model dosyası bulunamadı: ${this.model.name} (${this.model.id}).\n` +
                `Beklenen: ${this.modelPath}\n` +
                `AJAN ile bu modeli indir: ajan models install ${this.model.id}`

            );
        }
        // Sistem promptu her açılışta güncel çalışma diziniyle taze üretilir;
        // config.systemPrompt yok sayılır (bayat cwd içermesin diye).
        // Modelin özel system promptu varsa onu kullan, yoksa varsayılanı üret.
        const modelSystemPrompt = this.model.systemPrompt;
        const modelSecondaryPrompt = this.model.secondarySystemPrompt;
        let basePrompt: string;
        if (modelSystemPrompt) {
            basePrompt =
                modelSystemPrompt +
                `\n- Çalışma dizini: ${this.cwd}. Dosya yollarında göreli yol kullan (örn. src/index.ts).\n` +
                `- Deneme/test alanın: ${this.cwd}/.ajan. Deneme, prototip ve riskli testleri burada yap (open_playground); asıl projeye ancak doğruladıktan sonra uygula.`;
        } else {
            basePrompt = buildDefaultSystemPrompt(this.cwd);
        }
        this.systemPrompt =
            basePrompt +
            (modelSecondaryPrompt ? "\n\n" + modelSecondaryPrompt : "") +
            loadProjectContext(this.cwd);
        this.tools = options.tools ?? createCoreTools({ cwd: this.cwd, config });
    }

    /**
     * Düşünme modunu çözer: kullanıcının model başına geçersiz kılması > katalog.
     * "auto" katalogda tanımlı değilse undefined döner, sarmalayıcının varsayılanı kalır.
     */
    private get reasoningEnabled(): boolean | undefined {
        const override = this.config.modelOverrides?.[this.model.id]?.reasoning;
        if (override === "on") return true;
        if (override === "off") return false;
        return this.model.reasoning;
    }

    /** İstemciye raporlanacak düşünme durumu (auto değeri de çözülmüş haliyle) */
    get reasoningInfo(): { mode: ReasoningMode; enabled: boolean } {
        const mode = this.config.modelOverrides?.[this.model.id]?.reasoning ?? "auto";
        return { mode, enabled: this.reasoningEnabled ?? false };
    }

    /** Motorun gerçekten kullandığı arka uç (null = henüz yüklenmedi) */
    get activeGpu(): ActiveGpu | null {
        return this.engine?.activeGpu ?? null;
    }

    async gpuVramMb(): Promise<number> {
        return (await this.engine?.gpuVramMb()) ?? 0;
    }

    /** Modelin kaç katmanı GPU'ya yüklendi (0 = henüz yüklenmedi) */
    get gpuLayersUsed(): number {
        return this.engine?.gpuLayersUsed ?? 0;
    }

    get engineInfo(): { modelPath: string; modelId: string } {
        return { modelPath: this.modelPath, modelId: this.model.id };
    }

    /** İstemciye raporlanacak bağlam doluluk bilgisi */
    getContextStats(): { usedTokens: number; contextSize: number } | null {
        if (!this.engine) return null;
        return {
            usedTokens: this.engine.getUsedContextTokens(),
            contextSize: this.engine.contextSize
        };
    }

    private async ensureSession(signal?: AbortSignal): Promise<LlamaChatSession> {
        if (this.session) return this.session;
        this.engine = new LlamaEngine({
            modelPath: this.modelPath,
            config: this.config,
            chatWrapperName: this.model.chatWrapper,
            reasoning: this.reasoningEnabled,
            contextSize: this.model.contextSize,
            gpuLayers: this.model.gpuLayers,
            onProgress: (pct) => this.onLoadProgress?.(pct),
            signal: signal ?? this.signal
        });
        await this.engine.createContext();
        this.onLoadComplete?.();
        this.session = this.engine.createSession(this.systemPrompt);
        if (this.pendingHistory) {
            this.session.setChatHistory(this.pendingHistory);
            this.pendingHistory = undefined;
        }
        return this.session;
    }

    async prompt(userPrompt: string, options?: { signal?: AbortSignal }): Promise<string> {
        const result = await this.promptTask(userPrompt, options);
        return result.response;
    }

    /**
     * Otonom görev yürütme: model araç çağrılarıyla görevi adım adım tamamlar.
     * Döngü şuralarda biter: task_complete aracı, araçsız bir tur (nihai özet),
     * adım bütçesi dolması veya iptal sinyali.
     */
    async promptTask(userPrompt: string, options?: { signal?: AbortSignal }): Promise<AjanTaskResult> {
        try {
            return await this.runTask(userPrompt, options);
        } catch (err) {
            // İptal (abort) bir hata değildir; yalnızca gerçek hataları bildir.
            const aborted = err instanceof Error && (err.name === "AbortError" || /abort/i.test(err.message));
            if (!aborted) {
                const error = err instanceof Error ? err : new Error(String(err));
                logger.error(`Gorev hatasi: ${error.message}`);
                this.events.onError?.(error);
            }
            throw err;
        }
    }

    private async runTask(userPrompt: string, options?: { signal?: AbortSignal } | undefined): Promise<AjanTaskResult> {
        const session = await this.ensureSession(options?.signal ?? this.signal);
        const signals: ToolExecutionSignal = {};
        const ctx: ToolExecutionContext = {
            cwd: this.cwd,
            config: this.config,
            signals
        };
        let toolCallsThisRound = 0;
        const toolEvents: ToolEvents = {
            onToolCall: (name, params) => {
                toolCallsThisRound++;
                this.events.onToolCall?.(name, params);
            },
            onToolResult: (name, ok, output) => this.events.onToolResult?.(name, ok, output)
        };
        const functions = buildSessionFunctions(this.tools, ctx, toolEvents);
        const sessionOpts = this.config.session ?? {};
        const maxSteps = Math.max(1, this.config.maxSteps ?? 25);
        const activeSignal = options?.signal ?? this.signal;

        const runRound = (promptText: string): Promise<string> => {
            toolCallsThisRound = 0;
            this.trimContextIfNeeded();
            logger.debug(`Prompt gonderiliyor (${promptText.length} karakter)`);
            return session.prompt(promptText, {
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
                signal: activeSignal
            });
        };

        const continuePrompt =
            "Devam et. (Bir önceki turda task_complete ile continue:true istedin veya işin yarıda kaldı.) " +
            "Kalan adımları araçlarla tamamla. Görevi sürdürmek istersen yine task_complete(continue:true) çağır; " +
            "her şey bitip doğrulandığında task_complete(continue:false) ile bitir.";

        // Model kendi kararıyla sürdürür/durur: task_complete(continue:true) yeni tur açar,
        // task_complete(continue:false) veya araçsız son yanıt akışı bitirir.
        let step = 0;
        let response = "";
        while (step < maxSteps) {
            if (activeSignal?.aborted) break;
            step++;
            this.events.onStepStart?.(step, maxSteps);
            try {
                response = await runRound(step === 1 ? userPrompt : continuePrompt);
            } finally {
                this.events.onStepEnd?.(step, maxSteps, toolCallsThisRound);
            }
            if (signals.taskCompleted) break;
            const keepGoing = signals.continueRequested === true || toolCallsThisRound > 0;
            signals.continueRequested = false;
            if (!keepGoing) break;
        }

        const budgetExhausted = !signals.taskCompleted && step >= maxSteps;
        this.events.onComplete?.(response);
        return { response, steps: step, maxSteps, completed: signals.taskCompleted === true, budgetExhausted };
    }

    /** Context eşiğini aşınca eski konuşma turlarını baştan kırpar (system promptu korunur) */
    private trimContextIfNeeded(): void {
        if (!this.engine || !this.session) return;
        const contextSize = this.engine.contextSize;
        const used = this.engine.getUsedContextTokens();
        if (contextSize <= 0 || used <= 0) return;
        const threshold = this.config.contextTrimThreshold ?? 0.8;
        if (used <= contextSize * threshold) return;

        const history = this.session.getChatHistory();
        if (history.length <= 1) return;

        let systemCount = 0;
        while (systemCount < history.length && history[systemCount]!.type === "system") systemCount++;
        if (systemCount >= history.length) return;

        const tail = history.slice(systemCount);
        const budget = Math.floor(contextSize * threshold * 0.6);
        const keptTail: ChatHistoryItem[] = [];
        let total = 0;
        for (let i = tail.length - 1; i >= 0; i--) {
            const item = tail[i]!;
            const tokens = Math.ceil(historyItemText(item).length / 3.2);
            if (keptTail.length > 0 && total + tokens > budget) break;
            keptTail.unshift(item);
            total += tokens;
        }
        const kept = [...history.slice(0, systemCount), ...keptTail];
        const removed = history.length - kept.length;
        if (removed > 0) {
            this.session.setChatHistory(kept);
            logger.info(`Context sıkıştırıldı: ${removed} mesaj kırpıldı (${used} token)`);
            this.events.onContextTrimmed?.(removed);
        }
    }

    /** Oturumdaki geçmişi temizler (yeni konuşma) */
    resetConversation(): void {
        this.session?.resetChatHistory();
    }

    /** Aktif oturumun geçmişini döndürür (oturum yoksa bekleyen geçmişi) */
    getChatHistory(): ChatHistoryItem[] {
        if (this.session) return this.session.getChatHistory();
        return this.pendingHistory ?? [];
    }

    /** Oturum geçmişini yükler; oturum henüz kurulmadıysa ilk kurulumda uygulanır */
    setChatHistory(history: ChatHistoryItem[]): void {
        if (this.session) {
            this.session.setChatHistory(history);
            this.pendingHistory = undefined;
        } else {
            this.pendingHistory = history;
        }
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
