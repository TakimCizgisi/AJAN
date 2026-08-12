import type { ChatSessionModelFunction, ChatSessionModelFunctions } from "node-llama-cpp";
import type { AgentTool, ToolExecutionContext } from "../config/types.js";
import { readFileTool, writeFileTool, listDirTool, searchFilesTool, grepTool } from "./file.js";
import { runCommandTool } from "./terminal.js";
import { applyPatchTool } from "./patch.js";
import { webSearchTool } from "./web.js";
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
        runCommandTool,
        applyPatchTool,
        webSearchTool
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
                    return res.output;
                } catch (err) {
                    const msg = `Araç hatası: ${(err as Error).message}`;
                    logger.error(msg);
                    events.onToolResult?.(tool.name, false, msg);
                    return msg;
                }
            }
        };
    }
    return result as ChatSessionModelFunctions;
}
