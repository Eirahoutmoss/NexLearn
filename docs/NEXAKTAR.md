# NexAktar protokolü (sürüm 1)

NexAktar, herhangi bir telefondan (Android, iPhone ya da tarayıcısı olan herhangi bir cihaz) NexLearn masaüstü uygulamasına **aynı yerel ağ üzerinden** dosya göndermek, ters yönde de dosya almak için kullanılan açık ve basit bir protokoldür. Telefona uygulama kurmak gerekmez; tarayıcı yeterlidir.

## Akış

1. Kullanıcı masaüstünde **Kaynak ekle → Telefondan gönder → QR kod oluştur** düğmesine basar.
2. Uygulama yerel ağ adresinde, **rastgele bir portta** küçük bir HTTP sunucusu açar ve 128 bitlik tek kullanımlık bir anahtar üretir.
3. QR kod şu adresi taşır: `http://<yerel-ip>:<port>/?t=<anahtar>`
4. Telefon QR kodu okutur, açılan sayfadan dosya seçer, sayfanın fotoğrafını çeker ya da metin gönderir.
5. Gelen her dosya masaüstünde **onay bekler**. Kabul edilen dosya normal içe aktarma akışına girer (PDF, EPUB, görsel, metin, `.nexpack`). Reddedilen dosya silinir.
6. Oturum en geç **10 dakika** sonra (ya da kullanıcı kapatınca) kendiliğinden kapanır; bekleyen dosyalar silinir.

## Uç noktalar

Tüm isteklerde `t` sorgu parametresi zorunludur. Yanlış ya da eksik anahtar `403` döner; 20 hatalı denemeden sonra oturum kapanır.

| Yöntem | Yol | Açıklama |
|---|---|---|
| `GET` | `/?t=` | Telefon sayfası (tek dosya HTML, dış kaynak yok). |
| `GET` | `/ping?t=` | `{"ok":true,"remaining":<saniye>}` |
| `POST` | `/u?t=` | Dosya yükleme. Gövde ham bayt. Ad `X-Name` başlığında, `encodeURIComponent` ile kodlanmış UTF-8. En çok 300 MB. Yanıt `{"ok":true,"id":"…"}` |
| `POST` | `/text?t=` | Düz metin (UTF-8, en çok 1 MB). `.txt` kaynağı olarak gelir. |
| `GET` | `/o?t=` | Masaüstünün telefona sunduğu dosyalar: `[{"id","name","size"}]` |
| `GET` | `/o/<id>?t=` | Sunulan dosyayı indirir (`Content-Disposition: attachment`). |

Hata yanıtları: `413` (çok büyük), `429` (oturum başına 300 dosya sınırı), `400` (boş gövde), `404`.

## Güvenlik modeli

- **Kullanıcı başlatır, süre sınırlıdır.** Sunucu yalnızca düğmeyle açılır; arka plan hizmeti, otomatik başlatma ya da kalıcı port yoktur. Bu, antivirüs ve güvenlik duvarı sezgileri açısından da en temiz yoldur.
- **Yalnızca yerel ağ.** Sunucu bilgisayarın yerel ağ adresine bağlanır (tüm arayüzlere değil). Özel ağ dışındaki (10/8, 172.16/12, 192.168/16, 169.254/16, IPv6 ULA ve link-local dışında) adreslerden gelen istekler reddedilir.
- **Tek kullanımlık anahtar.** 128 bit rastgele; sabit sürede karşılaştırılır.
- **Onaysız hiçbir şey kitaplığa girmez.** Dosyalar önce uygulamanın kendi klasöründe (`%LOCALAPPDATA%\com.eirahoutmoss.nexlearn\aktar`) bekler.
- **Dosya adları temizlenir.** Yol ayırıcıları, denetim karakterleri ve Windows'ta geçersiz karakterler atılır; uzunluk 120 karakterle sınırlanır. Dosya içeriği, uzantıya değil sihirli baytlara göre tanınır (içe aktarma kuralları).
- **Telefon sayfası sıkı CSP ile sunulur:** `default-src 'none'`, yalnızca aynı kaynağa bağlantı, çerçeveye alınamaz, önbelleğe alınmaz.

### Bilinen sınırlar

- Bağlantı yerel ağda **HTTP**'dir. Aynı Wi-Fi'deki biri trafiği dinleyebilirse dosyaları görebilir. Tarayıcılar yerel IP adreslerinde güvenli bağlam (HTTPS) sağlamadığı için sayfa içinde uçtan uca şifreleme (WebCrypto) kullanılamaz. Bu yüzden: kısa ömür, tek kullanımlık anahtar, her dosya için onay. Halka açık Wi-Fi'de kullanılması önerilmez.
- Windows ilk kullanımda güvenlik duvarı izni sorar. Yalnızca **Özel ağlar** seçilmelidir.
- Misafir ağları ve bazı kurumsal ağlar cihazların birbirini görmesini engeller (istemci yalıtımı). Bu durumda telefonun kişisel erişim noktası (hotspot) kullanılabilir.

## Başka istemciler

Protokol herhangi bir HTTP istemcisiyle kullanılabilir. Örnek (bilgisayardaki adresi ve anahtarı QR koddan alın):

```sh
curl -H "X-Name: $(python3 -c 'import urllib.parse;print(urllib.parse.quote("ödev.pdf"))')" \
     --data-binary @ödev.pdf "http://192.168.1.20:53124/u?t=<anahtar>"
```

## Sürümleme

Bu belge protokolün 1. sürümüdür. Geriye uyumsuz değişiklikler yeni yollarla (`/v2/...`) yapılır.
