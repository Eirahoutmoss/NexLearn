# Ürün Şartnamesi (özet)

Ana referans: [NEXLEARN_VISION.md](NEXLEARN_VISION.md). Bu belge, 0.1.0 sürümünde **gerçekten uygulanan** kapsamı ve bilinen sınırlamaları özetler.

## Ürün vaadi
Kişisel bilgilerini içeri al. Oku, anla, bağlantılar kur, hatırla ve uygula. Öğrenme birikimin sana ait kalsın.

## Bağlayıcı ilkeler ve karşılıkları
| İlke | Uygulama |
|---|---|
| Ücretsiz, reklamsız, hesapsız | Hesap/e-posta/ödeme ekranı yok; reklam/telemetri SDK’sı yok |
| Yerel öncelik | Tüm veri IndexedDB’de; PWA service worker ile çevrimdışı açılış (e2e testli) |
| Veri sahipliği | JSON/Markdown/CSV dışa aktarma, doğrulanan ZIP yedek, geri yükleme, tüm veriyi silme |
| Kaynak disiplini | Kart/kavram/not kaynağa (segment + sayfa) bağlanır; kopuk bağlantı açıkça gösterilir |
| Şeffaf otomasyon | MVP’de otomatik öneri yok; veri modeli `provenance` ve `userConfirmed` taşır, arayüz önerileri kesikli çizgiyle ayırır |
| Dürüst ölçüm | Okuma, anlık/gecikmeli hatırlama ve uygulama ayrı gösterilir; veri yoksa “—” (sahte %0 yok) |
| Bağımsız modüller | Her modül tek başına kullanılabilir; akış sihirbaz değildir |
| Erişilebilirlik | WCAG 2.2 AA hedefi: axe testleri 3 temada, klavye, ekran okuyucu etiketleri, %200 yakınlaştırma testi |

## Kullanıcı hikâyeleri (MVP) ve durum
1. PDF’i içe aktar, oku, işaretle, ertesi gün kaldığın yerden devam et — **tamam**
2. Bir paragraftan hatırlama kartı oluştur — **tamam** (seçimden veya paragraftan, kısayol `C`)
3. Notlardan kavram haritası hazırla, kavramdan kaynağa dön — **tamam**
4. Bir bölümden kaynaklı çalışma sorusu oluştur, sorunun sayfasını gör — **tamam** (kart türü “Çalışma sorusu”)
5. Bir hafta sonra kartları tekrar et, zor konuları belirle — **tamam** (zor kartlar listesi, 1+ hafta hatırlama metriği)
6. Kaynak, not, kart ve ilerleme verilerini dışa aktar — **tamam**
7. İnternet yokken çalış — **tamam** (web/PWA; masaüstü zaten yerel)
8. Yeni cihazda yedeği geri yükle — **tamam** (ZIP/JSON, isteğe bağlı şifreli)

## Görsel konsept uyarlamaları
Konsept panosu referans alınmış; şu bilinçli farklar uygulanmıştır (gerekçeler `DECISIONS.md` ADR-009):
- Turuncu yazı/düğmeler kontrast için koyulaştırıldı (beyaz üzerinde ≥ 4.5:1).
- “Profil” sekmesi ve avatar yok (hesapsız ürün). Mobil alt menüde “Diğer”.
- Tekrar düğmeleri (Tekrar/Zor/Normal/Kolay) SM-2 puanlarına eşlendi (1/3/4/5).
- Tek “Doğruluk %” yerine anlık, 1+ gün ve 1+ hafta hatırlama ayrı.
- Günlük hedefler isteğe bağlı ve varsayılan kapalı; seri tutulmaz.
- Kamera/mikrofon/ses simgeleri yok: OCR ve ses/video sonraki aşama; çalışmayan düğme konmadı.
- Manzara görselleri tema token’larından üretilen özgün SVG’lerdir; fotoğraf/dış görsel kullanılmaz.
- Yüksek Kontrast teması eklendi.

## Bilinen sınırlamalar (0.1.0)
- OCR, EPUB, web sayfası, ses/video transkripsiyonu yok (Aşama 7).
- Otomatik kavram/soru önerisi ve model entegrasyonu yok (bilinçli; temel döngü modelsiz).
- Geri yükleme yalnızca “değiştir” modunda (birleştirme yok); öncesinde otomatik anlık görüntü alınır.
- Cihazlar arası senkronizasyon yok.
- Masaüstü: yalnızca Windows paketlenir (Tauri). Android (Capacitor) planlı.
- Not kaynağı düzenlenince metni değişen paragraflardaki vurgular kopuk görünebilir.
- Çok sayfalı (10.000+ paragraf) belgelerde okuma alanı sanallaştırılmaz; `content-visibility` ile hafifletilir.
- Kısayol yeniden atama yalnızca okuma ve tekrar eylemleri için; gezinme dizileri (G H…) sabittir.
- Parola korumalı PDF’lerde sayfa görünümü açılmaz (metin görünümü çalışır; parola saklanmadığı için).
