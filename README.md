# AJAN AI

```
▀█▀ ▄▀█ █▄▀ █ █▀▄▀█ █▀▀ █ ▀█ █▀▀ █ █▀ █
░█░ █▀█ █░█ █ █░▀░█ █▄▄ █ █▄ █▄█ █ ▄█ █
```

**Otonom, yerel AI kodlama ajanı** — TakımÇizgisi Yazılım Geliştirme Grubu

AJAN, görevleri bağımsız olarak **planlayan**, **kod yazan**, **test eden** ve **sonuçları doğrulayan** bir yapay zeka ajanıdır. Tümüyle yerel çalışır: modeliniz bilgisayarınızda koşar, dosyalarınız cihazınızdan çıkmaz. VSCode uzantısı ile gelir ve AI motoru olarak **node-llama-cpp** kullanır (CUDA / Vulkan / Metal / CPU).

> **Neden yerel?** Bulut ajanların aksine AJAN hiçbir koda, yapılandırmaya veya sohbete dışarı erişim vermez. 3–8 GB'lık model bilgisayarınızda indirilir ve tüm işlemler tamamen offline yürütülür.

---

## İçindekiler

- [Özellikler](#özellikler)
- [Nasıl çalışır?](#nasıl-çalışır)
- [Gereksinimler](#gereksinimler)
- [Kurulum](#kurulum)
- [İzinler](#izinler)
- [VSCode Kullanımı](#vscode-kullanımı)
- [Ayarlar](#ayarlar)
- [Modeller](#modeller)
- [Araçlar (Tools)](#araçlar-tools)
- [SDK Olarak Kullanım](#sdk-olarak-kullanım)
- [Proje Yapısı](#proje-yapısı)
- [Geliştirme](#geliştirme)
- [Kaldırma](#kaldırma)
- [Sorun Giderme](#sorun-giderme)
- [Lisans](#lisans)

---

## Özellikler

- **Otonom ajan döngüsü** — görevi planlar, adımları araçlarla uygular, sonucu doğrular, bitirir.
- **Tamamen yerel LLM** — `node-llama-cpp` üzerinde Gemma / Qwen GGUF modelleri; buluta kod/hiç veri gönderilmez.
- **GPU hızlandırma** — CUDA, Vulkan, Metal (macOS), WebGPU veya saf CPU; GPU katman sayısı `auto`/`max`.
- **VSCode entegrasyonu** — Activity Bar sekmesi (turuncu), yerleşik sohbet + `.ajan` test alanı (playground).
- **20'ye yakın yerleşik araç** — dosya okuma/yazma, grep/arama, kod düzenleme, diff uygulama, terminal komutu, web arama, not defteri, todo yönetimi vb.
- **Akıllı dosya sistemi** — yol güvenliği, dizin dışı erişim engelleme, izin verilen kök kontrolü.
- **128K bağlam** — Gemma 4 E2B ile uzun proje bağlamı.
- **Model yönetimi** — `config/models.json` kayıt defteri + uzaktan güncelleme, indirme/onarım, modele özel GGUF.
- **Oturum yönetimi** — sohbet geçmişini diske kaydeder, yeni sohbet başlatabilir.
- **Playground (`.ajan`)** — sınırsız hakları istemeden betik/todo/test senaryosu çalıştırma alanı.
- **Discord presence** — ayarlanabilir "şu anda AJAN çalışıyor" durumu.
- **Konsol / Test betikleri** — `scripts/` altında otomasyon, paketleme (VSIX + npm tgz), dağıtım ve smoke test araçları.

## Nasıl çalışır?

1. **Model yüklenir** — `node-llama-cpp` modeli indirir (HUFF/GGUF kaynağından) ve GPU/CPU ile yükler.
2. **Ajan döngüsü başlar** — `core/agent.ts`, kullanıcı mesajını modele verir; model araç çağrısı yaparsa araç çalıştırılır (`tools/registry.ts`).
3. **Sonuç modele geri döner** — araç çıktısı modele iletılır; ajan "görev tamam" diyene (veya maksimum adıma ulaşana) kadar döngü sürer.
4. **Doğrulama** — görev tamamlandığında `taskComplete` aracı özeti raporlar; hatalar "GERÇEKLEŞMEDİ" olarak işaretlenir ve asla başarılı diye raporlanmaz.

Tüm araç çağrıları çalışma dizini/politika ile kısıtlanır; terminal komutları ve web erişimi varsayılan olarak güvenli sınırlarda tutulur.

## Gereksinimler

| Bileşen | Gereksinim |
|---|---|
| Node.js | `>= 26.4.0` |
| npm | `11.x` (npm 11 `allowScripts` izin sistemini kullanır) |
| VSCode | `^1.95.0` (uzantı için) |
| RAM | Model başına ~3–8 GB (Q4: ~3–4 GB, Q8: ~5–8 GB) |
| GPU (ops.) | NVIDIA CUDA, Intel/AMD Vulkan, Apple Metal — yoksa CPU |
| Disk | Model başına ~3–8 GB + uygulama paketi |

## Kurulum

AJAN global bir npm paketi olarak kurulur ve kurulurken hem **VSCode uzantısını** hem de **AI motorunu** (node-llama-cpp) otomatik kurar. İki yol vardır: tek satırlık indirici veya yerel depo.

> ⚠️ **Sürüm uyumluluğu:** Eski sürümler (`0.2.x` ve daha eskisi) artık **desteklenmiyor**. Yalnızca en güncel sürümü kurun:
>
> ```sh
> npm install -g @takimcizgisi/ajan@latest
> ```

### A) Tek satır (yayınlanınca kullanılabilir)

> Paket henüz npm registry'sine **yayınlanmadı** — bu komutlar var olduğunda çalışacaktır.

- **Linux / macOS**

  ```sh
  curl -fsSL https://raw.githubusercontent.com/takimcizgisi/ajan/Project/install.sh | sh
  ```

- **Windows (PowerShell)**

  ```powershell
  curl.exe -fsSL https://raw.githubusercontent.com/takimcizgisi/ajan/Project/install.bat -o "$env:TEMP\ajan-install.bat"; & "$env:TEMP\ajan-install.bat"
  ```

### B) Yerel depodan (geliştirici)

Depo kökünde:

- **Windows:**

  ```bat
  install.bat
  ```

- **Linux / macOS:**

  ```sh
  sh install.sh
  ```

Installers şunları yapar:

1. Node.js (`>=26.4`) ve npm varlığını/uygunluğunu kontrol eder.
2. Kaynağı seçer: yerel depodaki tarball veya npm registry paketi.
3. VSCode uzantısı için izin ister/sessiz onay alır (`AJAN_YES=1`).
4. Paketi `--allow-scripts=node-llama-cpp` ile global kurar (LLM motoru native binary'lerini indirir).
5. VSIX kurulumu Electron paket yöneticisi (`packages/ajan`) üzerinden `code --install-extension` ile çalıştırılır.
6. Global kurulumu, AI motorunu ve VSCode uzantısını doğrular.

**Belli bir sürümü registry'den kurmak** (yayınlandığında):

```sh
sh install.sh 0.3.0      # Linux/macOS
install.bat 0.3.0        # Windows
```

**Yerel paketi yeniden derlemek** (dist/vsix taze olsun diye):

```sh
AJAN_REPACK=1 sh install.sh     # Linux/macOS
set AJAN_REPACK=1 && install.bat   # Windows
```

## İzinler

AJAN, kurulum ve çalışma için aşağıdaki izinleri kullanır:

| İzin | Nerede | Neden |
|---|---|---|
| VSCode uzantı kurulumu | Electron paket yöneticisi | `paket yöneticisi` ayarlarından VSIX'i kurar |
| LLM motoru betikleri (native binary) | `--allow-scripts=node-llama-cpp` | model dosyaları ve CUDA/Vulkan/CPU binary'leri |
| Çalışma dizini + terminal | VSCode `ajan.workspaceDir` ayarı | dosya okuma/yazma ve komut çalıştırma bu dizinle sınırlanır |

> **npm 12 notu:** npm, `allowScripts` dışındaki `postinstall` betiklerini yakında varsayılan olarak engelleyecek. Bu nedenle installers, VSIX kurulumunu npm'in postinstall mekanizmasına değil doğrudan çalıştırmaya dayanır. npm 11'de isterseniz kalıcı izin için:
>
> ```sh
> npm config set allow-scripts=node-llama-cpp --location=user
> ```

## VSCode Kullanımı

Kurulumdan sonra VSCode'u açın — sol Activity Bar'da turuncu **AJAN** sekmesi görünür.

| Komut (Palette / Araç çubuğu) | Açıklama |
|---|---|
| `AJAN: Sohbeti Aç` (`ajan.chat`) | Sohbet webview'ini açar |
| `AJAN: Yeni Sohbet` (`ajan.newChat`) | Oturum sıfırlar, yeni sohbet başlatır |
| `AJAN: Üretimi Durdur` (`ajan.stop`) | Devam eden üretimi durdurur |
| `AJAN: Model Listesini Yenile` (`ajan.refreshModels`) | Model kayıt defterini yeniden yükler / uzaktan günceller |
| `AJAN: Ayarları Aç` (`ajan.openSettings`) | VSCode ayarlarını açar |
| `AJAN: Test Alanını Aç (.ajan)` (`ajan.openPlayground`) | Sınırsız hak listesi olmadan betik/todo test alanı |

## Ayarlar

VSCode ayarlarında (`settings.json`) `ajan.*` anahtarları:

| Ayar | Varsayılan | Açıklama |
|---|---|---|
| `ajan.workspaceDir` | `""` (aktif klasör) | AJAN çalışma dizini; dosya/terminal işlemlerinin kökü |
| `ajan.modelId` | `gemma-4-e2b-q4-k-m` | Kullanılacak model kimliği (`config/models.json`) |
| `ajan.gpu` | `auto` | `auto` \| `metal` \| `cuda` \| `vulkan` \| `webgpu` \| `cuda-llama` \| `vulkan-llama` |
| `ajan.gpuLayers` | `auto` | GPU katman sayısı (`auto`/`max` veya sayı) |
| `ajan.contextSize` | `auto` | Bağlam penceresi (token) |
| `ajan.temperature` | `0.6` | Samimiyet / rastlantısallık (0–2) |
| `ajan.maxTokens` | `8192` | Maks. üretilecek token |
| `ajan.maxSteps` | `25` | Otonom görevde maksimum araç adımı |
| `ajan.toolTimeout` | `60000` | Tek araç zaman aşımı (ms) |
| `ajan.maxToolOutput` | `40000` | Araç çıktısının log'lanacak maks. karakteri |
| `ajan.beepOnComplete` | `false` | Görev bitince bip çal |

## Modeller

Kayıt defteri: `config/models.json` (uzaktan `refreshRemoteModels` ile güncellenebilir). İndirilen dosyalar `getModelsDir()` altında tutulur.

| Model | Dosya / boyut | Bağlam | Açıklama |
|---|---|---|---|
| `gemma-4-e2b-q4-k-m` | `gemma-4-E2B-it-Q4_K_M.gguf` ~3–4 GB | 128K | **Varsayılan.** 4-bit, muhakeme + çoklu mod |
| `gemma-4-e2b-q8` | `gemma-4-E2B-it-Q8_0.gguf` ~5–8 GB | 128K | Daha yüksek kalite, daha fazla RAM |
| `gemma-3-4b-it-q4-k-m` | `Gemma-3 4B Q4_K_M` | 32K | Çoklu mod destekli, orta boy alternatif |
| `qwen-3-4b-instruct-q4-k-m` | `Qwen3 4B Q4_K_M` | 32K | Güçlü tool-calling alternatifi |

Modeller Hugging Face GGUF kaynaklarından indirilir (`uri` alanı), indirme ilerlemesi SDK üzerinden `events` ile takip edilebilir.

## Araçlar (Tools)

Ajanın kullanabildiği araçlar `tools/registry.ts` içinde toplanır:

| Araç | İşlev |
|---|---|
| `readFile` / `writeFile` | Dosya okuma / yazma |
| `listDir` | Dizin içeriği |
| `searchFiles` | Dosya adı arama |
| `grep` | İçerik arama (regex) |
| `editFile` | Konum bazlı dosya düzenleme |
| `applyPatch` | Unified diff uygulama (`parseUnifiedDiff`) |
| `runCommand` | Terminal komutu çalıştırma (zaman aşımı + ağaç öldürme 👉 *Windows'ta timeout'lu süreçleri temiz kapatır*) |
| `moveFile` / `deleteFile` | Dosya taşıma / silme |
| `readData` / `unzipFile` | Veri bölgesi okuma / arşiv açma |
| `webSearch` / `fetchUrl` | Web arama / URL içeriği |
| `noteAdd` / `noteRead` | Kalıcı ajan not defteri |
| `taskComplete` | Görevi bitir ve sonucu raporla |
| `openPlayground` / `setTodos` / `getTodos` | Todo yönetimi ve `.ajan` test alanı |

## SDK Olarak Kullanım

Paket bir Node kütüphanesi olarak da kullanılabilir (`dist/index.js`, tip bildirimleri `dist/index.d.ts`):

```ts
import { AjanAgent, AjanService, LlamaEngine, loadConfig, getModelsRegistry } from "@takimcizgisi/ajan";

const config = await loadConfig();                       // ajan.jsonc
const models = getModelsRegistry();                      // config/models.json
const model = models.find((m) => m.id === config.modelId);

const engine = new LlamaEngine(model, { gpu: "auto" });
await engine.load();

const agent = new AjanAgent(engine, { maxSteps: 25 });
agent.on("toolCall", ({ name, params }) => console.log("araç:", name));
agent.on("toolResult", ({ name, ok, output }) => console.log(name, ok ? "ok" : "hata"));

const answer = await agent.run("src/index.ts dosyasını incele ve birim test ekle");
console.log(answer);
```

Ayrıca dışa aktarılanlar: `DiscordPresence`, `downloadModel`, `listInstalledModels`, `isModelInstalled`, `resolveModelFilePath`, `refreshRemoteModels`, `parseUnifiedDiff`, `createCoreTools`, `getDataDir/getModelsDir/getConfigPath/getLogDir` vb.

## Proje Yapısı

Monorepo; her paket bağımsız sürüm/kimliğe sahiptir (`@takimcizgisi/*`).

```
AJAN/
├── package.json             # kök: private workspace orchestrator
├── tsconfig.base.json       # ortak TS ayarları
├── scripts/
│   ├── clean.mjs            # paket çıktılarını temizler
│   └── release.mjs          # üretim: build → core tgz / publish / electron-builder
└── packages/
    ├── core/                # @takimcizgisi/core — yerel AI motoru (SDK)
    │   ├── src/
    │   │   ├── core/        # Ajan döngüsü (agent.ts)
    │   │   ├── engine/      # LLM motoru (llama.ts) + model indirme (modelManager.ts)
    │   │   ├── config/      # konfigürasyon + model kayıt defteri (types.ts, configManager.ts)
    │   │   ├── tools/       # 20'ye yakın ajan aracı + kayıt (registry.ts)
    │   │   ├── utils/       # oturum, proje bağlamı, dizin/yerel yollar
    │   │   ├── discord/     # Discord presence (presence.ts)
    │   │   ├── service.ts   # üst düzey servis (olaylar, durum)
    │   │   └── index.ts     # SDK dışa aktarımları
    │   ├── config/models.json  # model kayıt defteri
    │   └── scripts/smoke-*.ts  # araç smoke testleri
    ├── vscode/              # ajan (takimcizgisi.ajan, npm @takimcizgisi/ajan-vscode) — VSCode uzantısı
    │   ├── src/             # extension, panel, backend (AjanBackendBridge), ajanService
    │   └── media/           # webview chat UI
    └── ajan/                # @takimcizgisi/ajan — Electron GUI (ana AJAN + paket yöneticisi)
        ├── src/main/        # electron main, ipc köprüsü, pm.ts (paket yöneticisi)
        ├── src/preload.ts   # güvenli contextBridge API
        └── src/renderer/    # chat arayüzü
```

> `@takimcizgisi/ajan` (Electron) bir paket yöneticisidir: `~/.ajan/packages` yönetim
> dizini altına `@takimcizgisi/core` motorunu ve `@takimcizgisi/ajan-vscode` uzantısını
> kurar/günceller.

## Geliştirme

```sh
npm install                 # workspace bağımlılıkları (kök package.json allowScripts içerir)
npm run build               # core → vscode derler
npm run build:electron      # Electron paketini derler
npm run dev:electron        # Electron GUI'yi çalıştırır
npm run test:tools          # core araç smoke testleri
npm run vscode:package      # VSIX üretir
npm run release             # hepsini derler + core tgz üretir
```

| Betik | Ne yapar |
|---|---|
| `npm run build -w packages/core` | core derler (`tsc`) → `packages/core/dist/` |
| `npm run build -w packages/vscode` | uzantı derler (`esbuild`) → `packages/vscode/out/` |
| `npm run build -w packages/ajan` | Electron derler → `packages/ajan/dist/` |
| `dev:electron` | Electron GUI'yi başlatır (uygulama, paket yöneticisini açar) |
| `test:tools` / `test:new` | `tsx` ile smoke testleri (kalıntı süreç/dizin bırakmaz) |

## Kaldırma

```sh
npm uninstall -g @takimcizgisi/ajan
code --uninstall-extension takimcizgisi.ajan
```

## Sorun Giderme

- **`EALLOWSCRIPTS` / postinstall engellendi** → `--allow-scripts=node-llama-cpp` kullanın veya çalıştırın: `npm config set allow-scripts=node-llama-cpp --location=user`.
- **VSCode açıkken uzantı kurulamıyor** → "Please restart VS Code" hatası VSCode CLI yüzündendir: VSCode'u tamamen kapatıp tekrar deneyin veya `code --install-extension <ajan-*.vsix> --force`.
- **`'code' komutu PATH'te yok`** → VSCode içinde `Ctrl+Shift+P` → "Shell Command: Install 'code' command in PATH".
- **Model indirme yavaş / kesildi** → model dosyaları yeniden denenebilir; `isModelInstalled()` ile durumu kontrol edin. Disk alanınızı (3–8 GB) kontrol edin.
- **Electron binary inmezse** → `node node_modules/electron/install.js` komutunu ağ bağlantısı uygun ortamda çalıştırın.
- **`node-llama-cpp` dizini görünmüyor** → `@takimcizgisi/core` yönetim dizinindeki (`~/.ajan/packages`) node_modules altına kurulur; ilk kullanımda otomatik çözülür.

## Lisans

**GPL-3.0** — bkz. [LICENSE](packages/vscode/LICENSE) (uzantı lisansı). Bu proje, TakımÇizgisi Yazılım Geliştirme Grubu tarafından geliştirilmiştir.