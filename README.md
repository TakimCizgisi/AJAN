# AJAN – Otonom AI Kodlama Ajanı

AJAN, yerel makinenizde çalışan, Llama tabanlı bir yapay zeka kodlama ajanıdır. CLI arayüzü ile yazılım geliştirmeyi, kod analizi yapmayı ve karmaşık görevleri otomatikleştirmeyi sağlar.

> 📊 **Derleme Durumu ve Yönetim:** Detaylı bilgi için [AJAN_INFO.md](./Source/AJAN_INFO.md) sayfasını ziyaret edin.

## Özellikler

- 🤖 **Yerel AI Motoru** – Node-llama-cpp ile tamamen yerel çalışır
- 💻 **CLI Arayüzü** – Kullanıcı dostu terminal uygulaması
- 🔄 **Çoklu Modlar** – Chat, Plan, Build ve Devamlılık modları
- ⚡ **Hızlı Yanıtlar** – Ağ gecikmesi olmadan anında işlem
- 🛠️ **Araç İntegrasyonu** – Dosya, terminal, web ve patch araçları

## Kurulum

### Gereksinimler
- Node.js 18.0.0 veya daha yeni sürüm
- npm veya yarn

### Adımlar

```bash
# Repository'i klonla
git clone https://github.com/takimcizgisi/ajan.git
cd AJAN/Source

# Bağımlılıkları yükle
npm install

# Projeyi derle
npm run build

# CLI'yi çalıştır
npm start
```

## Kullanım

### Geliştirme Modu

```bash
# Chat modunda başla
npm run dev:chat

# Doctor modunu çalıştır
npm run doctor

# Doğrudan başlat
npm run dev
```

### Komutlar

- `/mode` – Mod değiştir (chat, plan, build, devamlılık)
- `/clear` – Konuşma geçmişini temizle
- `/help` – Komutları listele
- `/exit` – Programdan çık

### Kısayollar

- `TAB` – Mod döngüsü
- `Ctrl+C` – Çık
- `Page Up/Down` – Kaydır
- `↑/↓` – Geçmiş arasında gezin

## Yapı

```
Source/
├── src/
│   ├── index.ts              # Ana giriş noktası
│   ├── cli/                  # CLI uygulaması
│   │   ├── index.ts
│   │   └── tui.ts            # Terminal UI
│   ├── config/               # Konfigürasyon
│   ├── core/                 # Temel ajanı mantığı
│   ├── engine/               # AI motoru
│   └── tools/                # Araçlar ve entegrasyonlar
├── config/                   # Model konfigürasyonları
└── package.json
```

## Katkı

Katkılar memnuniyetle karşılanır! Lütfen değişikliklerinizi açıklayıcı commit mesajları ile gönderin.

## Lisans

Apache 2.0 – Detaylar için [LICENSE](./LISANCE) dosyasına bakın.

---

**Geliştirici:** İbrahim Anadol ve TakımÇizgisi Yazılım Geliştirme Grubu  
**Son Güncelleme:** 2026