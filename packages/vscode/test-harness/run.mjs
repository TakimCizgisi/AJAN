import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const dis = () => ({ dispose() {} });
const noop = () => undefined;
const info = (m) => { console.log("[mock:info]", m); return Promise.resolve(); };
const warn = (m) => { console.log("[mock:warn]", m); return Promise.resolve(); };

const registered = [];
const fakeVscode = {
    StatusBarAlignment: { Left: 1, Right: 2 },
    commands: {
        registerCommand: (name, fn) => { console.log("[mock:register]", name); registered.push(name); return dis(); },
        executeCommand: (name) => { console.log("[mock:execute]", name); return Promise.resolve(); }
    },
    window: {
        createStatusBarItem: () => ({ show: noop, text: "", command: "", tooltip: "" }),
        registerWebviewViewProvider: () => dis(),
        showInformationMessage: info,
        showWarningMessage: warn,
        showErrorMessage: warn,
        createTerminal: () => ({ show: noop }),
        createOutputChannel: () => ({ appendLine: noop, show: noop, dispose: noop })
    },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: process.cwd() } }],
        getConfiguration: () => ({
            inspect: () => undefined,
            get: () => undefined
        }),
        fs: {
            stat: () => Promise.reject(Object.assign(new Error("ENOENT"), { code: "ENOENT" })),
            createDirectory: async () => {},
            readDirectory: async () => [],
            delete: async () => {}
        },
        onDidChangeConfiguration: () => dis(),
        onDidOpenTextDocument: () => dis(),
        onDidCloseTextDocument: () => dis()
    },
    Uri: {
        file: (p) => ({ fsPath: p, scheme: "file" }),
        joinPath: (u, ...s) => ({ fsPath: [u.fsPath, ...s].join("/") })
    },
    ThemeColor: class { constructor(id) { this.id = id; } },
    CancellationToken: { None: { isCancellationRequested: false } },
    Disposable: { from: (...d) => ({ dispose: () => d.forEach((x) => x.dispose?.()) }) },
    EventEmitter: class {
        constructor() { this.listeners = []; }
        event() { return (l) => { this.listeners.push(l); return dis(); }; }
        fire(e) { this.listeners.forEach((l) => l(e)); }
    }
};

const esmMock = [
    "export const StatusBarAlignment = { Left: 1, Right: 2 };",
    "export const commands = { registerCommand: (n,f)=>{ console.log('[mock:register]', n); global.__REG.push(n); return { dispose(){} }; }, executeCommand: (n)=>{ console.log('[mock:execute]', n); return Promise.resolve(); } };",
    "export const window = { createStatusBarItem: () => ({ show(){}, text:'', command:'', tooltip:'' }), registerWebviewViewProvider: () => ({ dispose(){} }), showInformationMessage: (m)=>{ console.log('[mock:info]', m); return Promise.resolve(); }, showWarningMessage: (m)=>{ console.log('[mock:warn]', m); return Promise.resolve(); }, showErrorMessage: (m)=>{ console.log('[mock:err]', m); return Promise.resolve(); }, createTerminal: () => ({ show(){} }), createOutputChannel: () => ({ appendLine(l){ console.log('[mock:out]', l); }, show(){}, dispose(){} }) };",
    "export const workspace = { workspaceFolders: [{ uri: { fsPath: process.cwd() } }], getConfiguration: () => ({ inspect: () => undefined, get: () => undefined }), fs: { stat: () => Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })), createDirectory: async () => {}, readDirectory: async () => [], delete: async () => {} }, onDidChangeConfiguration: () => ({ dispose(){} }), onDidOpenTextDocument: () => ({ dispose(){} }), onDidCloseTextDocument: () => ({ dispose(){} }) };",
    "export const Uri = { file: (p) => ({ fsPath: p, scheme: 'file' }), joinPath: (u, ...s) => ({ fsPath: [u.fsPath, ...s].join('/') }) };",
    "export class ThemeColor { constructor(id) { this.id = id; } }",
    "export const CancellationToken = { None: { isCancellationRequested: false } };",
    "export class Disposable { constructor() { this._d = []; } dispose() { this._d.forEach((x) => x?.dispose?.()); } static from(...d) { const x = new Disposable(); x._d = d; return x; } }",
    "export class EventEmitter { constructor() { this.listeners = []; } event() { return (l) => { this.listeners.push(l); return { dispose(){} }; }; } fire(e) { this.listeners.forEach((l) => l(e)); } }",
    `export const registeredCommands = () => global.__REG;`
].join("\n");

mkdirSync(join(here, "..", "node_modules", "vscode"), { recursive: true });
writeFileSync(join(here, "..", "node_modules", "vscode", "package.json"), JSON.stringify({ name: "vscode", main: "index.mjs", type: "module", version: "1.0.0" }, null, 2));
writeFileSync(join(here, "..", "node_modules", "vscode", "index.mjs"), esmMock);

global.__REG = [];
global.__fakeVscode = fakeVscode;

process.chdir("D:/PROJELER/AJAN/packages/vscode");

const { activate, deactivate } = await import(pathToFileURL(join(here, "..", "out", "extension.js")).href + "?t=" + Date.now());

const context = {
    subscriptions: [],
    globalState: { get: () => undefined, update: async () => {}, keys: () => [] },
    workspaceState: { get: () => undefined, update: async () => {} },
    extensionUri: { fsPath: "D:/PROJELER/AJAN/packages/vscode" },
    extensionPath: "D:/PROJELER/AJAN/packages/vscode",
    asAbsolutePath: (p) => "D:/PROJELER/AJAN/packages/vscode/" + p
};

try {
    await activate(context);
    console.log("ACTIVATION OK; registered:", JSON.stringify(global.__REG));
    if (!global.__REG.includes("ajan.openSettings")) {
        console.error("MISSING ajan.openSettings in registrations!");
        process.exitCode = 1;
    }
} catch (e) {
    console.error("ACTIVATION FAILED:", e.message);
    if (e.stack) console.error(e.stack.split("\n").slice(0, 12).join("\n"));
    process.exitCode = 1;
} finally {
    await deactivate?.().catch(() => {});
    process.exit(0);
}