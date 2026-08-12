/**
 * ============================================================
 * 
 *   AJAN
 *   Copyright (C) 2026 TakımÇizgisi
 *   Tüm hakları saklıdır.
 * 
 * ============================================================
 * 
 *   BU KODU YAZANLAR:
 * 
 *   ┌──────┬──────────────────────┬─────────────────────────┐
 *   │ No   │ Yazar Adı            │ Görev/Rol               │
 *   ├──────┼──────────────────────┼─────────────────────────┤
 *   │  1   │ İbrahim Anadol       │ Direkt Tüm Sistem       │
 *   │      │ (@ibrahimanadol)     │ (Ana Fikir Sahibi)      │
 *   │      │ GitHub'da            │                         │
 *   └──────┴──────────────────────┴─────────────────────────┘
 * 
 *   Son Güncelleme: 11.08.2026
 *   Versiyon: 1.0.0
 * 
 * ============================================================
 */
#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { AjanAgent } from "../core/agent.js";
import { LlamaEngine } from "../engine/llama.js";
import { downloadModel } from "../engine/modelManager.js";
import {
    loadConfig,
    saveConfig,
    getModelsRegistry,
    getModelById,
    refreshRemoteModels,
    listInstalledModels,
    removeModelFile,
    resolveModelFilePath,
    ensureConfigDir
} from "../config/configManager.js";
import { setLogLevel } from "../utils/paths.js";
import { logger } from "../utils/paths.js";
import { Spinner } from "../utils/spinner.js";
import { ChatTui } from "./tui.js";
import type { AjanConfig } from "../config/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const VERSION = (() => {
    try {
        const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8")) as { version?: string };
        return pkg.version ?? "0.0.0";
    } catch {
        return "0.0.0";
    }
})();

function createLoadProgressLogger(): { onProgress: (pct: number) => void; stop: () => void } {
    const started = Date.now();
    let finished = false;
    let lastShownPct = -1;
    const show = (msg: string): void => {
        const elapsed = Math.round((Date.now() - started) / 1000);
        console.log(`  [yükleme] ${msg} (${elapsed}sn)`);
    };
    const ticker = setInterval(() => {
        if (finished) {
            clearInterval(ticker);
            return;
        }
        show("model yükleniyor...");
    }, 5000);
    const stop = (): void => {
        finished = true;
        clearInterval(ticker);
    };
    const onProgress = (pct: number): void => {
        const rounded = Math.round(pct);
        if (rounded >= 100) {
            stop();
            show("tamamlandı");
        } else if (rounded !== lastShownPct && rounded % 10 === 0) {
            lastShownPct = rounded;
            show(`%${rounded}`);
        }
    };
    return { onProgress, stop };
}

function printHelp(): void {
    console.log(`AJAN AI v${VERSION} — Otonom Yerel CLI Kodlama Ajanı

Kullanım:
  ajan run "<görev>"            Tek seferlik görev çalıştır
  ajan chat                     İnteraktif sohbet (TAB ile mod değiştir: Chat/Plan/Build/Devamlılık)
  ajan init                     Yapılandırmayı hazırla (~/.ajan/config.json)
  ajan model list               Kullanılabilir modelleri listele
  ajan model install [id]       Modeli indir (varsayılan: ayarlı model)
  ajan model remove <id>        İndirilen model dosyasını sil
  ajan model update             Uzak model listesini güncelle
  ajan doctor                   Sistem kontrolü (GPU, model, config)
  ajan --version                Sürümü göster
  ajan --help                   Bu yardımı göster`);
}

type ChatMode = {
    label: string;
    hint: string;
    systemPrompt: (base: string) => string;
};

const CHAT_MODES: ChatMode[] = [
    {
        label: "Chat",
        hint: "serbest sohbet",
        systemPrompt: (base) => base
    },
    {
        label: "Plan",
        hint: "kodu değiştirme, sadece analiz et ve plan sun",
        systemPrompt: (base) =>
            `${base}\n\nŞU AN PLAN MODUNDASIN. Görev verildiğinde dosyaları ve terminali OKUYARAK analiz et. ` +
            `Hiçbir dosyayı YAZMA/DEĞİŞTİRME ve durumu değiştiren komut ÇALIŞTIRMA. ` +
            `Kullanıcıya net, adım adım ve uygulanabilir bir plan sun.`
    },
    {
        label: "Build",
        hint: "kodu yaz, derle, test et, hataları düzelt",
        systemPrompt: (base) =>
            `${base}\n\nŞU AN BUILD MODUNDASIN. Görevi tamamlamak için dosyaları gerçekten DÜZENLE (dosya yazma aracını kullan), ` +
            `ardından derleme/test komutlarını çalıştır. Hata varsa düzelt ve tekrar dene; derleme ve testler geçene kadar devam et.`
    },
    {
        label: "Devamlılık",
        hint: "sorunları bul, düzelt, doğrulayana kadar devam et",
        systemPrompt: (base) =>
            `${base}\n\nŞU AN DEVAMLILIK (OTONOM) MODUNDASIN. Görev verildiğinde ilgili tüm dosyaları tara, sorunları bul, ` +
            `düzelt ve derleme/test çalıştır. Her adımda yeni sorun çıkarsa onu da düzelt. ` +
            `Hedef tamamlanıp doğrulama geçene kadar kendi kendine devam et, kullanıcıya sorma. Sonunda yapılanları özetle.`
    }
];

async function cmdInit(): Promise<void> {
    ensureConfigDir();
    const config = loadConfig(true);
    saveConfig(config);
    const model = getModelById(config.modelId);
    console.log(`Yapılandırma hazır: ${join(process.env.AJAN_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? ".", ".ajan"), "config.json")}`);
    console.log(`Varsayılan model: ${model?.name ?? config.modelId}`);
    console.log("Şimdi 'ajan model install' ile modeli indirebilirsiniz.");
}

async function cmdModelList(): Promise<void> {
    const installed = listInstalledModels();
    console.log("Kullanılabilir modeller:\n");
    for (const entry of installed) {
        const marker = entry.installed ? "[kurulu]" : "[indirilmedi]";
        console.log(`  ${entry.model.id.padEnd(28)} ${marker}  ${entry.model.name}`);
        if (entry.model.description) console.log(`    ${entry.model.description}`);
        console.log(`    dosya: ${entry.path}`);
        console.log("");
    }
}

async function cmdModelInstall(id?: string): Promise<void> {
    const config = loadConfig();
    const modelId = id ?? config.modelId;
    const model = getModelById(modelId);
    if (!model) {
        logger.error(`Model bulunamadı: ${modelId}`);
        process.exitCode = 1;
        return;
    }
    console.log(`Model indiriliyor: ${model.name} (${model.uri})`);
    try {
        const path = await downloadModel(model, { showProgress: true });
        console.log(`\nModel hazır: ${path}`);
    } catch (err) {
        logger.error(`İndirme başarısız: ${(err as Error).message}`);
        process.exitCode = 1;
    }
}

async function cmdModelRemove(id: string): Promise<void> {
    const model = getModelById(id);
    if (!model) {
        logger.error(`Model bulunamadı: ${id}`);
        process.exitCode = 1;
        return;
    }
    if (removeModelFile(model)) {
        console.log(`Model silindi: ${resolveModelFilePath(model)}`);
    } else {
        console.log(`Silinecek dosya bulunamadı (zaten silinmiş olabilir).`);
    }
}

async function cmdModelUpdate(): Promise<void> {
    const config = loadConfig();
    const models = await refreshRemoteModels(config.remoteModelsUrl);
    if (models.length === 0) {
        console.log("Uzak model listesi alınamadı (mevcut liste kullanılıyor).");
    } else {
        console.log(`Model listesi güncellendi: ${models.length} model uzak kaynaktan yüklendi.`);
    }
}

async function cmdDoctor(): Promise<void> {
    const config = loadConfig();
    console.log("AJAN AI — Sistem Kontrolü\n");

    const model = getModelById(config.modelId);
    console.log(`Model      : ${model?.name ?? config.modelId}`);
    if (model) {
        const { isModelInstalled } = await import("../config/configManager.js");
        console.log(`  durum    : ${isModelInstalled(model) ? "kurulu" : "indirilmedi ('ajan model install')"}`);
        console.log(`  dosya    : ${resolveModelFilePath(model)}`);
    }

    const configPath = join(process.env.AJAN_HOME ?? join(process.env.USERPROFILE ?? ".", ".ajan"), "config.json");
    console.log(`Config     : ${configPath}`);

    console.log(`GPU        : kontrol ediliyor...`);
    try {
        const gpus = await LlamaEngine.detectSupportedGpus();
        if (gpus.length > 0) {
            console.log(`  destek   : ${gpus.join(", ")}`);
        } else {
            console.log(`  destek   : yok (CPU modunda çalışacak)`);
        }
    } catch (err) {
        console.log(`  hata     : ${(err as Error).message}`);
    }

    console.log(`CWD        : ${config.cwd ?? process.cwd()}`);
    console.log(`Context    : ${config.contextSize ?? "auto"}`);
    console.log(`GPU Layers : ${config.gpuLayers ?? "auto"}`);
}

async function cmdRun(prompt: string): Promise<void> {
    const config = loadConfig();
    const model = getModelById(config.modelId);
    if (!model) {
        logger.error(`Model bulunamadı: ${config.modelId}`);
        return;
    }
    const { isModelInstalled } = await import("../config/configManager.js");
    if (!isModelInstalled(model)) {
        console.log(`Model indirilmemiş. 'ajan model install ${model.id}' ile indirin.`);
        return;
    }

    const loadProgress = createLoadProgressLogger();
    let spinner: Spinner | null = null;
    let loaded = false;
    let toolStart = 0;
    const clearSpinner = (): void => {
        spinner?.finish();
        spinner = null;
    };
    const startThinking = (): void => {
        if (!spinner) spinner = new Spinner("[Düşünüyorum]");
    };

    const agent = new AjanAgent({
        config,
        events: {
            onToolCall: (name) => {
                clearSpinner();
                toolStart = Date.now();
                spinner = new Spinner(`[${name}]`);
            },
            onToolResult: (name, ok) => {
                const elapsed = Math.round((Date.now() - toolStart) / 1000);
                spinner?.finish(`[${name}] ${elapsed}sn ${ok ? "bitirdi" : "hata"}`);
                spinner = null;
                startThinking();
            },
            onTextChunk: (text) => {
                if (!text) return;
                clearSpinner();
                process.stdout.write(text);
            }
        },
        onLoadProgress: loadProgress.onProgress,
        onLoadComplete: () => {
            loadProgress.stop();
            loaded = true;
            startThinking();
        }
    });

    try {
        if (loaded) startThinking();
        await agent.prompt(prompt);
        clearSpinner();
        console.log("");
    } catch (err) {
        clearSpinner();
        loadProgress.stop();
        logger.error(`Görev başarısız: ${(err as Error).message}`);
        process.exitCode = 1;
    } finally {
        await agent.dispose();
    }
}

async function cmdChat(): Promise<void> {
    const config = loadConfig();
    const model = getModelById(config.modelId);
    if (!model) {
        logger.error(`Model bulunamadı: ${config.modelId}`);
        return;
    }
    const { isModelInstalled } = await import("../config/configManager.js");
    if (!isModelInstalled(model)) {
        console.log(`Model indirilmemiş. 'ajan model install ${model.id}' ile indirin.`);
        return;
    }

    if (process.stdin.isTTY && process.stdout.isTTY) {
        await runChatTui(config);
    } else {
        await runChatSimple(config);
    }
}

async function runChatTui(config: AjanConfig): Promise<void> {
    let currentAbort: AbortController | null = null;
    let modeIndex = 0;

    const basePrompt = config.systemPrompt ?? "";

    const tui = new ChatTui({
        onInput: (line) => void handleLine(line),
        onAbort: () => currentAbort?.abort(),
        onExit: () => void exitChat(),
        onCommand: (cmd, arg) => handleCommand(cmd, arg),
        onModeCycle: () => {
            modeIndex = (modeIndex + 1) % CHAT_MODES.length;
            const mode = CHAT_MODES[modeIndex]!;
            void agent.setSystemPrompt(mode.systemPrompt(basePrompt)).then(() => {
                tui.setMode(mode.label);
                tui.addInfo(`[mod: ${mode.label}] ${mode.hint} — yeni oturum (geçmiş temizlendi).`);
            });
        }
    });

    const switchMode = (index: number): void => {
        modeIndex = (index + CHAT_MODES.length) % CHAT_MODES.length;
        const mode = CHAT_MODES[modeIndex]!;
        void agent.setSystemPrompt(mode.systemPrompt(basePrompt)).then(() => {
            tui.setMode(mode.label);
            tui.addInfo(`[mod: ${mode.label}] ${mode.hint} — yeni oturum (geçmiş temizlendi).`);
        });
    };

    const handleCommand = (cmd: string, arg: string): void => {
        switch (cmd) {
            case "mode": {
                const target = arg.toLowerCase();
                const idx = CHAT_MODES.findIndex(
                    (m) => m.label.toLowerCase() === target || m.label.toLowerCase().startsWith(target)
                );
                if (idx === -1) {
                    tui.addInfo(`Bilinmeyen mod: "${arg}". Modlar: chat, plan, build, devamlılık.`);
                    return;
                }
                switchMode(idx);
                return;
            }
            case "clear": {
                agent.resetConversation();
                tui.addInfo("[komut] konuşma geçmişi temizlendi.");
                return;
            }
            case "exit":
            case "quit": {
                void exitChat();
                return;
            }
            case "help":
                tui.addInfo("[komutlar] /mode <chat|plan|build|devamlılık> · /clear · /exit · /help");
                return;
            default:
                tui.addInfo(`Bilinmeyen komut: /${cmd}. /help ile listeye bakın.`);
        }
    };

    const agent = new AjanAgent({
        config,
        events: {
            onToolCall: (name) => tui.startTool(name),
            onToolResult: (name, ok, output) => tui.endTool(name, ok, output),
            onThinkingChunk: (text) => tui.appendThinking(text),
            onTextChunk: (text) => {
                if (!text) return;
                tui.appendAssistant(text);
            }
        },
        onLoadProgress: (pct) => tui.setLoading(pct),
        onLoadComplete: () => tui.setThinking()
    });

    const handleLine = async (line: string): Promise<void> => {
        if (!line) return;
        if (line === "exit" || line === "quit") {
            void exitChat();
            return;
        }
        tui.addUser(line);
        tui.setThinking();
        const controller = new AbortController();
        currentAbort = controller;
        try {
            await agent.prompt(line, { signal: controller.signal });
        } catch (err) {
            if (controller.signal.aborted) {
                tui.addInfo("[iptal] üretim durduruldu.");
            } else {
                tui.addInfo(`Hata: ${(err as Error).message}`);
            }
        } finally {
            if (currentAbort === controller) currentAbort = null;
            tui.endTurn();
        }
    };

    const exitChat = async (): Promise<void> => {
        currentAbort?.abort();
        tui.stop();
        await agent.dispose();
        process.exit(0);
    };

    tui.start();
}

async function runChatSimple(config: AjanConfig): Promise<void> {
    let loadProgress: ReturnType<typeof createLoadProgressLogger> | null = null;
    let loadDone = false;
    let currentAbort: AbortController | null = null;
    let spinner: Spinner | null = null;
    let toolStart = 0;
    const clearSpinner = (): void => {
        spinner?.finish();
        spinner = null;
    };
    const startThinking = (): void => {
        if (!spinner) spinner = new Spinner("[Düşünüyorum]");
    };

    const agent = new AjanAgent({
        config,
        events: {
            onToolCall: (name) => {
                clearSpinner();
                toolStart = Date.now();
                spinner = new Spinner(`[${name}]`);
            },
            onToolResult: (name, ok) => {
                const elapsed = Math.round((Date.now() - toolStart) / 1000);
                spinner?.finish(`[${name}] ${elapsed}sn ${ok ? "bitirdi" : "hata"}`);
                spinner = null;
                startThinking();
            },
            onTextChunk: (text) => {
                if (!text) return;
                clearSpinner();
                process.stdout.write(text);
            }
        },
        onLoadProgress: (pct) => loadProgress?.onProgress(pct),
        onLoadComplete: () => {
            loadDone = true;
            loadProgress?.stop();
            startThinking();
        }
    });

    console.log("AJAN AI sohbet modu (basit). Çıkmak için 'exit' veya Ctrl+C.\n");

    const exitChat = async (): Promise<void> => {
        currentAbort?.abort();
        clearSpinner();
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        await agent.dispose();
        process.exit(0);
    };

    const handleLine = async (line: string): Promise<void> => {
        const trimmed = line.trim();
        if (trimmed === "exit" || trimmed === "quit") {
            void exitChat();
            return;
        }
        if (trimmed) {
            process.stdout.write("\najan> ");
            if (!loadProgress) loadProgress = createLoadProgressLogger();
            const controller = new AbortController();
            currentAbort = controller;
            if (loadDone) startThinking();
            try {
                await agent.prompt(trimmed, { signal: controller.signal });
                clearSpinner();
                process.stdout.write("\n");
            } catch (err) {
                clearSpinner();
                loadProgress?.stop();
                if (controller.signal.aborted) {
                    process.stdout.write("\n[iptal] üretim durduruldu.\n");
                    if (!loadDone) loadProgress = null;
                } else {
                    if (!loadDone) loadProgress = null;
                    logger.error(`Hata: ${(err as Error).message}`);
                }
            } finally {
                if (currentAbort === controller) currentAbort = null;
            }
        }
        process.stdout.write("\nsiz> ");
    };

    const rl = await import("node:readline").then((m) => m.createInterface({
        input: process.stdin,
        output: process.stdout
    }));
    process.stdout.write("siz> ");
    rl.on("line", (line) => void handleLine(line));
    rl.on("close", () => void exitChat());
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const command = args[0] ?? "--help";

    if (args.includes("--debug")) setLogLevel("debug");

    switch (command) {
        case "--version":
        case "-v":
            console.log(VERSION);
            break;
        case "--help":
        case "-h":
        case "help":
            printHelp();
            break;
        case "init":
            await cmdInit();
            break;
        case "run":
            await cmdRun(args.slice(1).join(" ") || "");
            break;
        case "chat":
            await cmdChat();
            break;
        case "model":
            await handleModelCommand(args.slice(1));
            break;
        case "doctor":
            await cmdDoctor();
            break;
        default:
            printHelp();
    }
}

async function handleModelCommand(args: string[]): Promise<void> {
    const sub = args[0];
    switch (sub) {
        case "list":
            await cmdModelList();
            break;
        case "install":
            await cmdModelInstall(args[1]);
            break;
        case "remove":
            await cmdModelRemove(args[1] ?? "");
            break;
        case "update":
            await cmdModelUpdate();
            break;
        default:
            console.log("Kullanım: ajan model <list|install|remove|update>");
    }
}

main().catch((err) => {
    logger.error(`Beklenmeyen hata: ${(err as Error).stack ?? String(err)}`);
    process.exitCode = 1;
});
