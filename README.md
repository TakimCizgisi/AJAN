# ![AJAN Logo](./Assets/AJAN_LOGO.svg)

**AJAN**, yerel makinenizde çalışan, **Gemma tabanlı** açık kaynak bir yapay zeka kodlama ajanıdır. CLI (Terminal) arayüzü ile yazılım geliştirmeyi, kod analizi yapmayı, hata ayıklamayı ve karmaşık görevleri otomatikleştirmeyi sağlar.

> 📊 **Derleme Durumu ve Yönetim:** Detaylı bilgi için **[AJAN_INFO.md](./Source/AJAN_INFO.md)** sayfasını ziyaret edin.

---

# ✨ Özellikler

- 🤖 **Yerel AI Motoru** – Node-llama-cpp ile tamamen çevrimdışı çalışır.
- 💻 **CLI Arayüzü** – Modern ve kullanıcı dostu terminal deneyimi.
- 🔄 **Çoklu Modlar** – Chat, Plan, Build ve Devamlılık modları.
- ⚡ **Hızlı Yanıtlar** – İnternet gecikmesi olmadan yerel işlem.
- 🛠️ **Araç Entegrasyonu** – Dosya, terminal, web ve patch araçları.
- 📦 **Kolay Kurulum** – Kurulumdan sonra ek yapılandırma gerektirmez.
- 🔒 **Gizlilik Odaklı** – Verileriniz cihazınızdan çıkmaz.

---

# 🖥️ Teknik Bilgiler

| Özellik | Bilgi |
|---------|-------|
| Model | Gemma 4 (GGUF) |
| Çalışma Şekli | Tamamen Yerel |
| AI Motoru | node-llama-cpp |
| RAM / VRAM | Yaklaşık 4 GB |
| Bağlam Penceresi | 128K Token |
| Platform | Windows, Linux, macOS |
| Dil | TypeScript |

---

# 📥 Kurulum

## Gereksinimler

- Node.js 18 veya daha yeni
- npm veya yarn

## Kurulum

```bash
git clone https://github.com/takimcizgisi/ajan.git

cd AJAN/Source

npm install

npm run build

npm start
```

---

# 🚀 Kullanım

## Geliştirme

```bash
npm run dev
```

## Chat Modu

```bash
npm run dev:chat
```

## Doctor

```bash
npm run doctor
```

---

# 📋 Komutlar

| Komut | Açıklama |
|--------|----------|
| `/help` | Yardımı göster |
| `/mode` | Mod değiştir |
| `/clear` | Sohbet geçmişini temizle |
| `/exit` | Programdan çık |

---

# ⌨️ Kısayollar

| Tuş | İşlev |
|------|-------|
| TAB | Mod değiştir |
| ↑ / ↓ | Geçmiş mesajlar |
| Page Up / Down | Kaydır |
| Ctrl + C | Çıkış |

---

# 📂 Proje Yapısı

```text
Source/
├── src/
│   ├── index.ts
│   ├── cli/
│   │   ├── index.ts
│   │   └── tui.ts
│   ├── config/
│   ├── core/
│   ├── engine/
│   └── tools/
├── config/
└── package.json
```

---

# 📸 Ekran Görüntüleri

## Terminal

![TUI Interface](./Assets/tui-interface.png)

## Komut Menüsü

![TUI Commands](./Assets/tui-commands.png)

## Chat

![TUI Chat](./Assets/tui-chat.png)

---

# 🤝 Katkıda Bulunma

Katkılar her zaman memnuniyetle karşılanır.

1. Repository'yi Fork edin.
2. Yeni bir Branch oluşturun.
3. Değişikliklerinizi yapın.
4. Açıklayıcı Commit mesajları kullanın.
5. Pull Request gönderin.

---

# ⚖️ Lisans

Bu proje **GNU General Public License v3.0 (GPL-3.0)** lisansı ile yayımlanmaktadır.

Lisans metni için **[LICENSE](./LICENSE)** dosyasına bakabilirsiniz.

---

# ⚠️ Sahiplik ve Telif Hakkı

Bu projenin orijinal geliştiricisi **İbrahim Anadol** olup, **TakımÇizgisi Yazılım Geliştirme Grubu** tarafından geliştirilmektedir.

GPL lisansı kapsamında bu projeyi;

- ✅ Kullanabilirsiniz.
- ✅ İnceleyebilirsiniz.
- ✅ Değiştirebilirsiniz.
- ✅ Dağıtabilirsiniz.

Ancak;

- ❌ Projenin orijinal sahibi olduğunuzu iddia edemezsiniz.
- ❌ Geliştirici bilgilerini kaldırarak kendi projenizmiş gibi yayımlayamazsınız.
- ❌ "AJAN" adını veya marka kimliğini resmi proje gibi kullanamazsınız.

Bu projeyi veya herhangi bir bölümünü hukuka aykırı şekilde sahiplenmeniz, telif hakkını ihlal etmeniz veya yanıltıcı ticari kullanım gerçekleştirmeniz durumunda, yürürlükteki fikri mülkiyet ve telif hakkı mevzuatı kapsamında gerekli hukuki işlemler başlatılabilir.

> **Not:** GPL lisansı yazılım özgürlüğü sağlar; telif hakkı sahipliğini devretmez.

---

# 👨‍💻 Geliştirici

**İbrahim Anadol**

TakımÇizgisi Yazılım Geliştirme Grubu

© 2026 İbrahim Anadol. Tüm hakları saklıdır.