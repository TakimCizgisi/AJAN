# AJAN AI

> **Otonom, yerel AI kodlama ajanı** — TakımÇizgisi LSH Yazılım Geliştirme Grubu ve Topluluğu
>
> Sürüm 0.5.0 — **Amber Apricot**

AJAN, görevleri bağımsız olarak **planlayan**, **kod yazan**, **test eden** ve **sonuçları doğrulayan** bir yapay zekâ ajanıdır. Tamamen yerel çalışır: model bilgisayarınızda koşar, dosyalar cihazınızdan çıkmaz.

AJAN bir **motordur** (daemon). Arayüz, panel veya eklenti yoktur. Motor bir IPC kanalı üzerinden dinler; onunla konuşan istemci ne olursa olsun sonucu kendi yüzeyinde gösterir. Yapay zekâ motoru **node-llama-cpp**'dir ve hedefi **CUDA**'dır.

> **Neden yerel?** Bulut ajanlarının aksine AJAN hiçbir koda, yapılandırmaya veya sohbete dışarıdan erişim vermez. Model indirilir ve tüm işlemler tamamen offline yürütülür.

---

## İçindekiler

- [Mimari](#mimari)
- [Kurulum](#kurulum)
- [Motoru çalıştırma](#motoru-çalıştırma)
- [İstemci kullanımı](#istemci-kullanımı)
- [IPC protokolü](#ipc-protokolü)
- [Özellikler](#özellikler)
- [Araçlar](#araçlar)
- [Modeller](#modeller)
- [GPU](#gpu)
- [Yapılandırma](#yapılandırma)
- [Veri dizini](#veri-dizini)
- [Geliştirme](#geliştirme)
- [Sorun giderme](#sorun-giderme)
- [Lisans](#lisans)

---

## Mimari

```
        ┌──────────────┐        ┌──────────────────────────────┐
        │  istemci uyg │ ─IPC─▶ │  ajan-engine (daemon)        │
        │  (herhangi)  │ ◀───── │  ├─ AjanService  (tek örnek) │
        └──────────────┘  olay  │  ├─ AjanAgent   (tek model)   │
                              │  └─ LlamaEngine  (CUDA)     │
                              └──────────────────────────────┘
```

- **Tek motor süreci.** Model belleği paylaşılan bir kaynaktır; her istemci aynı modeli kullanır, her sohbet motoru yeniden başlatmaz.
- **Tek çalışma kuyruğu.** Modele dokunan işlemler (sohbet, model kurma, config değişimi) sırayla yürütülür. Durum okuyan istekler kuyruğu atlar.
- **Olay akışı.** Sohbet çıktısı yalnızca soran istemciye gider; iki istemci birbirinin metnini görmez. Model yükleme ilerlemesi herkese açıktır.

## Kurulum

```bash
npm install -g @takimcizgisi/ajan
```

Bu, `ajan-engine` motorunu kurar. Motor **yalnızca CUDA ve Vulkan** kullanır ve ikisini sırayla dener: önce CUDA, olmazsa Vulkan. İkisi de kullanılamıyorsa motor hata fırlatır — sessizce CPU'ya düşmez. Kurulumdan sonra hangisinin çalıştığını doğrulamak için:

```bash
npm run check:gpu
```

Motor tek dosya olarak paketlenir (`out/ajan-engine.js`). İstemci olarak `AjanEngine` sınıfını içe aktarırsınız:

```ts
import { AjanEngine } from "@takimcizgisi/ajan/client";
```

## Motoru çalıştırma

```bash
npx ajan-engine
```

Seçenekler:

| Seçenek | Açıklama |
|---|---|
| `-C, --cwd <yol>` | Ajanın çalışma dizini (varsayılan: bulunulan dizin) |
| `--socket <yol>` | Dinlenecek socket (varsayılan: `\\.\pipe\ajan-engine`, POSIX'te `$XDG_RUNTIME_DIR/ajan-engine.sock`) |
| `--log-level <seviye>` | `debug` \| `info` \| `warn` \| `error` |
| `-h, --help` | Yardım |

Motor başladığında tek satır yazar ve dinlemeye başlar:

```
AJAN motoru hazır  ajan=0.5.0  socket=\\.\pipe\ajan-engine  cwd=D:\proje
```

`Ctrl+C` motoru düzgünce kapatır. Uzun süre arka planda çalışacaksa `detached` olarak başlatıp logları `getLogDir()` altına yazdırın.

## İstemci kullanımı

```ts
import { AjanEngine } from "@takimcizgisi/ajan/client";

const engine = await AjanEngine.connect();          // özel yol: connect("\\.\pipe\ajan-engine")

// Tek seferlik soru — yanıt akış halinde gelir
const cevap = await engine.ask("bu klasördeki tüm testleri çalıştır", {
    onText: (t) => process.stdout.write(t),
    onThinking: (t) => process.stderr.write(t),
    onToolCall: (name, args) => console.log("→", name, args),
    onToolResult: (name, ok) => console.log(ok ? "✔" : "✖", name)
});

// Durum
const s = await engine.status();
console.log(s.modelName, s.gpu.active, `${s.gpu.layers} katman`, `${s.gpu.vramMb} MB`);
```

Öne çıkan metotlar:

| Metot | Açıklama |
|---|---|
| `ping()` | Motor sürümü ve protokol uyumu (`PROTOCOL_VERSION`) |
| `status()` | Model, GPU, bağlam, istemci sayısı, uptime |
| `getGpu()` | Yalnız GPU raporu |
| `ask(text, opts)` | Sohbet; akış + araç olayları, döner: tam yanıt |
| `abort()`` | Devam eden görevi iptal et |
| `newChat()` | Konuşma geçmişini temizle (model yüklü kalır) |
| `listModels()` / `installModel(id)` / `removeModel(id)` / `useModel(id)` | Model yönetimi |
| `refreshModels()` | Kataloğu uzak kaynaktan yenile |
| `getHistory()` / `listSessions()` / `loadSession(id)` / `saveSession(s)` / `deleteSession(id)` | Oturum yönetimi |
| `shutdown()` | Motoru kapat |

Olaylara abone olmak için `engine.on(...)` ve `engine.onClose(...)` kullanılabilir.

Motor çalışmıyorsa `AjanEngine.connect` anlaşılır bir hata verir (`socket yok` / `yanıt vermiyor`); `start` komutuyla başlatın.

## IPC protokolü

- Taşıma: Windows'ta **named pipe** (`\\.\pipe\ajan-engine`), POSIX'te **Unix domain socket**.
- Çerçeveleme: **newline-delimited JSON** — her mesaj tek satır. Uzun yazılar (diff, patch) satır sınırlarından bağımsız birleştirilir.
- Sürüm: `PROTOCOL_VERSION` (şu an `1`). Uyumsuzlukta `AjanEngine.assertCompatible()` hata verir; motoru yeniden başlatın.

Bir istek `{ id, req }`, bir yanıt `{ id, ok, result }` veya `{ id, ok:false, error }` şeklindedir. Olaylar `{ event, ... }` taşır ve `id` içermez.

İstekler: `ping`, `status`, `set-config`, `list-models`, `install-model`, `remove-model`, `use-model`, `refresh-models`, `chat`, `abort`, `new-chat`, `get-history`, `list-sessions`, `load-session`, `save-session`, `delete-session`, `shutdown`.

Olaylar: `text-chunk`, `thinking-chunk`, `tool-call`, `tool-result`, `step-start`, `step-end`, `load-progress`, `load-complete`, `error`, `complete`.

## Özellikler

- **Otonom görev döngüsü.** Model araç çağrısı yapar, sonuçları okur, adımları kendi ilerletir; `task_complete` ile turu kapatır.
- **Gerçek akıl yürütme akışı.** Gemma modellerinde `reasoning: true` ile düşünme segmentleri `thinking-chunk` olarak yayınlanır; Qwen'de `thoughts` modu `reasoning` ayarına göre `discourage`/`auto` seçilir.
- **Araçlar.** Dosya sistemi, kabuk, arama, veri okuma, diff/patch uygulama, `fetch_url`, oyun alanı (playground) ve oturum araçları.
- **Patch desteği.** Birleşik diff ayrıştırılır ve dosyaya güvenli biçimde uygulanır.
- **Güvenlik sınırları.** `cwd` dışına yazma engellenir; silme işlemleri izlenebilir loglanır.
- **Oturumlar.** Sohbet geçmişi diske yazılır, listelenir, geri yüklenir.
- **Model kataloğu.** Uzak kaynaktan (`config/models.json` gösterge dosyasından) yenilenebilir.

## Araçlar

| Araç | İşlev |
|---|---|
| `read_file`, `write_file`, `edit_file`, `delete_file` | Dosya okuma/yazma/düzenleme/silme |
| `list_files`, `search_files`, `read_data` | Dizin tarama, içerik arama, JSON/YAML okuma |
| `run_command` | Kabuk komutu |
| `apply_patch` | Birleşik diff uygulama |
| `unzip_file` | Arşiv açma |
| `fetch_url` | URL içeriği çekme |
| `open_playground`, `task_complete` | Etkileşimli oyun alanı ve tur kapanışı |

## Modeller

Katalog `config/models.json` içinde tanımlıdır; her model `contextSize: "auto"` ve `gpuLayers: "auto"` taşır, yani motor config'deki değerleri kullanır.

| id | Ad | Not |
|---|---|---|
| `gemma-4-e2b-q4-k-m` | Gemma 4 E2B (Q4_K_M) | Varsayılan, düşünme açık |
| `gemma-4-e2b-q8` | Gemma 4 E2B (Q8_0) | Daha yüksek kalite, daha çok RAM |
| `gemma-3-4b-it-q4-k-m` | Gemma 3 4B Instruct (Q4_K_M) | Alternatif |
| `qwen-3-4b-instruct-q4-k-m` | Qwen3 4B Instruct (Q4_K_M) | Güçlü tool calling |

Model kurma:

```ts
await engine.installModel("gemma-4-e2b-q4-k-m");
```

Kurulum `getModelsDir()` altına indirir ve ilerleme `load-progress` olayıyla bildirilir. Kurulu model `active` olarak işaretlenmeden sohbet başlatmak "Model tanımlı değil" hatası verir.

## GPU

Motor **yalnızca CUDA ve Vulkan** kullanır. Bu ikisi dışında bir arka uç yoktur (Metal, WebGPU ve saf CPU seçeneği kaldırılmıştır).

### Arka uç zinciri

Motor sırayla dener ve **ilk çalışanı** kullanır:

| `config.gpu` | Denenen sıra |
|---|---|
| `auto` (varsayılan) | `auto` → node-llama-cpp kendi çözümlemesi (önce CUDA, olmazsa Vulkan) |
| `cuda` | `cuda` → `vulkan` → `auto` |
| `vulkan` | `vulkan` → `auto` |

- Her başarısız deneme gerekçesiyle loglanır.
- Zincirin tamamı tutarsa **hata fırlatılır**; motor sessizce CPU'ya düşmez. Sessiz yavaşlama, ilk sürümdeki en büyük sorundu.
- `gpuLayers` varsayılanı `max` — tüm katmanlar GPU'ya gider.

```bash
npm run check:gpu
```

Bu komut `config.gpu`'yu gösterir, sürücü desteğini listeler ve CUDA ile Vulkan'ı **gerçekten yükleyerek** hangisinin çalıştığını raporlar. Model yüklenmeden katman aktarımı açılıp açılmadığı görülür.

### Raporlanan alanlar

| Alan | Anlam |
|---|---|
| `gpu.active` | Gerçekte yüklenen arka uç (`cuda` \| `vulkan`) veya `"yüklenmedi"` |
| `gpu.offload` | Katman aktarımı açık mı |
| `gpu.layers` | GPU'ya yüklenen katman sayısı (0 = henüz yüklenmedi) |
| `gpu.vramMb` | Kullanılabilen GPU belleği |
| `gpu.supported` | Bu makinede sürücüsü bulunan arka uçlar |
| `gpu.preferred` | `config.gpu` değeri |
| `gpu.fallback` | İstenen arka uç kullanılamayıp diğerine düşüldü mü |

> **Önemli ayrım:** "makine CUDA'yı destekliyor" ile "motor CUDA'da çalışıyor" aynı şey değildir. `nvidia-smi` CUDA sürücüsünü gösterebilir ama node-llama-cpp'nin prebuilt CUDA ikilisi uyumsuz olabilir; bu durumda `getLlama({gpu:"cuda"})` hata fırlatır ve motor bir sonraki adaya geçer. `gpu.active` yalnızca `Llama.gpu`'dan okunur, `supported` listesinden değil.

### Bu makinedeki durum (RTX 5070 Laptop)

```
sürücü destekli   : vulkan
uyumlu olabilir   : cuda, vulkan

cuda     -> KULLANILAMIYOR (No prebuilt binaries found)
vulkan   -> vulkan   katman aktarimi: acik
```

CUDA sürücüsü kurulu (`nvidia-smi` CUDA 13.4 gösteriyor) ancak node-llama-cpp 3.21.1'in prebuilt CUDA ikilisi bu sistemde `testBindingBinary` aşamasında eleniyor. İki olası sebep: RTX 5070'in Blackwell mimarisi (sm_120) sürümdeki CUDA ikilisinde bulunmuyor ya da sistemde çakışan bir CUDA kurulumu var. Motor bu yüzden **Vulkan** ile çalışır — aynı GPU, aynı VRAM, aynı katman aktarımı; yalnızca CUDA'ya göre biraz daha yavaş.

CUDA'nın açılması için node-llama-cpp'nin bu kartı kapsayan bir sürümüne yükseltilmesi gerekir. Bunu doğrulamak için:

```bash
npm run check:gpu
```

## Yapılandırma

`getConfigPath()` altındaki `config.json`:

```jsonc
{
    "modelId": "gemma-4-e2b-q4-k-m",
    "contextSize": 8192,      // 128K yerine; KV cache belleği tüketip ilk tokeni geciktiriyor
    "gpuLayers": "max",       // "max" = tüm katmanlar; sayı = o kadar katman
    "gpu": "auto",            // auto | cuda | vulkan
    "session": { "temperature": 0.6, "topK": 64, "topP": 0.9, "maxTokens": 2048 }
}
```

`gpu` yalnız `auto`, `cuda` veya `vulkan` olabilir. Ayrıntı için [GPU](#gpu) bölümü.

Çalışma zamanında değiştirmek için `set-config` isteği gönderilir (`patch` nesnesi mevcut config ile birleştirilir). `modelOverrides` ile model bazında `temperature`, `maxTokens` gibi değerler geçilebilir.

## Veri dizini

`getDataDir()` (varsayılan `~/.ajan`):

| Yol | İçerik |
|---|---|
| `models/` | İndirilen GGUF dosyaları |
| `config.json` | Ayarlar |
| `sessions/` | Kayıtlı oturumlar |
| `logs/` | `engine.log`, `engine.err.log` |

## Geliştirme

```bash
npm install
npm run typecheck     # tsc --noEmit
npm run build         # out/ajan-engine.js
npm run watch         # yeniden derleme
npm run clean
npm run test:tools    # araç testleri
npm run test:new      # yeni araç testleri
npm run test:ipc      # IPC uçtan uca testi
npm run check:gpu     # CUDA/Vulkan yükleme denemesi
npm run daemon        # derlenmiş motoru çalıştır
```

Kaynak düzeni:

| Yol | İşlev |
|---|---|
| `src/daemon/` | Motor: `main`, `server`, `runner`, `gpu` |
| `src/protocol/` | Sözleşme ve kanal (`messages.ts`, `channel.ts`) |
| `src/client/` | `AjanEngine` istemcisi |
| `src/service.ts` | UI'dan bağımsız servis katmanı |
| `src/core/agent.ts` | Ajan döngüsü, araç kullanımı, olaylar |
| `src/engine/` | `LlamaEngine` ve model yöneticisi |
| `src/tools/` | Araç kayıt defteri ve uygulamaları |
| `src/config/` | Config yöneticisi ve tipler |

## Sorun giderme

**"AJAN motoru çalışmıyor (socket yok)"**
Motor ayakta değil. `npx ajan-engine` ile başlatın.

**EADDRINUSE / "motor zaten çalışıyor"**
Önceki motor süreci hâlâ dinliyor. `shutdown` isteği gönderin veya süreci sonlandırıp tekrar başlatın.

**`gpu.preferred = "cuda"` ama `gpu.active = "cpu"`**
Sürücü yok ya da CUDA native paketi kurulu değil. Sürücüyü kurup paketin doğru platform ikilisini içerdiğini doğrulayın.

**"Model tanımlı değil: <id>"**
Model kurulmamış. `installModel(id)` çağırın veya `listModels()` ile katalogdaki id'yi kontrol edin.

**Bağlantı açılıp kapanıyor (POSIX)**
Sahipsiz socket dosyası kalmış olabilir. Motor başlarken temizler; çalışan başka motor varsa dokunmaz.

**Protokol uyuşmazlığı**
`ajan` ve motor farklı sürümde. Motoru yeniden başlatın.

**Uzun süren ilk yanıt**
Model yükleme ve VRAM taşıma süresidir; `load-progress` olaylarıyla ilerleme raporlanır. `contextSize` çok büyükse bellek baskısı token üretimini yavaşlatır.

## Lisans

**Limited Source Human License (LSH-1)** — Sürüm 1.0
SPDX tanımlayıcısı: `LicenseRef-TakimCizgisi-LSH-1.0`

Telif sahibi: TakımÇizgisi Yazılım Geliştirme Grubu ve Topluluğu (2026).
Ayrıntılar için [LICENSE](LICENSE).
