import type { ChatSessionModelFunction, ChatSessionModelFunctions } from "node-llama-cpp";
import type { AgentTool, ToolExecutionContext, ToolExecutionSignal } from "../config/types.js";
import { readFileTool, writeFileTool, listDirTool, searchFilesTool, grepTool } from "./file.js";
import { runCommandTool } from "./terminal.js";
import { applyPatchTool } from "./patch.js";
import { editFileTool } from "./edit.js";
import { webSearchTool, fetchUrlTool } from "./web.js";
import { moveFileTool, deleteFileTool } from "./filesys.js";
import { readDataTool, unzipFileTool } from "./data.js";
import { noteAddTool, noteReadTool } from "./memory.js";
import { taskCompleteTool } from "./taskComplete.js";
import { openPlaygroundTool, setTodosTool, getTodosTool } from "./playground.js";
import { logger } from "../utils/paths.js";

export type ToolEvents = {
    onToolCall?: (name: string, params: unknown) => void;
    onToolResult?: (name: string, ok: boolean, output: string) => void;
};

export function createCoreTools(ctx: ToolExecutionContext): AgentTool[] {
    return [
        readFileTool,
        writeFileTool,
        listDirTool,
        searchFilesTool,
        grepTool,
        editFileTool,
        moveFileTool,
        deleteFileTool,
        readDataTool,
        unzipFileTool,
        runCommandTool,
        applyPatchTool,
        webSearchTool,
        fetchUrlTool,
        noteAddTool,
        noteReadTool,
        taskCompleteTool,
        openPlaygroundTool,
        setTodosTool,
        getTodosTool
    ];
}

export function buildSessionFunctions(
    tools: AgentTool[],
    ctx: ToolExecutionContext,
    events: ToolEvents = {}
): ChatSessionModelFunctions {
    const result: Record<string, ChatSessionModelFunction<any>> = {};
    for (const tool of tools) {
        result[tool.name] = {
            description: tool.description,
            params: tool.parameters as never,
            handler: async (params: any) => {
                events.onToolCall?.(tool.name, params);
                logger.debug(`Arac cagirildi: ${tool.name}`);
                try {
                    const res = await tool.handler(params, ctx);
                    events.onToolResult?.(tool.name, res.ok, res.output);
                    if (res.ok) return res.output;
                    return (
                        `HATA (${tool.name}): ${res.output} | ` +
                        "NOT: Araç başarısız oldu; bu işlem GERÇEKLEŞMEDİ. Hatayı kullanıcıya bildir veya sorunu çözüp tekrar dene. Başarılı diye raporlama."
                    );
                } catch (err) {
                    const msg = (err as Error).message;
                    const out = `HATA (${tool.name}): ${msg} | NOT: Araç hata verdi; işlem gerçekleşmedi. Başarılı diye raporlama.`;
                    logger.error(`Araç hatasi: ${tool.name}: ${msg}`);
                    events.onToolResult?.(tool.name, false, msg);
                    return out;
                }
            }
        };
    }
    return result as ChatSessionModelFunctions;
}

export type { ToolExecutionSignal };
