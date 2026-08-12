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
    /** Varsayılan çalışma dizini */
    cwd?: string;
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
    /** Remote models.json kaynağı (GitHub vb.) */
    remoteModelsUrl?: string;
};

export type ToolHandler<Params = any> = (params: Params, ctx: ToolExecutionContext) => Promise<ToolExecutionResult> | ToolExecutionResult;

export type ToolExecutionContext = {
    cwd: string;
    config: AjanConfig;
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
