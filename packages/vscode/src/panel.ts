import * as vscode from "vscode";
import { AjanBackend } from "./ajanService.js";
import { AjanBackendBridge, type IncomingMessage } from "./backend.js";

const MEDIA_DIR = "media";

export class AjanViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = "ajanView";

    private view?: vscode.WebviewView;
    private backend?: AjanBackend;
    private bridge?: AjanBackendBridge;
    private readonly disposables: vscode.Disposable[] = [];

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly getBackend: () => AjanBackend | undefined
    ) {}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, MEDIA_DIR)]
        };
        webviewView.webview.html = this.getHtml(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
            (raw) => {
                const backend = this.getBackend();
                if (!backend) return;
                if (!this.bridge) this.bridge = new AjanBackendBridge(backend, (m) => webviewView.webview.postMessage(m));
                const msg = raw as IncomingMessage;
                // WebView hazır olduğunda ilk state'i yükle (models, sessions, status, context tek mesajda)
                if ((msg as { type?: string }).type === "ready") {
                    void this.bridge.handle({ type: "get-state" }).catch(() => undefined);
                    return;
                }
                // Test alanını açma isteği doğrudan VSCode komutuna gider
                if ((msg as { type?: string }).type === "open-playground") {
                    void vscode.commands.executeCommand("ajan.openPlayground");
                    return;
                }
                void this.bridge.handle(msg).catch((err) => {
                    void webviewView.webview.postMessage({ type: "error", message: String(err?.message ?? err) });
                });
            },
            undefined,
            this.disposables
        );
    }

    getUri(webview: vscode.Webview, ...pathSegments: string[]): vscode.Uri {
        return webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, ...pathSegments));
    }

    private getHtml(webview: vscode.Webview): string {
        const cssUri = this.getUri(webview, MEDIA_DIR, "style.css");
        const jsUri = this.getUri(webview, MEDIA_DIR, "chat.js");
        const logoUri = this.getUri(webview, MEDIA_DIR, "assets", "ajan.png");
        const brandUri = this.getUri(webview, MEDIA_DIR, "assets", "AJAN_LOGO.svg");

        return `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src ${webview.cspSource};">
    <title>AJAN AI</title>
    <link rel="stylesheet" href="${cssUri}">
</head>
<body>
    <div id="app">
        <header class="brand-header">
            <button class="icon-btn" id="btn-toggle-ss" title="Ayarlar (Sohbet/Sistem)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <div class="brand-wrap">
                <img src="${logoUri}" class="brand-mark" alt="AJAN">
            </div>
            <button class="icon-btn" id="btn-new-chat" title="Yeni Sohbet">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="icon-btn" id="btn-playground" title="Test Alanını Aç (Açık klasör içinde .ajan)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7l8.7 5 8.7-5"/><path d="M12 22V12"/><path d="M9.5 4.8 7 6"/></svg>
            </button>
        </header>

        <div class="load-bar" id="load-bar" style="display:none">
            <div class="load-fill" id="load-fill" style="width:0%"></div>
            <span class="load-text" id="load-text"></span>
        </div>

        <main id="main">
            <section id="chat-panel" class="panel chat-panel">
                <div id="chat-logo-wrap" class="chat-logo-wrap">
                    <img src="${brandUri}" class="chat-logo" id="chat-logo" alt="AJAN">
                </div>
                <div id="chat-logs" class="chat-logs"></div>
                <form id="chat-form" class="chat-form" autocomplete="off">
                    <div class="chat-input-wrap">
                        <input type="text" id="chat-input" class="chat-input"
                            placeholder="Yapay zekaya talimat verin…" autofocus>
                    </div>
                    <div class="form-row">
                        <select id="model-select" class="model-select" title="Model">
                            <option value="">Model yükleniyor…</option>
                        </select>
                        <span class="form-spacer"></span>
                        <button type="button" class="send-btn" id="chat-send-btn" title="Gönder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>
                        </button>
                        <button type="button" class="stop-btn" id="chat-stop-btn" title="Durdur" style="display:none">
                            <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                        </button>
                    </div>
                </form>
                <div class="ui-status-bar">
                    <div class="sb-left">
                        <span class="sb-item">
                            <span class="sb-dot status-dot idle" id="ui-status-dot"></span>
                            Yerel
                        </span>
                        <span class="sb-item" id="ui-status-text">AJAN başlatılıyor…</span>
                    </div>
                    <div class="sb-right">
                        <span class="sb-item">AJAN AI</span>
                    </div>
                </div>
            </section>

            <section id="settings-panel" class="panel settings-panel" style="display:none">
                <h2 class="settings-title">Ayarlar</h2>

                <div class="settings-group">
                    <div class="group-title">Durum</div>
                    <div class="kv-row"><span>Çalışma dizini</span><span id="kv-cwd" class="kv-mono">-</span></div>
                    <div class="kv-row"><span>Mevcut model</span><span id="kv-model" class="kv-accent">-</span></div>
                    <div class="kv-row"><span>Bağlam kullanımı</span><span id="kv-context" class="kv-mono">-</span></div>
                    <div class="kv-row"><span>GPU</span><span id="kv-gpu" class="kv-mono">-</span></div>
                    <div class="kv-row"><span>Sürüm</span><span id="kv-version" class="kv-mono">-</span></div>
                </div>

                <div class="settings-group">
                    <div class="group-title">Modeller</div>
                    <div id="models-list" class="models-list">
                        <div class="empty-hint">Model listesi yükleniyor…</div>
                    </div>
                    <div class="settings-row">
                        <button class="btn btn-outline" id="btn-refresh-models">Listeyi Yenile</button>
                    </div>
                </div>

                <div class="settings-group">
                    <div class="group-title">Oturum Parametreleri</div>
                    <label class="settings-item">
                        <span>Temperature</span>
                        <input type="number" id="cfg-temperature" class="number-input" min="0" max="2" step="0.1">
                    </label>
                    <label class="settings-item">
                        <span>Maks. adım</span>
                        <input type="number" id="cfg-maxsteps" class="number-input" min="1" max="100" step="1">
                    </label>
                </div>

                <div class="settings-group">
                    <div class="group-title">Oturumlar</div>
                    <div id="sessions-list" class="sessions-list">
                        <div class="empty-hint">Oturum listesi yükleniyor…</div>
                    </div>
                </div>
            </section>
        </main>

        <div class="toast" id="toast"></div>
    </div>
    <script src="${jsUri}"></script>
</body>
</html>`;
    }

    /** Uzantı dış komutlarından (ajan.newChat, ajan.stop vs.) webview'e bildir */
    postCommand(command: string): void {
        void this.view?.webview.postMessage({ type: "command", command });
    }

    /** AJAN servis olaylarını doğrudan webview'e aktar */
    post(payload: unknown): void {
        void this.view?.webview.postMessage(payload);
    }

    dispose(): void {
        for (const d of this.disposables) d.dispose();
        this.disposables.length = 0;
    }
}