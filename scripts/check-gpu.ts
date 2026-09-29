/**
 * GPU doğrulama aracı.
 *
 * İki ayrı soruyu ayırır:
 *   1. Makine CUDA/Vulkan destekliyor mu?  → getLlamaGpuTypes("supported")
 *   2. Motor gerçekten GPU'da mı?          → getLlama(...) + Llama.gpu
 *
 * 1. soru "evet" iken 2. soru "hayır" olabilir: prebuilt CUDA ikilisi bu
 * sistemde kullanılamıyorsa getLlama({gpu:"cuda"}) patlar. Bu araç motorun
 * gerçekte hangi arka ucu seçtiğini gösterir.
 *
 *   npm run check:gpu
 */
import { getLlama, getLlamaGpuTypes, LlamaLogLevel } from "node-llama-cpp";
import { LlamaEngine } from "../src/engine/llama.js";
import { listInstalledModels, loadConfig } from "../src/config/configManager.js";

const CHAIN = ["cuda", "vulkan"] as const;

async function main(): Promise<void> {
    const config = loadConfig();
    const supported = await LlamaEngine.detectSupportedGpus();
    const allValid = await getLlamaGpuTypes("allValid").catch(() => []);

    console.log("\n  AJAN GPU kontrolu\n");
    console.log(`    config.gpu        : ${config.gpu}`);
    console.log(`    config.gpuLayers  : ${config.gpuLayers}`);
    console.log(`    config.modelId    : ${config.modelId}`);
    console.log(`    sürücü destekli   : ${supported.join(", ") || "yok"}`);
    console.log(`    uyumlu olabilir   : ${allValid.filter((g) => typeof g === "string").join(", ")}`);

    console.log("\n  Arka uç denemeleri (gerçek yükleme):");
    let loaded: string | null = null;
    for (const gpu of CHAIN) {
        try {
            const llama = await getLlama({ gpu, logLevel: LlamaLogLevel.error, progressLogs: false, skipDownload: true });
            const active = llama.gpu === false ? "cpu" : llama.gpu;
            const offload = llama.supportsGpuOffloading;
            console.log(`    ${gpu.padEnd(8)} -> ${active.padEnd(8)} katman aktarimi: ${offload ? "acik" : "kapali"}`);
            if (active !== "cpu") {
                loaded = active;
                await llama.dispose();
                break;
            }
            await llama.dispose();
        } catch (err) {
            const reason = (err as Error).message.split("\n")[0]?.trim().slice(0, 90) ?? "bilinmeyen hata";
            console.log(`    ${gpu.padEnd(8)} -> KULLANILAMIYOR (${reason})`);
        }
    }

    console.log();
    if (loaded) {
        console.log(`  \u001B[32mMotor bu makinede "${loaded}" uzerinden GPU kullanacak.\u001B[0m`);
    } else {
        console.log("  \u001B[33m! CUDA ve Vulkan kullanilamiyor; motor CPU'ya dusacak.\u001B[0m");
    }

    const models = listInstalledModels();
    console.log(`  Kurulu model: ${models.length === 0 ? "yok" : models.join(", ")}`);
    if (models.length === 0) {
        console.log("  (Gercek inference testi icin once model kurun: engine.installModel(id))");
    }
    console.log();
}

main().catch((err) => {
    console.error(`\n  kontrol basarisiz: ${(err as Error).message}\n`);
    process.exit(1);
});
