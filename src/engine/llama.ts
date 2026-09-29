import {
    getLlama,
    getLlamaGpuTypes,
    LlamaChatSession,
    Gemma4ChatWrapper,
    GemmaChatWrapper,
    QwenChatWrapper,
    Llama3_1ChatWrapper,
    MistralChatWrapper,
    ChatMLChatWrapper,
    FunctionaryChatWrapper,
    LlamaLogLevel,
    type Llama,
    type LlamaModel,
    type LlamaContext,
    type LlamaContextSequence,
    type ChatWrapper,
    type ChatSessionModelFunctions
} from "node-llama-cpp";
import type { AjanConfig, ChatWrapperName } from "../config/types.js";
import { logger } from "../utils/paths.js";

/** Motorun gerçekten üzerinde çalıştığı arka uç */
export type ActiveGpu = {
    /** "cpu" | "cuda" | "vulkan" | "metal" */
    backend: string;
    /** Katman aktarımı açık mı */
    offload: boolean;
};

export type LlamaEngineOptions = {
    modelPath: string;
    config: AjanConfig;
    chatWrapperName?: ChatWrapperName;
    /** Düşünme (thought) üretimi açık mı; belirtilmezse sarmalayıcının varsayılanı. */
    reasoning?: boolean;
    /** Modele özel bağlam penceresi; yoksa config.contextSize kullanılır. */
    contextSize?: AjanConfig["contextSize"];
    /** Modele özel GPU katman sayısı; yoksa config.gpuLayers kullanılır. */
    gpuLayers?: AjanConfig["gpuLayers"];
    gpuBackend?: AjanConfig["gpu"];
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
};

export class LlamaEngine {
    private llama: Llama | undefined;
    private model: LlamaModel | undefined;
    private context: LlamaContext | undefined;
    private sequence: LlamaContextSequence | undefined;
    private session: LlamaChatSession | undefined;
    private readonly modelPath: string;
    private readonly config: AjanConfig;
    private readonly chatWrapperName?: ChatWrapperName;
    /** Katalog + kullanıcı geçersiz kılmasından çözülmüş düşünme modu */
    private readonly reasoning?: boolean;
    private readonly contextSizeOption: AjanConfig["contextSize"];
    private readonly gpuLayersOption: AjanConfig["gpuLayers"];
    private readonly gpuBackend?: AjanConfig["gpu"];
    private readonly onProgress?: (progress: number) => void;
    private readonly signal?: AbortSignal;

    constructor(options: LlamaEngineOptions) {
        this.modelPath = options.modelPath;
        this.config = options.config;
        this.chatWrapperName = options.chatWrapperName;
        this.reasoning = options.reasoning;
        // Katalogdaki "auto" bir sayı değil, "config'e uy" demek: aksi halde
        // modelin eğitim bağlamı (örn. 128K) CPU'da dev KV cache'e yol açıyor.
        const modelContext = options.contextSize;
        this.contextSizeOption = modelContext && modelContext !== "auto" ? modelContext : options.config.contextSize;
        const modelLayers = options.gpuLayers;
        this.gpuLayersOption = modelLayers && modelLayers !== "auto" ? modelLayers : options.config.gpuLayers;
        this.gpuBackend = options.gpuBackend ?? options.config.gpu;
        this.onProgress = options.onProgress;
        this.signal = options.signal;
    }

    /**
     * config.gpu değerini node-llama-cpp'in kabul ettiği arka uca çevirir.
     * Önceden otomotik dışındaki seçimler (cuda/vulkan/metal) sessizce yok sayılıyordu;
     * config'de açıkça seçilen arka uç artık motora iletilir.
     */
    private get gpuOption(): "auto" | "cuda" | "vulkan" | "metal" | undefined {
        switch (this.gpuBackend) {
            case "cuda":
            case "cuda-llama":
                return "cuda";
            case "vulkan":
            case "vulkan-llama":
                return "vulkan";
            case "metal":
                return "metal";
            case "auto":
            default:
                // webgpu vb. bu node-llama-cpp sürümünde desteklenmiyor; auto'ya düş.
                return "auto";
        }
    }

    /**
     * Motorun deneyeceği arka uç sırası.
     *
     * Yalnızca CUDA ve Vulkan desteklenir. Sıra config.gpu ile başlar:
     * kullanıcı "vulkan" dediyse CUDA denemesi yapılmaz, "cuda" dediyse
     * CUDA denenir ve olmazsa Vulkan'a düşülür. Sondaki "auto" node-llama-cpp'ın
     * kendi çözümlemesidir (CUDA yoksa Vulkan, o da yoksa CPU).
     */
    private get gpuFallbackChain(): ("auto" | "cuda" | "vulkan")[] {
        const wanted = this.gpuOption;
        if (wanted === "cuda") return ["cuda", "vulkan", "auto"];
        if (wanted === "vulkan") return ["vulkan", "auto"];
        if (wanted === "metal") return ["auto"];
        return ["auto"];
    }

    static async detectSupportedGpus(): Promise<string[]> {
        try {
            const supported = await getLlamaGpuTypes("supported");
            return supported.filter((g): g is "metal" | "cuda" | "vulkan" => typeof g === "string");
        } catch {
            return [];
        }
    }

    /**
     * Gerçekten yüklenen arka ucu döndürür.
     *
     * `detectSupportedGpus()` yalnızca "makine bu arka ucu destekliyor mu"
     * diye bakar; kurulu build'de o pakete ait ikili yoksa node-llama-cpp
     * sessizce CPU'ya düşer ve istemci yanlışlıkla GPU kullanıldığını sanar. `Llama.gpu`
     * ise yüklenen gerçek değerdir.
     */
    get activeGpu(): ActiveGpu | null {
        const llama = this.llama;
        if (!llama) return null;
        return {
            backend: llama.gpu === false ? "cpu" : llama.gpu,
            offload: llama.supportsGpuOffloading
        };
    }

    /** Kullanılabilen GPU belleği (MB); CPU modunda 0 döner. */
    async gpuVramMb(): Promise<number> {
        if (!this.llama || this.llama.gpu === false) return 0;
        try {
            const info = await this.llama.getLlamaMemoryUsage();
            return Math.round(info.gpuVram / (1024 * 1024));
        } catch {
            return 0;
        }
    }

    async init(): Promise<void> {
        if (this.llama) return;
        logger.info(`Motor baslatiliyor... (model: ${this.modelPath})`);
        const supportedGpus = await LlamaEngine.detectSupportedGpus();
        logger.debug(`Desteklenen GPU'lar: ${supportedGpus.join(", ") || "yok (CPU)"}`);

        // Sırayla dene: ilk yüklenen kazanır. Sessizce CPU'ya düşmüyoruz —
        // kullanıcı hangi adaya geçildiğini ve nedenini görsün.
        const chain = this.gpuFallbackChain;
        const failures: string[] = [];
        for (const candidate of chain) {
            try {
                this.llama = await getLlama({
                    gpu: candidate,
                    logLevel: LlamaLogLevel.error,
                    progressLogs: "stderr",
                    skipDownload: true
                });
                this.reportGpuChoice(candidate, chain.length > 1, supportedGpus);
                return;
            } catch (err) {
                const reason = firstLine((err as Error).message);
                failures.push(`${candidate}: ${reason}`);
                logger.warn(`${candidate} kullanilamadi (${reason})`);
            }
        }

        // Zincirin tamamı tuttu. Sessiz yavaşlamak yerine açıkça hata ver.
        throw new Error(
            `GPU motoru baslatilamadi. Denenenler -> ${failures.join(" | ")}`
        );
    }

    /**
     * İstenen arka uç ile gerçekte yüklenen arka uç farklıysa gürültü atma,
     * logla. Kullanıcı "CUDA seçtim ama CPU'da çalışıyor" krizini önceden görsün.
     */
    private reportGpuChoice(loaded: string, hadFallbacks: boolean, supportedGpus: string[]): void {
        const active = this.activeGpu?.backend;
        if (!active) return;
        if (active === "cpu") {
            logger.warn(
                `GPU kullanilamiyor, CPU uzerinde calisiliyor. ` +
                    `istenen: ${this.gpuOption} · makinede: ${supportedGpus.join(", ") || "yok"}`
            );
            return;
        }
        if (!hadFallbacks) return;
        if (loaded === "auto" && active !== this.gpuOption) {
            logger.warn(`istenen arka uc ${this.gpuOption}, yuklenen ${active}`);
        } else {
            logger.info(`GPU arka ucu: ${active}`);
        }
    }

    /** Modelin kaç katmanını GPU'ya yükledi (0 = tamamen CPU'da). */
    get gpuLayersUsed(): number {
        return this.model?.gpuLayers ?? 0;
    }

    async loadModel(onProgress?: (pct: number) => void): Promise<void> {
        await this.init();
        if (this.model) return;
        logger.info(`Model yukleniyor: ${this.modelPath}`);

        this.model = await this.llama!.loadModel({
            modelPath: this.modelPath,
            gpuLayers: this.gpuLayersOption ?? "auto",
            onLoadProgress: (pct) => {
                const percentage = Math.min(100, Math.max(0, Math.round(pct * 100)));
                onProgress?.(percentage);
                this.onProgress?.(percentage);
            },
            loadSignal: this.signal
        });
    }

    async createContext(): Promise<void> {
        await this.loadModel();
        if (this.context) return;
        this.context = await this.model!.createContext({
            contextSize: this.contextSizeOption ?? "auto"
        });
        this.sequence = this.context.getSequence();
    }

    createSession(systemPrompt: string): LlamaChatSession {
        if (!this.sequence) throw new Error("Oturum olusturmadan once context olusturulmali (createContext)");
        const wrapper = resolveChatWrapper(this.chatWrapperName ?? "auto", this.reasoning);
        this.session = new LlamaChatSession({
            contextSequence: this.sequence,
            systemPrompt,
            chatWrapper: wrapper
        });
        return this.session;
    }

    /** Konuşma geçmişini temizler ve yeni sistem promptu ile taze bir oturum kurar */
    async resetSession(systemPrompt: string): Promise<LlamaChatSession> {
        if (!this.sequence) throw new Error("Oturum olusturmadan once context olusturulmali (createContext)");
        await this.session?.dispose();
        await this.sequence.clearHistory();
        return this.createSession(systemPrompt);
    }

    getSession(): LlamaChatSession | undefined {
        return this.session;
    }

    get contextSize(): number {
        return this.context?.contextSize ?? 0;
    }

    getUsedContextTokens(): number {
        return this.sequence?.nextTokenIndex ?? 0;
    }

    get sequenceInstalled(): boolean {
        return this.sequence != null;
    }

    async dispose(): Promise<void> {
        try {
            this.session?.dispose();
            this.context?.dispose();
            this.model?.dispose();
            this.llama?.dispose();
        } catch {
            /* dispose hatalari yut */
        }
        this.session = undefined;
        this.context = undefined;
        this.model = undefined;
        this.llama = undefined;
        this.sequence = undefined;
    }
}

/**
 * Chat sarmalayıcısını kurar.
 *
 * Düşünme seçeneği her sarmalayıcıda farklı ad taşır: Gemma4'te `reasoning`,
 * Qwen3'te `thoughts`. Seçeneği olmayan sarmalayıcılara dokunulmaz, böylece
 * kapatılmış bir düşünme onların şablonunu bozmaz.
 */
function resolveChatWrapper(name: ChatWrapperName, reasoning?: boolean): "auto" | ChatWrapper {
    switch (name) {
        case "gemma4":
            return new Gemma4ChatWrapper({ reasoning: reasoning ?? true });
        case "gemma":
            return new GemmaChatWrapper();
        case "qwen3":
            // QwenChatWrapper boolean kabul etmez: "discourage" modeli düşünmekten
            // vazgeçirir, "auto" normal davranışı verir.
            return new QwenChatWrapper({ thoughts: reasoning === false ? "discourage" : "auto" });
        case "llama3":
            return new Llama3_1ChatWrapper();
        case "mistral":
            return new MistralChatWrapper();
        case "chatml":
            return new ChatMLChatWrapper();
        case "functionary":
            return new FunctionaryChatWrapper();
        case "auto":
        default:
            return "auto";
    }
}

export type { ChatSessionModelFunctions };

/** Hata mesajının ilk satırı; node-llama-cpp çok satırlı hata veriyor. */
function firstLine(message: string): string {
    const line = message.split("\n").find((l) => l.trim().length > 0) ?? message;
    return line.trim().slice(0, 160);
}
