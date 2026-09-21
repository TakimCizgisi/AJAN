import * as vscode from "vscode";
import { join } from "node:path";
import { AjanBackend } from "./ajanService.js";
import { AjanViewProvider } from "./panel.js";

let backend: AjanBackend | undefined;
let provider: AjanViewProvider | undefined;
let statusBar: vscode.StatusBarItem;

function getActiveFolder(): string {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const wsDir = vscode.workspace.getConfiguration("ajan").get<string>("workspaceDir");
    if (folder) return folder.uri.fsPath;
    if (wsDir) return wsDir;
    return process.env.USERPROFILE ?? process.env.HOME ?? process.cwd();
}

function getWorkspaceConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("ajan");
}

/**
 * VSCode ayarlarını (ajan.*) AJAN konfigürasyonuna köprüle.
 * Yalnızca kullanıcının AÇIKÇA ayarladığı değerler alınır (global/workspace);
 * "default" değerler AJAN config.json'daki kullanıcı seçimlerinin üzerine yazılmaz.
 * Böylece webview'den yapılan seçimler (model, temperature vb.) açılışta geri alınmaz.
 */
function explicitConfigValue<T>(cfg: vscode.WorkspaceConfiguration, key: string): T | undefined {
    const info = cfg.inspect<T>(key);
    const val = info?.workspaceFolderValue ?? info?.workspaceValue ?? info?.globalValue;
    return val as T | undefined;
}

function buildConfigPatch(): Record<string, unknown> {
    const cfg = getWorkspaceConfig();
    const patch: Record<string, unknown> = {};

    const modelId = explicitConfigValue<string>(cfg, "modelId");
    if (modelId) patch.modelId = modelId;

    const gpu = explicitConfigValue<string>(cfg, "gpu");
    if (gpu) patch.gpu = gpu;

    const gpuLayersRaw = explicitConfigValue<string>(cfg, "gpuLayers");
    if (gpuLayersRaw) {
        patch.gpuLayers = gpuLayersRaw === "max" || gpuLayersRaw === "auto" ? gpuLayersRaw : Number(gpuLayersRaw);
    }

    const contextRaw = explicitConfigValue<string>(cfg, "contextSize");
    if (contextRaw) {
        patch.contextSize = contextRaw === "auto" ? "auto" : Number(contextRaw);
    }

    const session: Record<string, unknown> = {};
    const temperature = explicitConfigValue<number>(cfg, "temperature");
    if (typeof temperature === "number") session.temperature = temperature;

    const sMax = explicitConfigValue<number>(cfg, "maxTokens");
    if (typeof sMax === "number") session.maxTokens = sMax;

    if (Object.keys(session).length > 0) patch.session = session;

    const maxSteps = explicitConfigValue<number>(cfg, "maxSteps");
    if (typeof maxSteps === "number") patch.maxSteps = maxSteps;

    const toolTimeout = explicitConfigValue<number>(cfg, "toolTimeout");
    if (typeof toolTimeout === "number") patch.toolTimeout = toolTimeout;

    const maxToolOutput = explicitConfigValue<number>(cfg, "maxToolOutput");
    if (typeof maxToolOutput === "number") patch.maxToolOutput = maxToolOutput;

    const beep = explicitConfigValue<boolean>(cfg, "beepOnComplete");
    if (typeof beep === "boolean") patch.beepOnComplete = beep;

    return patch;
}

function ensureBackend(): AjanBackend | undefined {
    if (backend) return backend;

    backend = new AjanBackend(
        {
            onTextChunk: (text) => void provider?.post({ type: "agent:text-chunk", text }),
            onThinkingChunk: (text) => void provider?.post({ type: "agent:thinking-chunk", text }),
            onToolCall: (name, params) => void provider?.post({ type: "agent:tool-call", name, params }),
            onToolResult: (name, ok, output) => void provider?.post({ type: "agent:tool-result", name, ok, output }),
            onStepStart: (step, max) => void provider?.post({ type: "agent:step-start", step, max }),
            onStepEnd: () => undefined,
            onContextTrimmed: (removed) => void provider?.post({ type: "agent:context-trimmed", removed }),
            onError: (error) => void provider?.post({ type: "agent:error", message: error.message }),
            onComplete: (response) => void provider?.post({ type: "agent:complete", response }),
            onModelLoadProgress: (pct) => void provider?.post({ type: "agent:load-progress", pct }),
            onModelLoadComplete: () => void provider?.post({ type: "agent:load-complete" })
        },
        getActiveFolder()
    );

    // VSCode ayarlarını AJAN config'ine uygula
    const patch = buildConfigPatch();
    if (Object.keys(patch).length > 0) {
        void backend.service.setConfig(patch).catch(() => undefined);
    }

    return backend;
}

function updateStatusBar(): void {
    if (!statusBar) return;
    const running = backend?.isActive ?? false;
    statusBar.text = running ? "$(loading~spin) AJAN" : "$(comment-discussion) AJAN";
    statusBar.tooltip = running ? "AJAN çalışıyor — durdurmak için AJAN: Üretimi Durdur" : "AJAN";
    statusBar.backgroundColor = running ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
    statusBar.show();
}

/**
 * Açık klasörün içindeki ".ajan" TEST klasörünü oluşturur/açar.
 * İçinde dosya varsa kullanıcı onayıyla bomboş hale getirir; Explorer'da gösterir ve terminal açar.
 * Tüm işlemler VSCode API'si (workspace.fs) ile yapılır.
 */
async function openPlayground(): Promise<void> {
    const root = getActiveFolder();
    const playground = join(root, ".ajan");
    const uri = vscode.Uri.file(playground);

    try {
        await vscode.workspace.fs.stat(uri);
    } catch {
        await vscode.workspace.fs.createDirectory(uri);
    }

    const entries = await vscode.workspace.fs.readDirectory(uri);
    if (entries.length > 0) {
        const answer = await vscode.window.showWarningMessage(
            `".ajan" test klasörü boş değil (${entries.length} öğe). Bomboş bir kum havuzu açmak için sıfırlamak ister misin?`,
            { modal: true },
            "Sıfırla ve Boş Aç",
            "Olduğu Gibi Aç"
        );
        if (answer === "Sıfırla ve Boş Aç") {
            let removed = 0;
            for (const [name] of entries) {
                try {
                    await vscode.workspace.fs.delete(vscode.Uri.joinPath(uri, name), { recursive: true, useTrash: false });
                    removed++;
                } catch {
                    /* silinemeyen öğe: atla */
                }
            }
            void vscode.window.showInformationMessage(`".ajan" test klasörü sıfırlandı (${removed} öğe silindi).`);
        }
    }

    void vscode.commands.executeCommand("revealInExplorer", uri);
    const terminal = vscode.window.createTerminal({ name: "AJAN Test Alanı (.ajan)", cwd: playground });
    terminal.show();

    provider?.post({ type: "playground-opened", path: playground });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
    statusBar.command = "ajan.chat";
    context.subscriptions.push(statusBar);
    updateStatusBar();

    provider = new AjanViewProvider(context, () => ensureBackend());
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(AjanViewProvider.viewType, provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand("ajan.chat", () => {
            void vscode.commands.executeCommand("ajanView.focus");
            updateStatusBar();
        }),
        vscode.commands.registerCommand("ajan.newChat", () => {
            void ensureBackend()?.newSession();
            provider?.postCommand("new-chat");
        }),
        vscode.commands.registerCommand("ajan.stop", () => {
            ensureBackend()?.abort();
            provider?.postCommand("stop");
            updateStatusBar();
        }),
        vscode.commands.registerCommand("ajan.refreshModels", async () => {
            const b = ensureBackend();
            if (!b) return;
            const result = await b.refreshModels();
            void vscode.window.showInformationMessage(result.ok ? `Model listesi güncellendi (${result.count ?? 0} model)` : `Hata: ${result.error ?? "Bilinmeyen"}`);
            provider?.postCommand("refresh-models");
            updateStatusBar();
        }),
        vscode.commands.registerCommand("ajan.openSettings", () => {
            void vscode.commands.executeCommand("workbench.action.openSettings", "@ext:takimcizgisi.ajan");
            updateStatusBar();
        }),
        vscode.commands.registerCommand("ajan.openPlayground", () => {
            void openPlayground();
        })
    );

    // Ayarlar değişince AJAN config'ini senkronize et
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (!e.affectsConfiguration("ajan")) return;
            if (!backend) return;
            const patch = buildConfigPatch();
            if (Object.keys(patch).length > 0) {
                void backend.service.setConfig(patch).catch(() => undefined);
            }
            provider?.postCommand("config-changed");
        })
    );

    // Periyodik durum çubuğu güncellemesi
    const statusTimer = setInterval(updateStatusBar, 2000);
    context.subscriptions.push(new vscode.Disposable(() => clearInterval(statusTimer)));

    void vscode.commands.executeCommand("ajanView.focus");
}

export async function deactivate(): Promise<void> {
    await backend?.dispose();
    backend = undefined;
    provider?.dispose();
    provider = undefined;
}