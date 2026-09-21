import { contextBridge, ipcRenderer } from "electron";
import type { ServiceEvent, ServiceRequest } from "./shared/ipc.js";

contextBridge.exposeInMainWorld("ajan", {
    invoke: (req: ServiceRequest): Promise<unknown> => ipcRenderer.invoke("ajan:invoke", req),
    onEvent: (cb: (event: ServiceEvent) => void): (() => void) => {
        const listener = (_e: unknown, _type: string, event: ServiceEvent): void => cb(event);
        ipcRenderer.on("ajan:event", listener);
        return () => ipcRenderer.removeListener("ajan:event", listener);
    }
});