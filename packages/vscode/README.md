# AJAN AI — VSCode Uzantısı

AJAN AI'nin VSCode entegrasyonu. Otonom yerel AI kodlama asistanı: yerel LLM (node-llama-cpp) ile sohbet, kod görevleri ve araç desteği.

## Özellikler

- **Sohbet paneli**: Copilot benzeri, VSCode'un aktif temasıyla uyumlu sohbet görünümü. AJAN marka vurgusu (turuncu `#ff751f`, cyan `#00e5ff`), logo ve Anton fontu kullanılır.
- **Model yönetimi**: Model kurma, kaldırma, kullanma ve listeyi yenileme.
- **Oturum parametreleri**: Temperature, maks. adım sayısı.
- **AKA sistem**: AJAN'ın kendi API katmanı (`AjanService`, `@takimcizgisi/core` paketi) aynen kullanılır; model dosyaları `~/.ajan` içinde GUI/Electron ile paylaşılır.

## Gereksinimler

- VS Code `^1.95.0` (ESM uzantı desteği)
- Node.js — paket bağımlılıkları `npm install` ile otomatik gelir (`@takimcizgisi/core` ve `node-llama-cpp`).

## Geliştirme

```bash
cd packages/vscode
npm install          # AJAN motoru (node-llama-cpp dahil) otomatik kurulur
npm run build        # out/extension.js üretir
```

VS Code'da `packages/vscode` klasörünü açın ve <kbd>F5</kbd> ile Extension Development Host'ta çalıştırın (repo kökündeki `.vscode/launch.json` hazır).

## Paketleme

```bash
npm run package      # ajan-<sürüm>.vsix
```

VSIX paketlenirken `@takimcizgisi/core` ve native `node-llama-cpp` modülü node_modules ağacından otomatik dahil edilir.

Uzantı adı `ajan`'dır (marketplace kimliği `takimcizgisi.ajan`). npm sürümü ise
`@takimcizgisi/ajan-vscode` adıyla yayınlanır: `npm run release -- --publish-vscode` (repo kökünde).

## Ayarlar

Tüm ayarlar menüsünde `ajan.*` ön ekiyle bulunur: model id, GPU ark ucu/katman, context boyutu, temperature, maks. adım, zaman aşımları.

## Yapı

```
packages/vscode/
├── package.json        # Uzantı manifesti (komutlar, görünümler, ayarlar)
├── esbuild.mjs         # ESM bundle yapılandırması (@takimcizgisi/core external)
├── src/
│   ├── extension.ts    # Aktivasyon + komutlar
│   ├── panel.ts        # WebView paneli
│   ├── ajanService.ts  # AjanService sarmalayıcı (AJAN API)
│   └── backend.ts      # WebView ⇄ servis köprüsü
└── media/
    ├── style.css       # VSCode tema değişkenleri + AJAN markası
    ├── chat.js         # WebView istemci mantığı
    └── assets/         # logo, SVG markası, Anton fontu
```