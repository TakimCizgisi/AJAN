"AJAN Logo" (./Assets/AJAN_LOGO.svg)

AJAN, yerel makinenizde çalışan, Gemma tabanlı açık kaynak bir yapay zeka kodlama ajanıdır. CLI (Terminal) arayüzü ile yazılım geliştirmeyi, kod analizi yapmayı, hata ayıklamayı ve karmaşık görevleri otomatikleştirmeyi sağlar.

«📊 Derleme Durumu ve Yönetim: Detaylı bilgi için "AJAN_INFO.md" (./Source/AJAN_INFO.md) sayfasını ziyaret edin.»

---

✨ Özellikler

- 🤖 Yerel AI Motoru – Node-llama-cpp ile tamamen çevrimdışı çalışır.
- 💻 CLI Arayüzü – Modern ve kullanıcı dostu terminal deneyimi.
- 🔄 Çoklu Modlar – Chat, Plan, Build ve Devamlılık modları.
- ⚡ Hızlı Yanıtlar – İnternet gecikmesi olmadan yerel işlem.
- 🛠️ Araç Entegrasyonu – Dosya, terminal, web ve patch araçları.
- 📦 Kolay Kurulum – Kurulumdan sonra ek yapılandırma gerektirmez.
- 🔒 Gizlilik Odaklı – Verileriniz cihazınızdan çıkmaz.

---

🖥️ Teknik Bilgiler

Özellik| Bilgi
Model| Gemma 4 (GGUF)
Çalışma Şekli| Tamamen Yerel
AI Motoru| node-llama-cpp
RAM / VRAM| Yaklaşık 4 GB
Bağlam Penceresi| 128K Token
Platform| Windows, Linux, macOS
Dil| TypeScript

---

📥 Kurulum

Gereksinimler

- Node.js 18 veya daha yeni
- npm veya yarn

Kurulum

git clone https://github.com/takimcizgisi/ajan.git

cd AJAN/Source

npm install

npm run build

npm start

---

🚀 Kullanım

Geliştirme

npm run dev

Chat Modu

npm run dev:chat

Doctor

npm run doctor

---

📋 Komutlar

Komut| Açıklama
"/help"| Yardımı göster
"/mode"| Mod değiştir
"/clear"| Sohbet geçmişini temizle
"/exit"| Programdan çık

---

⌨️ Kısayollar

Tuş| İşlev
TAB| Mod değiştir
↑ / ↓| Geçmiş mesajlar
Page Up / Down| Kaydır
Ctrl + C| Çıkış

---

📂 Proje Yapısı

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

---

📸 Ekran Görüntüleri

Terminal

"TUI Interface" (./Assets/tui-interface.png)

Komut Menüsü

"TUI Commands" (./Assets/tui-commands.png)

Chat

"TUI Chat" (./Assets/tui-chat.png)

---

🤝 Katkıda Bulunma

Katkılar her zaman memnuniyetle karşılanır.

1. Fork oluşturun.
2. Yeni bir branch açın.
3. Değişikliklerinizi yapın.
4. Açıklayıcı commit mesajı yazın.
5. Pull Request gönderin.

---

⚖️ Lisans

Bu proje GNU General Public License v3.0 (GPL-3.0) lisansı ile yayımlanmaktadır.

Lisansın tam metni için "LICENSE" (./LICENSE) dosyasına bakabilirsiniz.

---

⚠️ Sahiplik ve Marka Bildirimi

Bu projenin orijinal geliştiricisi İbrahim Anadol olup, TakımÇizgisi Yazılım Geliştirme Grubu tarafından geliştirilmektedir.

GPL lisansı kapsamında;

- ✅ Projeyi kullanabilirsiniz.
- ✅ İnceleyebilirsiniz.
- ✅ Değiştirebilirsiniz.
- ✅ Dağıtabilirsiniz.

Ancak;

- ❌ Bu projenin orijinal sahibi olduğunuzu iddia edemezsiniz.
- ❌ Geliştirici bilgilerini kaldırıp projeyi kendi eseriniz olarak yayımlayamazsınız.
- ❌ "AJAN" ismini veya proje kimliğini izinsiz şekilde resmi proje gibi kullanamazsınız.

Telif hakkı, marka hakkı veya diğer fikri mülkiyet haklarının ihlal edilmesi durumunda ilgili ülkenin yürürlükteki mevzuatı kapsamında gerekli hukuki işlemler başlatılabilir.

«Not: GPL lisansı yazılım özgürlüğü sağlar; ancak telif hakkı sahipliğini devretmez ve bir kişinin projeyi kendi orijinal çalışması gibi göstermesine izin vermez.»

---

👨‍💻 Geliştirici

İbrahim Anadol

TakımÇizgisi Yazılım Geliştirme Grubu

© 2026 İbrahim Anadol. Tüm hakları saklıdır.