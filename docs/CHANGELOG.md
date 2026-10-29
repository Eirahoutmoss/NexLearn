# Değişiklik Günlüğü

Biçim: [Keep a Changelog](https://keepachangelog.com/tr/1.1.0/) · Sürümleme: SemVer

## [0.2.0] — yayımlanmadı
### Eklendi
- **OCR:** taranmış PDF ve görsellerdeki yazı cihaz üzerinde tanınır (Türkçe, İngilizce).
- **EPUB** içe aktarma (DRM'siz).
- **Öğrenme bilimi:** sınav provası, eminlik kalibrasyonu, karışık tekrar, kavram haritasında hatırlama katmanı, Feynman anlatım denetimi, modelsiz kavram önerileri.
- **NexAktar:** telefondan yerel ağ üzerinden QR kodla dosya/fotoğraf/metin gönderme ve telefona dosya verme.
- **Paylaşım paketleri (.nexpack):** çalışma grubu ve sürümlü kurumsal bilgi tabanı.
- **Eşli öğrenme:** meydan okuma ve cevap dosyaları.
- **Android uygulaması:** paylaş menüsü, “Birlikte aç”, doğrulamalı uygulama içi güncelleme.
- **Zihin:** isteğe bağlı, cihaz üzerinde çalışan yerel yapay zekâ (kart önerisi, basit açıklama, anlatım değerlendirmesi).
### Değişti
- Güncellemeler uygulamanın kendi veri klasörüne iner; kurulum türüne (MSI/NSIS) uygun dosya seçilir; uygulama dışı sürüm etiketleri yok sayılır.
- Veri şeması 1.2.0 (geriye uyumlu eklemeler).
- Geliştirici bilgileri ve Hakkında bölümü; depo yalnızca tek geliştirici.

## [0.1.0] — 2026-10-29
### Eklendi
- İlk MVP: kaynak içe aktarma (PDF, TXT, Markdown, yapıştırma, not, görsel), NexRead okuma alanı, NexMemory kartları ve `sm2-v1` aralıklı tekrar, NexÖğren kavram haritası ve uygulama görevleri, ilerleme ekranı.
- JSON/Markdown/CSV dışa aktarma; doğrulanan ve isteğe bağlı şifreli ZIP yedek; geri yükleme ve geri alma.
- 6 tema + sistem teması, renk tonları, TR/EN arayüz, komut paleti, özelleştirilebilir kısayollar, PWA çevrimdışı çalışma.
- Tauri 2 Windows paketi ve düğmeyle güncelleme (SHA-256 doğrulamalı).
