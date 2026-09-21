# AJAN AI — Yapılacaklar (TODO)

> Bu liste üzerinden kaldığımız yerden devam ediyoruz.

## Yapısal durum (monorepo)

- [x] npm workspaces kuruldu: `packages/{core,vscode,ajan}`
- [x] `@takimcizgisi/core` = yerel AI motoru (discord dahil); `@takimcizgisi/ajan` (npm) = Electron GUI + paket yöneticisi
- [x] `ajan` VSCode uzantısı (marketplace id `takimcizgisi.ajan`, npm paketi `@takimcizgisi/ajan-vscode`), `@takimcizgisi/core`'a bağlı
- [ ] Electron GUI'yi gerçek makinede çalıştır (`npm run dev:electron`) — binary inme ortam ağına bağlı
- [ ] npx/electron-builder ilk paketleme + kurulum testi

## Yüksek öncelik (publish tamamlama)

- [ ] **npm publish doğrula** — `npm view @takimcizgisi/core version`, `npm dist-tag ls @takimcizgisi/core`
- [ ] **VSCode uzantısını npm'e yayınla** — `npm run release -- --publish-vscode` (`@takimcizgisi/ajan-vscode`)
- [ ] **npm'daki eski `@takimcizgisi/ajan` SDK paketini deprecate et** (SDK adı `@takimcizgisi/core`'a taşındı):
      `npm deprecate "@takimcizgisi/ajan@<0.4.0" "SDK artik @takimcizgisi/core olarak yayinlaniyor; @takimcizgisi/ajan artik Electron GUI + paket yoneticisi."`
- [ ] **Depoyu GitHub'a it**:
      `git init -b main && git add -A && git commit -m "AJAN monorepo: core + vscode + electron(ajan)" && git remote add origin https://github.com/takimcizgisi/ajan.git && git push -u origin main`
- [ ] **VSIX'i release'e yükle** — `releases/latest/download/ajan-0.4.0.vsix`

## Orta öncelik

- [ ] **İNCE VSIX refactorü**:
  - `packages/vscode/esbuild.mjs`'te `@takimcizgisi/core` `external` (yapıldı)
  - `ajanService.ts`: core'u runtime'da çöz → `npm root -g` + `dynamic import(file:///...)` (Electron paket yöneticisi yönetim dizininden)
  - Sonuç: VSIX küçülür; node-llama-cpp `~/.ajan/packages` altından çözülür
- [ ] **Paket yöneticisi** (`packages/ajan/src/main/pm.ts`): yönetim dizini kur/güncelle akışını gerçek kayıt defteriyle test et

## Düşük öncelik

- [ ] `packages/vscode/node_modules` ve `.vscodeignore` ile VSIX küçült / bundle et
- [ ] `npm pkg fix` (repository.url normalize — opsiyonel temizlik)

## Notlar

- Kök `package.json` `allowScripts`: `node-llama-cpp`, `esbuild`, `electron`.
- Paketler bağımsız sürüm tutar; kök `scripts/release.mjs` sırayı yönetir.
- `install.bat` / `install.sh` henüz elektron yapısına göre güncellenmedi (CRLF dikkat!).