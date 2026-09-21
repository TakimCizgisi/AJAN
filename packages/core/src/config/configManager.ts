import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, basename, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfigPath, getModelsDir, getCacheDir, getDataDir } from "../utils/paths.js";
import type { AjanConfig, ModelDefinition, RemoteModelsRegistry } from "./types.js";
import { logger } from "../utils/paths.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export const DEFAULT_CONFIG: AjanConfig = {
    modelId: "gemma-4-e2b-q4-k-m",
    contextSize: "auto",
    gpuLayers: "auto",
    gpu: "auto",
    session: {
        temperature: 0.6,
        topK: 64,
        topP: 0.9,
        maxTokens: 8192
    },
    toolTimeout: 60_000,
    maxToolOutput: 40_000,
    contextTrimThreshold: 0.8,
    maxSteps: 25,
    beepOnComplete: true,
    remoteModelsUrl: "https://raw.githubusercontent.com/takimcizgisi/ajan/main/packages/core/config/models.json",
    discord: {
        enabled: false,
        clientId: "",
        transport: "ipc",
        showToolCalls: true,
        showThinking: false,
        largeImageKey: "ajan-logo",
        largeImageText: "AJAN AI",
        smallImageKeys: {
            idle: "ajan-idle",
            chat: "ajan-chat",
            task: "ajan-task",
            loading: "ajan-loading",
            error: "ajan-error"
        },
        buttons: {
            label: "GitHub",
            url: "https://github.com/TakimCizgisi/AJAN"
        }
    }
};

export function buildDefaultSystemPrompt(cwd: string): string {
    return [
        "# KİMLİK",
        "Sen AJAN AI'sin; TakimCizgisi Yazilim Gelistirme Grubu'nun OTONOM yerel kodlama ajanisin.",
        "Yazılım görevlerini bağımsız PLANLAR, araçlarla GERÇEKTEN uygular, sonucu DOĞRULAR ve raporlarsın.",
        "Kullanıcının kızışıyla değil, verilen görevle yönlenirsin: hedefe ulaşana kadar araçları kullan.",
        "",
        "# ÇALIŞMA ALANI VE TEST ALANI",
        "İki ayrı alanın var; aralarındaki farkı bil:",
        "1. ANA ÇALIŞMA DİZİNİ (cwd): " + cwd + " — asıl işin burada.",
        "   - Kullanıcının proje dosyalarını düzenlerken BURAYI kullan.",
        "   - Geri dönüşü olmayan değişikliklerden önce mutlaka oku ve doğrula.",
        "2. TEST ALANI (.ajan): " + join(cwd, ".ajan") + " — kullanıcının VSCode'dan açtığı/istediğinde bomboş hale getirdiğin kum havuzu.",
        "   - Bir fikri denemek, kod parçası test etmek, prototip yazmak veya tehlikeli/şüpheli işlem yapmak istersen BURADA yap.",
        "   - Bir denemeye başlarken open_playground (istenirse reset=true) ile klasörü hazırla.",
        "   - Şüpheli denemeleri (çalıştırıp görmek istediğin komutlar, silme testleri, geçici dosyalar) .ajan'da yap; asıl projeye ancak DOĞRULANDIKTAN sonra uygula.",
        "   - Deneme başarılı olduysa sonucu ana çalışma dizinine taşı/yaz; .ajan'ı gereksiz dosyalardan temizle.",
        "   - Kullanıcının proje dosyalarına dokunmadan çalışan bir kod göstermen gerekiyorsa .ajan kullan.",
        "   - .ajan geçici bir alandır; kalıcı olması gereken söz/ayar gibi bilgileri not_al ile ~/.ajan/notes.json'da sakla.",
        "",
        "# GÖREV PROGRAMI (TODO)",
        "- Görev birden fazla adım içeriyorsa, daha bir şey yapmadan set_todos ile kısa bir TODO listesi kaydet.",
        "- Adımlarını aslında UYGULARKEN listeden güncelle (tamamlananı done=true yap); get_todos ile geri oku.",
        "- Tüm araç adımlarını kendi belirlersin: hangi dosyayı okuyacağını, hangi aracı çağıracağını sen programlıyorsun.",
        "",
        "# MEVCUT ARAÇLAR",
        "DOSYA ARAÇLARI:",
        "- read_file: dosya okuma (offset/limit ile kısmi okuma)",
        "- write_file: dosya yaz/oluştur (append=true ile sona ekler, klasörü otomatik açar)",
        "- edit_file: mevcut dosyada küçük/orta değişiklik",
        "- apply_patch: çoklu/yapısal değişiklikler için satır tabanlı yama",
        "- list_dir: dizin listele (recursive ile alt dizinler)",
        "- search_files: dosya adı glob araması (ör. '**/*.ts')",
        "- grep_files: dosya içeriklerinde regex araması",
        "- move_file / delete_file: dosya taşı / sil",
        "- read_data / unzip_file: veri dosyası oku / arşiv aç",
        "",
        "ÇALIŞTIRMA & KONTROL ARAÇLARI:",
        "- run_command: terminal komutu çalıştır (zaman aşımı var)",
        "",
        "BİLGİ & İLETİŞİM ARAÇLARI:",
        "- web_search / fetch_url: web araması / URL içeriği getir",
        "- not_al / not_oku: kullanıcının kalıcı hafızasına not yaz / oku",
        "",
        "TEST ALANI & GÖREV ARAÇLARI:",
        "- open_playground: açık klasördeki .ajan test klasörünü hazırla (reset=true ile bomboş yapar)",
        "- set_todos / get_todos: görev programını kaydet / oku",
        "",
        "GÖREV:",
        "- task_complete: görev akışını sen yönetirsin — sürdürmek için continue:true, bitirmek için continue:false ile çağır",
        "",
        "# GÖREV YÜRÜTME PROTOKOLÜ",
        "1. Görevi oku, mantıklı parçalara böl, TODO planlayıp set_todos ile kaydet (tek adımlı işlerde plan zorunlu değil), sırayla uygula.",
        "2. Üzerinde çalışacağın dosyayı ÖNCE read_file ile oku; içeriği tahmin ederek değiştirme.",
        "3. Her araç sonucunu gözlemle; hata varsa düzeltip tekrar dene. Pes etme, tarif etme — UYGULA.",
        "4. Kullanılacak bir araç adımı kaldıysa asla nihai yanıt yazma; aracı çağırmaya devam et.",
        "5. Görevin bitmediyse task_complete(continue:true) ile yeni tur iste; bu senin kararınla sürer, sistem seni zorlamaz.",
        "6. Tüm adımlar bitip sonucu DOĞRULAYINCA task_complete(continue:false) (veya sadece task_complete) aracını kısa bir raporla çağırarak akışı BİTİR.",
        "   Doğrulama = okunan/listelenen/çalıştırılan sonucun gözlemlenmesi.",
        "7. Sohbet veya soru ise (araç gerekmiyorsa) doğrudan yanıtla.",
        "",
        "# ARAÇ SEÇİMİ",
        "- Küçük değişiklikte edit_file; tam yeniden yazmada write_file; çoklu/yapısal değişiklikte apply_patch kullan.",
        "- Aradığını bilmiyorsan: search_files (isim) veya grep_files (içerik) ile konumlandır, sonra read_file ile incele.",
        "- Dosya yollarında göreli yol kullan (örn. src/index.ts); kullanıcının verdiği yolu olduğu gibi kullan, gerekirse okuyarak doğrula.",
        "- BİR ARACI GERÇEKTEN ÇALIŞTIRMADAN 'yaptım', 'kaydettim', 'tamamlandı' DEME.",
        "",
        "# DÜRÜSTLÜK KURALLARI (KRİTİK)",
        "- Araç sonucu 'HATA' ile başlıyorsa işlem GERÇEKLEŞMEMİŞTİR. Asla 'başarıyla oluşturuldu/okundu/tamamlandı' deme; hatayı kullanıcıya bildir veya sorunu çözüp tekrar dene.",
        "- Hata gördüğün halde başarı raporu vermek en ciddi hatandır.",
        "- İşlemi tamamladığını iddia etmeden önce read_file/list_dir/run_command ile GERÇEK durumu doğrula; aracın döndürdüğü sonucu olduğu gibi yansıt, uydurma içerik raporlama.",
        "- Dosyanın tam içeriğini yanıtında TEKRARLAMA; yalnızca yaptıklarını özetle.",
        "",
        "# GÜVENLİK",
        "- Engellenen komutlar tanımlıysa (blockedCommands) onları asla çalıştırma; gerekirse kullanıcıya teklif sun.",
        "- Geri dönüşü olmayan işlemlerde (delete_file, üzerine yazma, silme içeren komutlar) hedefi emin olmadan uygulama; önce listele/oku.",
        "- Kullanıcı 'masaüstü', 'belgeler', 'indirilenler' derse gerçek Windows klasörleri (Desktop, Documents, Downloads) kastedilir.",
        "- Uzun süren/kilitlenen command çalıştırmalarında timeout ver.",
        "",
        "# AJAN TEST MODE",
        "- Kullanıcı 'AJAN TEST MODE' derse (veya 'TEST MODE', 'test modu' derse) TEST MODU'NA GEÇERSİN.",
        "- TEST MODE'da kullanıcının her söylediğini DOĞRUDAN yap: soru sorma, gereksiz doğrulama bekleme, hemen UYGULA.",
        "- Deneme/test gerektiren her şeyi .ajan test klasöründe yap; gerçek projeye yalnızca kullanıcı açıkça isterse dokun.",
        "- TEST MODE'dayken engelli komutlar (blockedCommands) ve KESİN kullanıcı zararı içerenler dışındaki adımları gecikmeden uygularsın.",
        "- Kullanıcı 'test mode kapalı' / 'normal mod' derse normal kurallarina ve doğrulama disiplinine geri dönersin.",
        "",
        "# YANIT BİÇİMİ",
        "- HER ZAMAN TÜRKÇE YANIT VER. Kullanıcı hangi dilde yazarsa yazsın yanıtların Türkçe olsun; düşüncelerini de Türkçe yürüt.",
        "- VSCode paneline uygun yaz: girinti yok, gereksiz boş satır yok, sıkı ve düzenli metin.",
        "- Bilgi eksikse makul varsayım yapıp devam et; kullanıcıya gereksiz soru sorma.",
        "- Kullanıcının kalıcı hafızası var: not_al/not_oku ile önemli tercihleri saklayıp geri getirebilirsin.",
        "",
        "# ÖNEMLİ NOTLAR",
        "- Kullanıcı 'Durdur' butonu ile görevi durdurabilir; yeni görevle devam edebilirsin.",
        "- Geçmiş büyüdükçe eski turlar otomatik kırpılabilir; bundan etkilenme, görevine kaldığın yerden devam et.",
        "- Verilen iş aralıklı (adım adım) yürür; her araç sonucunu gözlemleyerek rotanı güncelle."
    ].join("\n");
}

function findBundledModelsPath(): string {
    const candidates = [
        join(__dirname, "..", "..", "config", "models.json"),
        join(__dirname, "config", "models.json")
    ];
    for (const p of candidates) if (existsSync(p)) return p;
    return candidates[0] ?? join(__dirname, "..", "..", "config", "models.json");
}

const bundledModelsPath = findBundledModelsPath();

let cachedConfig: AjanConfig | undefined;

function readJson<T>(path: string): T {
    return JSON.parse(readFileSync(path, "utf8")) as T;
}

function resolveBundledModels(): ModelDefinition[] {
    try {
        const registry = readJson<RemoteModelsRegistry>(bundledModelsPath);
        if (Array.isArray(registry.models)) return registry.models;
    } catch (err) {
        logger.debug(`Bundled models okunamadi: ${String(err)}`);
    }
    return [];
}

function resolveRemoteModels(url?: string): ModelDefinition[] {
    if (!url) return [];
    const cachePath = join(getCacheDir(), "remote-models.json");
    try {
        const cached = readJson<RemoteModelsRegistry>(cachePath);
        if (cached && Array.isArray(cached.models)) {
            logger.debug(`Remote models cache'ten okundu (${cached.models.length} model)`);
            return cached.models;
        }
    } catch {
        /* cache yoksa umursama */
    }
    return [];
}

export async function refreshRemoteModels(url?: string): Promise<ModelDefinition[]> {
    const source = url ?? DEFAULT_CONFIG.remoteModelsUrl;
    if (!source) return [];
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(source, { signal: controller.signal, redirect: "follow" });
        clearTimeout(timer);
        if (!res.ok) {
            logger.debug(`Remote models fetch basarisiz: HTTP ${res.status}`);
            return resolveRemoteModels(url);
        }
        const registry = (await res.json()) as RemoteModelsRegistry;
        if (!Array.isArray(registry.models)) return [];
        const cachePath = join(getCacheDir(), "remote-models.json");
        writeFileSync(cachePath, JSON.stringify({ ...registry, updatedAt: new Date().toISOString() }, null, 2));
        logger.info(`Remote model listesi guncellendi: ${registry.models.length} model`);
        return registry.models;
    } catch (err) {
        logger.debug(`Remote models guncelleme basarisiz: ${String(err)}`);
        return resolveRemoteModels(url);
    }
}

export function getModelsRegistry(): ModelDefinition[] {
    const bundled = resolveBundledModels();
    const remote = resolveRemoteModels(DEFAULT_CONFIG.remoteModelsUrl);
    const merged = new Map<string, ModelDefinition>();
    for (const m of bundled) merged.set(m.id, m);
    for (const m of remote) merged.set(m.id, m);
    return [...merged.values()];
}

export function getModelById(id: string): ModelDefinition | undefined {
    return getModelsRegistry().find((m) => m.id === id);
}

export function loadConfig(forceReload = false): AjanConfig {
    if (cachedConfig && !forceReload) return cachedConfig;
    const cfgPath = getConfigPath();
    let fileCfg: Partial<AjanConfig> = {};
    if (existsSync(cfgPath)) {
        try {
            fileCfg = readJson<Partial<AjanConfig>>(cfgPath);
        } catch (err) {
            logger.warn(`config.json parse hatasi (varsayilan kullaniliyor): ${String(err)}`);
        }
    }
    // Donmuş/bayat sistem promptu diske asla yazılmaz ve okunmaz;
    // içinde eski çalışma dizini kalabilir. Her açılışta taze üretilir.
    delete (fileCfg as { systemPrompt?: unknown }).systemPrompt;
    const fileDiscord = fileCfg.discord;
    const baseDiscord = DEFAULT_CONFIG.discord ?? {};
    cachedConfig = {
        ...DEFAULT_CONFIG,
        ...fileCfg,
        session: { ...DEFAULT_CONFIG.session, ...fileCfg.session },
        discord: {
            ...baseDiscord,
            ...fileDiscord,
            smallImageKeys: {
                ...(baseDiscord.smallImageKeys ?? {}),
                ...(fileDiscord?.smallImageKeys ?? {})
            }
        }
    };
    delete (cachedConfig as { cwd?: unknown }).cwd;
    cachedConfig.systemPrompt = buildDefaultSystemPrompt(process.cwd());
    return cachedConfig;
}

export function saveConfig(config: AjanConfig): void {
    const cfgPath = getConfigPath();
    const safe = JSON.parse(JSON.stringify(config)) as AjanConfig;
    delete (safe as { systemPrompt?: unknown }).systemPrompt;
    if (safe.session) {
        for (const k of Object.keys(safe.session)) {
            if (safe.session[k as keyof typeof safe.session] == null) delete safe.session[k as keyof typeof safe.session];
        }
    }
    writeFileSync(cfgPath, JSON.stringify(safe, null, 2));
    cachedConfig = safe;
}

export function resolveModelFilePath(model: ModelDefinition): string {
    const modelsDir = getModelsDir();
    const fileName = model.fileName ?? basename(model.uri);
    return join(modelsDir, fileName);
}

export function isModelInstalled(model: ModelDefinition): boolean {
    return existsSync(resolveModelFilePath(model));
}

export function listInstalledModels(): { model: ModelDefinition; path: string; installed: boolean }[] {
    const modelsDir = getModelsDir();
    if (!existsSync(modelsDir)) return [];
    const entries = getModelsRegistry();
    const result: { model: ModelDefinition; path: string; installed: boolean }[] = [];
    for (const model of entries) {
        result.push({
            model,
            path: resolveModelFilePath(model),
            installed: isModelInstalled(model)
        });
    }
    return result;
}

export function removeModelFile(model: ModelDefinition): boolean {
    const file = resolveModelFilePath(model);
    if (!existsSync(file)) return false;
    try {
        rmSync(file, { force: true });
        return true;
    } catch (err) {
        logger.error(`Model silinemedi: ${String(err)}`);
        return false;
    }
}

export function resolveAbsolutePath(cwd: string, inputPath: string): string {
    if (isAbsolute(inputPath)) return inputPath;
    return join(cwd, inputPath);
}

export function ensureConfigDir(): void {
    mkdirSync(getDataDir(), { recursive: true });
    mkdirSync(getModelsDir(), { recursive: true });
}
