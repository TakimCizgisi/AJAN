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

export type LlamaEngineOptions = {
    modelPath: string;
    config: AjanConfig;
    chatWrapperName?: ChatWrapperName;
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
    private readonly gpuBackend?: AjanConfig["gpu"];
    private readonly onProgress?: (progress: number) => void;
    private readonly signal?: AbortSignal;

    constructor(options: LlamaEngineOptions) {
        this.modelPath = options.modelPath;
        this.config = options.config;
        this.chatWrapperName = options.chatWrapperName;
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

    static async detectSupportedGpus(): Promise<string[]> {
        try {
            const supported = await getLlamaGpuTypes("supported");
            return supported.filter((g): g is "metal" | "cuda" | "vulkan" => typeof g === "string");
        } catch {
            return [];
        }
    }

    async init(): Promise<void> {
        if (this.llama) return;
        logger.info(`Motor baslatiliyor... (model: ${this.modelPath})`);
        const supportedGpus = await LlamaEngine.detectSupportedGpus();
        logger.debug(`Desteklenen GPU'lar: ${supportedGpus.join(", ") || "yok (CPU)"}`);

        this.llama = await getLlama({
            gpu: this.gpuOption,
            logLevel: LlamaLogLevel.error,
            progressLogs: "stderr",
            skipDownload: true
        });
    }

    async loadModel(onProgress?: (pct: number) => void): Promise<void> {
        await this.init();
        if (this.model) return;
        logger.info(`Model yukleniyor: ${this.modelPath}`);

        this.model = await this.llama!.loadModel({
            modelPath: this.modelPath,
            gpuLayers: this.config.gpuLayers ?? "auto",
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
            contextSize: this.config.contextSize ?? "auto"
        });
        this.sequence = this.context.getSequence();
    }

    createSession(systemPrompt: string): LlamaChatSession {
        if (!this.sequence) throw new Error("Oturum olusturmadan once context olusturulmali (createContext)");
        const wrapper = resolveChatWrapper(this.chatWrapperName ?? "auto");
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

export function resolveChatWrapper(name: ChatWrapperName): "auto" | ChatWrapper {
    switch (name) {
        case "gemma4":
            return new Gemma4ChatWrapper({ reasoning: true });
        case "gemma":
            return new GemmaChatWrapper();
        case "qwen3":
            return new QwenChatWrapper();
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
