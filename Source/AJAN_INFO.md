<div align="center">

# 🚀 AJAN YÖNETİM & DERLEME PANELİ

![NPM Version](https://img.shields.io/badge/npm-v1.0.0-CB3837?style=for-the-badge&logo=npm&logoColor=white)
![Build Status](https://img.shields.io/badge/build-errors-red?style=for-the-badge&logo=github-actions&logoColor=white)
![License](https://img.shields.io/badge/license-GNU_v3-blue?style=for-the-badge)

**Takım Çizgisi Ajan Modülleri Derleme ve Test Takip Sistemi**

---

</div>

## 📌 Genel Durum Özeti

| 🕒 Son Güncelleme | 🟢 Sistem Durumu | 📦 Toplam Modül | 🛠️ Otomasyon |
| :---: | :---: | :---: | :---: |
| `12.08.2026` | `Stabil Olmayan Sürüm` | `1` | `NOT READY` |

---

## 🛠️ Modül Detay Tablosu

### 📦 1. Derleme Süreçleri (`AJAN BUILDS`)
> NPM paketi oluşturma ve derleme adımlarını içerir.

| Modül | NPM Paketi | Versiyon | Durum | Tarih |
| :--- | :--- | :---: | :---: | :---: |
| ![Build](https://img.shields.io/badge/AJAN_BUILDS-007ACC?style=for-the-badge&logo=visualstudiocode&logoColor=white) | `@takimcizgisi/ajan` | `UNK` | ![Devam](https://img.shields.io/badge/Durum-Devam_Ediyor-yellow?style=for-the-badge) | `12.08.2026` |

---

### 📂 2. Kaynak Kod Takibi (`AJAN SOURCE`)
> Ana kod deposu, bağımlılıklar ve sürüm kontrolü.

| Modül | NPM Paketi | Versiyon | Durum | Tarih |
| :--- | :--- | :---: | :---: | :---: |
| ![Source](https://img.shields.io/badge/AJAN_SOURCE-181717?style=for-the-badge&logo=github&logoColor=white) | `@takimcizgisi/ajan` | `UNK` | ![Devam](https://img.shields.io/badge/Durum-Devam_Ediyor-yellow?style=for-the-badge) | `12.08.2026` |

---

### 🧪 3. Test ve Doğrulama (`AJAN TESTS`)
> Birim testleri, entegrasyon testleri ve kapsam raporları.

| Modül | NPM Paketi | Versiyon | Durum | Tarih |
| :--- | :--- | :---: | :---: | :---: |
| ![Tests](https://img.shields.io/badge/AJAN_TESTS-C21325?style=for-the-badge&logo=jest&logoColor=white) | `@takimcizgisi/ajan` | `UNK` | ![Devam](https://img.shields.io/badge/Durum-Devam_Ediyor-yellow?style=for-the-badge) | `12.08.2026` |

---

## ⚠️ Bilinen Sorunlar

### 🔴 TUI Arızası (Terminal User Interface)

Güncel versiyonlarda **Terminal UI (TUI)** bileşeninde sorunlar tespit edilmiştir:

- **Etkilenen Dosya:** `src/cli/tui.ts`
- **Durum:** ❌ Arızalı - Kullanılamaz durumda
- **Tarih:** `12.08.2026`
- **Açıklama:** TUI bileşeni tam işlevsel değildir. Bu bileşen içeren komutlar beklendiği gibi davranmayabilir.

**Çözüm Durumu:** Düzeltme yapılmaktadır. Gelecek sürümlerde giderilecektir.

---

### 🔴 Tool Bugları

Bazı araç (tool) çağrılarında kararlılık sorunları gözlemlenmiştir:

- **Etkilenen Araçlar:** `read_file`, `run_command`
- **Durum:** ❌ Arızalı - Beklenmeyen davranışlar mevcut
- **Tarih:** `12.08.2026`
- **Açıklama:** Özellikle `read_file` ve `run_command` araçları bazı senaryolarda hatalı sonuçlar döndürebilmekte veya takılabilmektedir.

**Çözüm Durumu:** İnceleniyor. Öncelikli düzeltme listesindedir.

---

### 🔴 Mantıksız Davranış (System Prompt Sadakati)

Ajan, bazı durumlarda bağlama uygun olmayan çıktılar üretebilmektedir:

- **Etkilenen Bileşen:** Davranış Motoru / Yönerge İşleme
- **Durum:** ⚠️ Tespit Edildi - Optimizasyon gerekli
- **Tarih:** `12.08.2026`
- **Açıklama:** Ajanın **System Prompt**'a aşırı sadık kalması nedeniyle mantıksız veya bağlam dışı yanıtlar üretebildiği gözlemlenmiştir. Bu kısıtlayıcı davranışın yakın zamanda kaldırılması planlanmaktadır.

**Çözüm Durumu:** İlgili davranışın kaldırılması/yeniden düzenlenmesi için planlama yapıldı. Yakın gelecekte güncellenecektir.

---

### 🔴 AI Yükleme Çubuğu Bug'ı

Kullanıcı arayüzündeki ilerleme göstergesinde görsel bir hata mevcuttur:

- **Etkilenen Bileşen:** CLI İlerleme Göstergesi (Progress Bar)
- **Durum:** ❌ Arızalı - Yanıltıcı gösterge
- **Tarih:** `12.08.2026`
- **Açıklama:** Yükleme çubuğu `0`'dan `1`'e ulaştığında modelin çalışmasının tamamlandığı varsayılıyor. Ancak bu, modelin işlemi tamamladığı anlamına gelmemektedir. Gösterge, gerçek süreçten bağımsız olarak dolmaktadır ve bu durum kullanıcıyı yanıltmaktadır.

**Çözüm Durumu:** Gösterge mantığının gerçek süreçle senkronize edilmesi için araştırma sürüyor.

---