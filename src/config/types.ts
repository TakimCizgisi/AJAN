export type ChatWrapperName =
    | "auto"
    | "gemma4"
    | "gemma"
    | "qwen3"
    | "llama3"
    | "mistral"
    | "functionary"
    | "chatml";

export type GpuBackend =
    | "auto"
    | "metal"
    | "cuda"
    | "vulkan"
    | "webgpu"
    | "cuda-llama"
    | "vulkan-llama";

/** Düşünme (reasoning/thought) modu: auto = katalog değerini kullan */
export type ReasoningMode = "auto" | "on" | "off";

/** Model başına ayarlar (istemciden, katalogu değiştirmeden) */
export type ModelOverride = {
    reasoning?: ReasoningMode;
};

export type ModelDefinition = {
    /** Benzersiz model kimliği */
    id: string;
    /** Görünen ad */
    name: string;
    /** Açıklama */
    description?: string;
    /** İndirme URI'si (hf:..., https://...) */
    uri: string;
    /** Yerel dosya adı (yoksa uri'den türetilir) */
    fileName?: string;
    /** Bağlam penceresi boyutu */
    contextSize?: number | "auto";
    /** GPU katman sayısı */
    gpuLayers?: number | "auto" | "max";
    /** Chat sarmalayıcı adı */
    chatWrapper?: ChatWrapperName;
    /** Muhakeme (reasoning) modu — model başına geçersiz kılınabilir */
    reasoning?: boolean;
    /** Multimodal (görüntü) desteği */
    multimodal?: boolean;
    /** Dosya boyutu (bayt) — indirme kontrolü için */
    size?: number;
    /** Dosya sha256 sağlaması */
    sha256?: string;
    /** Modelin özel ana system promptu (varsa varsayılan prompt yerine kullanılır) */
    systemPrompt?: string;
    /** Modelin ikincil system promptu (ana prompttan sonra eklenir) */
    secondarySystemPrompt?: string;
    /** Özel yapılandırma (modele özgü parametreler) */
    options?: Record<string, unknown>;
};

export type RemoteModelsRegistry = {
    version: number;
    source?: string;
    updatedAt?: string;
    models: ModelDefinition[];
};

export type SessionConfig = {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxTokens?: number;
    seed?: number;
    repeatPenalty?: number;
    dryRepeatPenalty?: boolean;
};

export type AjanConfig = {
    /** Seçili model kimliği */
    modelId: string;
    /** Sistem promptu */
    systemPrompt?: string;
    /** Bağlam boyutu */
    contextSize?: number | "auto";
    /** GPU katman sayısı */
    gpuLayers?: number | "auto" | "max";
    /** GPU arka ucu */
    gpu?: GpuBackend;
    /** Model başına geçersiz kılmalar (örn. { "model-id": { reasoning: "off" } }) */
    modelOverrides?: Record<string, ModelOverride>;
    /** Oturum parametreleri */
    session?: SessionConfig;
    /** Araç çalıştırma zaman aşımı (ms) */
    toolTimeout?: number;
    /** Araçlarda döndürülen maks. çıktı uzunluğu (karakter) */
    maxToolOutput?: number;
    /** Context dolunca eski turların kırpılacağı eşik (0-1, contextSize oranı) */
    contextTrimThreshold?: number;
    /** Otonom görev başına maksimum araç-adımı (varsayılan 25) */
    maxSteps?: number;
    /** Çalıştırılması engellenecek komut desenleri (regex) */
    blockedCommands?: string[];
    /** Görev tamamlanınca bip çal */
    beepOnComplete?: boolean;
    /** Remote models.json kaynağı (GitHub vb.) */
    remoteModelsUrl?: string;
    /** Kayıtlı projeler (klasör yolları) */
    projects?: string[];
    /** Aktif proje yolu */
    activeProject?: string;
};

export type ToolHandler<Params = any> = (params: Params, ctx: ToolExecutionContext) => Promise<ToolExecutionResult> | ToolExecutionResult;

export type ToolExecutionSignal = {
    /** task_complete aracı çağrıldığında true olur */
    taskCompleted?: boolean;
    /** task_complete(continue:true) çağrıldığında model yeni bir tur istemiştir */
    continueRequested?: boolean;
};

export type ToolExecutionContext = {
    cwd: string;
    config: AjanConfig;
    signals?: ToolExecutionSignal;
};

export type ToolExecutionResult = {
    ok: boolean;
    output: string;
    error?: string;
};

export type AgentTool = {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    handler: ToolHandler;
};
