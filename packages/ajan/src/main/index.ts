import { app, BrowserWindow } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpc } from "./ipc.js";
import type { AjanService } from "@takimcizgisi/core";

const __dirname = dirname(fileURLToPath(import.meta.url));

let win: BrowserWindow | null = null;
let service: AjanService | null = null;

function createWindow(): void {
    win = new BrowserWindow({
        width: 1150,
        height: 780,
        minWidth: 760,
        minHeight: 560,
        title: "AJAN AI",
        backgroundColor: "#202020",
        autoHideMenuBar: true,
        frame: false,
        icon: undefined,
        webPreferences: {
            preload: join(__dirname, "preload.mjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    void win.loadFile(join(__dirname, "..", "..", "src", "renderer", "index.html"));
    win.on("closed", () => {
        win = null;
        service = null;
    });
}

app.whenReady().then(() => {
    service = registerIpc(() => win?.webContents ?? null);
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
    await service?.dispose().catch(() => undefined);
});