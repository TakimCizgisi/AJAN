export { AjanAgent, type AgentOptions, type AgentEvents } from "./core/agent.js";
export { AjanService, type ServiceEvents, type ModelWithStatus } from "./service.js";
export { LlamaEngine } from "./engine/llama.js";
export {
    downloadModel,
    formatBytes,
    formatTime,
    isDownloaded,
    getModelFileSize,
    type DownloadProgress
} from "./engine/modelManager.js";
export {
    DEFAULT_CONFIG,
    loadConfig,
    saveConfig,
    getModelsRegistry,
    getModelById,
    refreshRemoteModels,
    listInstalledModels,
    isModelInstalled,
    removeModelFile,
    resolveModelFilePath
} from "./config/configManager.js";
export { createCoreTools, buildSessionFunctions } from "./tools/registry.js";
export { parseUnifiedDiff } from "./tools/patch.js";
export type {
    AjanConfig,
    ModelDefinition,
    RemoteModelsRegistry,
    SessionConfig,
    AgentTool,
    ToolHandler,
    ToolExecutionContext,
    ToolExecutionResult,
    ChatWrapperName,
    GpuBackend,
    ReasoningMode,
    ModelOverride
} from "./config/types.js";
export { getDataDir, getModelsDir, getConfigPath, getLogDir, setLogLevel, logger } from "./utils/paths.js";

// IPC yüzeyi: tüketiciler motoru `AjanEngine` ile konuşturur, CLI gerekmez.
export { AjanEngine, EngineError, type AskOptions, type EngineEventListener } from "./client/client.js";
export {
    PROTOCOL_VERSION,
    isRequestFrame,
    isEventFrame,
    isResponseFrame,
    type Request,
    type RequestType,
    type RequestFrame,
    type ResponseFrame,
    type ServerFrame,
    type EventFrame,
    type EventName,
    type Result,
    type StatusReport,
    type GpuReport,
    type ModelEntry,
    type SessionSummary,
    type HistoryMessage
} from "./protocol/messages.js";
export { defaultSocketPath, ClientChannel, serveChannel, send } from "./protocol/channel.js";
