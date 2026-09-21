import { ipcMain, BrowserWindow, shell, type WebContents } from "electron";
import { AjanService, type ServiceEvents } from "@takimcizgisi/core";
import type { PmStatus, ServiceEvent, ServiceRequest } from "../shared/ipc.js";
import { pmCatalog, pmEcosystem, pmInstallCore, pmInstallPackage, pmInstallVscode, pmStatus, pmUpdates } from "./pm.js";

function buildEvents(send: (event: ServiceEvent) => void): ServiceEvents {
    return {
        onTextChunk: (text) => send({ type: "text-chunk", text }),
        onThinkingChunk: (text) => send({ type: "thinking-chunk", text }),
        onToolCall: (name, params) => send({ type: "tool-call", name, params }),
        onToolResult: (name, ok, output) => send({ type: "tool-result", name, ok, output }),
        onStepStart: (step, max) => send({ type: "step-start", step, max }),
        onContextTrimmed: (removed) => send({ type: "context-trimmed", removed }),
        onError: (error) => send({ type: "error", message: (error as Error).message ?? String(error) }),
        onComplete: (response) => send({ type: "complete", response }),
        onModelLoadProgress: (pct) => send({ type: "load-progress", pct }),
        onModelLoadComplete: () => send({ type: "load-complete" })
    };
}

export function registerIpc(getSender: () => WebContents | null): AjanService {
    const send = (event: ServiceEvent): void => {
        const wc = getSender();
        if (wc && !wc.isDestroyed()) wc.send("ajan:event", event.type, event);
    };
    const service = new AjanService(buildEvents(send));

    const withBusy = async <T>(fn: () => Promise<T>): Promise<T> => {
        send({ type: "busy", active: true });
        try {
            return await fn();
        } finally {
            send({ type: "busy", active: false });
        }
    };

    ipcMain.handle("ajan:invoke", async (_event, req: ServiceRequest): Promise<unknown> => {
        switch (req.method) {
            case "sendMessage":
                return await withBusy(() => service.sendMessage(req.text, req.modelId));
            case "abort":
                service.abort();
                return { ok: true };
            case "newSession":
                await service.reset();
                return { ok: true };
            case "getState":
                return await getState(service, send);
            case "setConfig":
                await service.setConfig(req.patch);
                return { ok: true };
            case "installModel":
                return await withBusy(() => service.installModel(req.id));
            case "removeModel":
                return await withBusy(() => service.removeModel(req.id));
            case "useModel":
                return await withBusy(() => service.useModel(req.id));
            case "refreshModels":
                return await service.refreshModels();
            case "detectGpu":
                return await service.detectGpu();
            case "listSessions":
                return await service.listSessions();
            case "loadSession":
                return await service.loadSession(req.id);
            case "saveSession":
                await service.saveSession(req.session as Parameters<(typeof service)["saveSession"]>[0]);
                return { ok: true };
            case "pmStatus":
                return await pmStatus();
            case "pmCatalog":
                return await pmCatalog();
            case "pmInstallPackage":
                return await withBusy(() => pmInstallPackage(req.id));
            case "pmInstallCore":
                return await withBusy(() => pmInstallCore());
            case "pmInstallVscode":
                return await withBusy(() => pmInstallVscode());
            case "pmUpdates":
                return await pmUpdates();
            case "pmEcosystem":
                return await pmEcosystem();
            case "openUrl":
                if (typeof req.url === "string" && /^https?:\/\//.test(req.url)) void shell.openExternal(req.url);
                return { ok: true };
            case "winMinimize": {
                BrowserWindow.fromWebContents(_event.sender)?.minimize();
                return { ok: true };
            }
            case "winToggleMaximize": {
                const bw = BrowserWindow.fromWebContents(_event.sender);
                if (bw) {
                    if (bw.isMaximized()) bw.unmaximize();
                    else bw.maximize();
                }
                return { ok: true };
            }
            case "winClose": {
                BrowserWindow.fromWebContents(_event.sender)?.close();
                return { ok: true };
            }
            default:
                return { ok: false, error: `Bilinmeyen istek: ${String((req as { method?: string }).method)}` };
        }
    });

    return service;
}

async function getState(service: AjanService, send: (event: ServiceEvent) => void): Promise<Record<string, unknown>> {
    const pm: PmStatus = await pmStatus();
    return {
        config: service.getConfig(),
        models: service.listModels(),
        modelInfo: service.getModelInfo(),
        sessions: (await service.listSessions()).map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt })),
        gpu: await service.detectGpu().catch(() => []),
        cwd: process.cwd(),
        status: { active: service.isActive, context: service.getContextStats() },
        pm
    };
}