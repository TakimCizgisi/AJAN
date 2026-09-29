/**
 * AJAN IPC protokolü — sözleşmenin tek kaynağı.
 *
 * Hem daemon (`src/daemon`) hem istemci (`src/client`) buradan içe aktarır.
 * Bu dosya çalışma zamanında hiçbir şey yapmaz: yalnızca tipler ve iki küçük
 * doğrulayıcı. Böylece iki taraf aynı sözleşmeyi görmeye zorlanır.
 *
 * Çerçeveleme: JSON Lines. Her mesaj tek satırlık geçerli JSON'dur; akış
 * (token) olayları bu yüzden satır ayrımıyla taşınabilir.
 */
import type { StoredSession } from "../utils/sessions.js";
import type { AjanConfig, ModelDefinition, ReasoningMode } from "../config/types.js";

export const PROTOCOL_VERSION = 1;

// ── İstekler ──

export type Request =
    | { type: "ping" }
    | { type: "status" }
    | { type: "set-config"; patch: Record<string, unknown> }
    | { type: "list-models" }
    | { type: "install-model"; id: string }
    | { type: "remove-model"; id: string }
    | { type: "use-model"; id: string }
    | { type: "refresh-models" }
    | { type: "chat"; text: string; modelId?: string }
    | { type: "abort" }
    | { type: "new-chat" }
    | { type: "get-history" }
    | { type: "list-sessions" }
    | { type: "load-session"; id: string }
    | { type: "save-session"; session: StoredSession }
    | { type: "delete-session"; id: string }
    | { type: "shutdown" };

export type RequestType = Request["type"];

// ── Yanıtlar ──

export type ModelEntry = ModelDefinition & { path: string; installed: boolean; active: boolean };
export type SessionSummary = { id: string; title: string; updatedAt: string };

export type GpuReport = {
    /** Gerçekte yüklenen arka uç: "cpu" | "cuda" | "vulkan" | "metal" */
    active: string;
    /** GPU'ya katman aktarımı açık mı */
    offload: boolean;
    /** Kullanılan GPU belleği (MB) */
    vramMb: number;
    /** GPU'ya yüklenen katman sayısı (0 = henüz yüklenmedi) */
    layers: number;
    /** Bu makinede sürücüsü bulunan arka uçlar */
    supported: string[];
    /** config.gpu değeri */
    preferred: string;
    /** İstenen arka uç kullanılamayıp başka birine düşüldü mü */
    fallback: boolean;
};

export type StatusReport = {
    protocol: number;
    version: string;
    modelId: string;
    modelName: string;
    installed: boolean;
    loading: boolean;
    busy: boolean;
    /** Ajanın çalışma dizini */
    cwd: string;
    gpu: GpuReport;
    context: { usedTokens: number; contextSize: number } | null;
    reasoning: { mode: ReasoningMode; enabled: boolean } | null;
    config: AjanConfig;
    /** Bağlı istemci sayısı */
    clients: number;
    uptimeSec: number;
};

export type Result =
    | { type: "pong"; protocol: number; version: string }
    | { type: "status"; status: StatusReport }
    | { type: "config"; config: AjanConfig }
    | { type: "models"; models: ModelEntry[]; error?: string }
    | { type: "model"; id: string; ok: boolean; error?: string }
    | { type: "models-refreshed"; ok: boolean; count: number; error?: string }
    | { type: "history"; messages: HistoryMessage[] }
    | { type: "sessions"; sessions: SessionSummary[] }
    | { type: "session"; session: StoredSession | null; ok: boolean; error?: string }
    | { type: "ok" }
    | { type: "shutdown"; ok: true };

export type HistoryMessage = { kind: "user" | "assistant" | "thought" | "tool"; text: string; name?: string };

/** İstek zarfı */
export type RequestFrame = { id: number; req: Request };
/** Yanıt zarfı */
export type ResponseFrame = { id: number; ok: true; result: Result } | { id: number; ok: false; error: string };

// ── Olaylar (motor → istemci, `id` taşımaz) ──

export type EventFrame =
    | { event: "load-progress"; pct: number }
    | { event: "load-complete" }
    | { event: "step-start"; step: number; maxSteps: number }
    | { event: "step-end"; step: number }
    | { event: "text-chunk"; text: string }
    | { event: "thinking-chunk"; text: string }
    | { event: "tool-call"; name: string; args: Record<string, unknown> }
    | { event: "tool-result"; name: string; ok: boolean; output: string }
    | { event: "complete"; response: string; steps: number }
    | { event: "error"; message: string }
    | { event: "log"; level: "debug" | "info" | "warn" | "error"; message: string };

export type EventName = EventFrame["event"];

/** İstemciye giden her şey */
export type ServerFrame = ResponseFrame | EventFrame;

// ── Doğrulayıcılar ──

export function isRequestFrame(value: unknown): value is RequestFrame {
    if (!value || typeof value !== "object") return false;
    const f = value as { id?: unknown; req?: { type?: unknown } };
    return typeof f.id === "number" && !!f.req && typeof f.req === "object" && typeof f.req.type === "string";
}

export function isEventFrame(value: unknown): value is EventFrame {
    if (!value || typeof value !== "object") return false;
    const f = value as { event?: unknown };
    return typeof f.event === "string";
}

export function isResponseFrame(value: unknown): value is ResponseFrame {
    if (!value || typeof value !== "object") return false;
    const f = value as { id?: unknown; event?: unknown };
    return typeof f.id === "number" && f.event === undefined;
}
