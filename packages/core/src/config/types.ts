import type { GbnfJsonSchema } from "node-llama-cpp";

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
    /** Muhakeme (reasoning) modu */
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

export type DiscordConfig = {
    /** Discord Rich Presence etkin mi */
    enabled?: boolean;
    /** Discord Application (Client) ID — Developer Portal'dan alınır */
    clientId?: string;
    /** Bağlantı transport'u: "ipc" (masaüstü socket) veya "websocket" (yerel RPC WS) */
    transport?: "ipc" | "websocket";
    /** Araç çağrılarını etkinlikte göster (örn. "read_file") */
    showToolCalls?: boolean;
    /** Düşünme/metin akışını etkinlikte göster */
    showThinking?: boolean;
    /** Büyük görsel asset anahtarı (Developer Portal > Rich Presence > Art Assets) */
    largeImageKey?: string;
    /** Büyük görsel açıklaması */
    largeImageText?: string;
    /** Duruma göre kullanılacak küçük görsel asset anahtarları */
    smallImageKeys?: {
        idle?: string;
        chat?: string;
        task?: string;
        loading?: string;
        error?: string;
    };
    /** Etkinlikte gösterilecek butonlar (örn. GitHub'a giden) */
    buttons?: {
        label?: string;
        url?: string;
    };
};

export type AjanConfig = {
    /** Seçili model kimliği */
    modelId: string;
    /** Discord Rich Presence ayarları */
    discord?: DiscordConfig;
    /** Sistem promptu */
    systemPrompt?: string;
    /** Bağlam boyutu */
    contextSize?: number | "auto";
    /** GPU katman sayısı */
    gpuLayers?: number | "auto" | "max";
    /** GPU arka ucu */
    gpu?: GpuBackend;
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
