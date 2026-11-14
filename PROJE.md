# Kehanet Postası · Proje Bilgileri

GDG On Campus Selçuk etkinlikleri için hazırlanmış **gazete temalı fotoğraf kabini**. Ziyaretçi kameranın karşısına geçer, 3-2-1 geri sayımın ardından kısa bir çekim yapılır ve sonuç, eski bir gazete sayfasının içinde sepya tonlu, titreşen **hareketli GIF** olarak sunulur. GIF indirilebilir ya da QR kod ile telefona gönderilebilir.

> Kurulum ve yayınlama adımları için [README.md](README.md) dosyasına bak. Bu dosya projenin yapısını, akışını ve teknik kararlarını özetler.

## Özet

| | |
|---|---|
| Ad | Kehanet Postası · Fotoğraf Kabini |
| Dil / arayüz | Türkçe (`lang="tr"`) |
| Teknoloji | HTML + CSS + vanilla JS (ES module). Build adımı, bundler ya da kendi backend'i yok |
| GIF kodlama | [gifenc](https://github.com/mattdesl/gifenc) (MIT), tarayıcıda Web Worker içinde |
| Paylaşım altyapısı | Supabase Storage (public bucket) + GitHub Actions ile otomatik temizlik |
| Yayın | GitHub Pages: `https://tkara0.github.io/gdg-gazete` (`js/config.js` içindeki `SITE_URL`) |
| Depo | Git, ana dal `main` |
| Çevrimdışı | Fontlar ve tüm kütüphaneler yerel; paylaşım dışında internet gerekmez |

## Kullanıcı akışı

1. Sayfa açılır, kamera izni istenir (yalnızca https ya da `localhost`'ta çalışır).
2. Ziyaretçi isteğe bağlı olarak adını yazar; ad, fotoğraf altı yazısındaki `{isim}` yerine geçer (boşsa "Okurumuz").
3. **POZ VER** butonu ya da **Boşluk / Enter** ile 3 sn geri sayım başlar (sesli bip).
4. Flaş + deklanşör sesiyle seçilen süre kadar (1,5–3 sn, 10 FPS) kare yakalanır.
5. Kareler Web Worker'da GIF'e kodlanır ("BASKIYA GİRİYOR %xx").
6. **Sonuç ekranı** açılır: GIF önizleme, indirme bağlantısı, "Telefonuma gönder", "Yeni poz", "Kapat".
7. "Telefonuma gönder" → GIF Supabase'e yüklenir, **kupon** biçiminde bir QR kod gösterilir. Telefonda QR okutulunca `al.html` açılır ve GIF kaydedilir / paylaşılır.
8. Sonuç ekranı 45 sn etkileşimsiz kalırsa kendiliğinden kapanır (son 10 sn geri sayım görünür). Kabin 60 sn kullanılmazsa fotoğrafın altında "POZ VERMEK İÇİN BOŞLUĞA BAS" yazısı yanıp söner.

Ek özellikler: "Başka manşet" (rastgele manşet değiştirir), tam ekran, oturum geçmişi (son 8 baskı, yalnızca bellekte), kamera seçimi, ayna görüntüsü, ileri-geri (ping-pong) döngü.

## Dosya yapısı

```
├── index.html              Ana kabin sayfası (canvas, panel, sonuç ekranı, ayarlar diyaloğu)
├── al.html                 Telefon sayfası: QR'dan gelen GIF'i gösterir, kaydet/paylaş
├── README.md               Kurulum ve yayınlama rehberi
├── PROJE.md                Bu dosya
├── css/
│   ├── style.css           Kabin arayüzü
│   ├── al.css              Telefon sayfası
│   └── fonts.css           @font-face tanımları (yerel woff2)
├── js/
│   ├── main.js             Başlatma, ana döngü, çekim akışı, sonuç ekranı, paylaşım arayüzü
│   ├── newspaper.js        Statik gazete katmanı çizimi (600×800 mantıksal koordinat)
│   ├── effects.js          Fotoğraf efekti: sepya, gren, vinyet, titreme, çizik, toz
│   ├── recorder.js         Geri sayım, kare yakalama, WebAudio sesleri, ekran üstü çizimler
│   ├── camera.js           getUserMedia, kamera listesi, hata mesajları
│   ├── settings.js         Ayarlar diyaloğu, localStorage, manşet listesi, varsayılanlar
│   ├── share.js            Supabase girişi, GIF yükleme, ID üretimi, QR çizimi, hata sınıflandırma
│   ├── gif-worker.js       Web Worker: palet çıkarma + GIF kodlama
│   ├── al.js               Telefon sayfası mantığı (yalnızca fetch)
│   ├── config.js           Supabase URL, publishable anahtar, site adresi, bucket, süre
│   └── vendor/             gifenc (yamalı), supabase-js 2.45.4 (UMD), qrcode-generator 1.4.4
├── fonts/                  Grenze Gotisch, Libre Caslon Display, Old Standard TT + OFL lisansları
├── assets/                 GDG On Campus Selçuk logoları (panel için renkli, gazete için tek ton)
├── supabase/kurulum.sql    Bucket ve RLS politikası kurulumu (SQL Editor'de çalıştırılır)
├── scripts/temizlik.mjs    Eski GIF'leri silen Node betiği
└── .github/workflows/temizlik.yml   Her 10 dakikada çalışan temizlik workflow'u
```

## Mimari

### Görüntü hattı
- `index.html` içinde tek bir `<canvas id="page">` vardır; sayfa 600×800 **mantıksal** koordinatta tasarlanır ve cihaz piksel oranına göre ölçeklenir.
- İki katman: **statik katman** (gazete başlığı, manşet, metinler, logo; `newspaper.js`) yalnızca ayar/ad/manşet değişince yeniden çizilir; **fotoğraf katmanı** her karede `effects.js` ile işlenir. İkisi `composite()` içinde birleştirilir.
- Fotoğraf alanı (`PHOTO`: x37 y277 526×398) kameranın "cover" mantığıyla kırpılmış görüntüsünü alır.
- Efekt (`renderPhoto`): luminans → kontrast + gren (4 önceden üretilmiş gürültü tablosu, seed'li PRNG) → vinyet → kare başına titreme → sepya renk eşlemesi → %40 ihtimalle dikey çizik + birkaç toz noktası. Önizleme 12 tick/sn, GIF karelerinde gren daha düşüktür.
- Ana döngü kodlama ve sonuç aşamasında efekti durdurur, yalnızca gerektiğinde yeniden çizer.

### Durum makinesi
`phase`: `idle → countdown → capture → encoding → result → idle`. `camera`: `opening | ready | error`. Meşgul fazlarda ad girişi, butonlar ve ayarlar kilitlenir.

### GIF üretimi
- Çekim doğrudan **GIF ölçeğinde** yapılır (arşiv GIF'i varsayılan 480 px genişlik; seçenekler 360 / 480 / 600).
- `gif-worker.js`: tek global palet (tam sayfa ilk kare + orta fotoğraf karesi + logo bölgesi 4 kez, logo renkleri bozulmasın diye). İlk kare tam sayfa, sonraki kareler yalnızca fotoğraf bölgesi (`x, y` ofsetli, `dispose: 1`) → dosya küçülür. Ping-pong'da aynı kare iki kez indekslenmez.
- Tek işçi sayfa açılışında oluşturulur, işler sırayla (`gifQueue`) çalışır; işçi ölürse sonraki işte yeniden oluşturulur. Hatalar Türkçe kullanıcı mesajına çevrilir (çevrimdışıyken işçi yüklenemezse farklı mesaj).
- **Telefon GIF'i** (varsayılan 360 px, ~1,3 MB; 480 px ~2,3 MB) aynı karelerden ölçeklenerek, statik katman o genişlikte yeniden çizilerek üretilir. Arşiv GIF'i biter bitmez arka planda başlar; sonuç ekranı gecikmez. Başarısız olursa kareler duruyorsa "Tekrar dene" yeniden üretir.
- Dosya adı: `kehanet-postasi-{ad-slug}-{SSDDss}.gif` (Türkçe karakterler sadeleştirilir).

### Paylaşım ("Telefonuma gönder")
1. **Kabin girişi:** Ayarlar → Telefona gönderme bölümünde Supabase e-posta/şifre ile giriş. Şifre saklanmaz; oturumu supabase-js tutar.
2. **Yükleme:** `share.js`, GIF'i `{id}.gif` adıyla `gifs` bucket'ına yükler. ID 10 karakterdir; alfabe `23456789abcdefghjkmnpqrstuvwxyz` (karışan karakterler yok), `crypto.getRandomValues` ile ve mod yanlılığı olmadan üretilir. 409 çakışmada bir kez yeni ID denenir.
3. **QR:** ID ve link yüklemeden önce üretilir, QR hemen çizilir; yükleme arka planda sürer ("Yükleniyor…" → "Hazır"). `qrcode-generator` ile SVG (hata düzeltme L, 4 modül kenar boşluğu, beyaz zemin, siyah modüller). Bağlantı: `{SITE_URL}/al.html#{id}`.
4. **Telefon:** `al.html` + `al.js`, Supabase kütüphanesi yüklemeden ID'yi `location.hash`'ten alır ve `fetch` ile public URL'den GIF'i çeker; yükleme bitmediyse 404/400 için 1 sn arayla en fazla 15 kez tekrar dener ("Fotoğrafın geliyor…"); Web Share API (dosya paylaşımı) varsa onu, yoksa indirmeyi kullanır. Dosya silinmişse "BASKI TÜKENDİ" gösterilir.
5. **Yeniden kullanım:** Aynı çekim ikinci kez yüklenmez; silinmesine 5 dk'dan az kaldıysa yeniden yüklenir.
6. Paylaşım yapılandırılmamışsa (`js/config.js` boş) buton hiç görünmez, kabin normal çalışır. Supabase ve QR kütüphaneleri yalnızca paylaşım açıksa yüklenir.

### Güvenlik ve gizlilik
- Tarayıcıdaki anahtar yalnızca **publishable/anon** anahtardır. **Secret / service_role anahtarı asla repoya yazılmaz**; yalnızca GitHub Actions secret'ı olarak durur.
- Storage politikası (`kurulum.sql`): yalnızca `authenticated` kabin kullanıcısı için INSERT; dosya adı `^[2-9a-z]{10}\.gif$` desenine uymalı, yalnızca `image/gif`, en fazla 5 MB. SELECT/UPDATE/DELETE politikası **bilerek yok** (listeleme, üzerine yazma, siteden silme mümkün değil).
- Supabase'de **"Allow new users to sign up" kapalı olmalı**; aksi halde anahtar açıkta olduğundan herkes hesap açıp yükleme yapabilir.
- `kurulum.sql` içindeki `BURAYA-KABIN-KULLANICI-UUID` yeri, kabin kullanıcısının UUID'siyle değiştirilerek çalıştırılır.
- Ziyaretçi fotoğrafı sunucuda tutulmaz; telefona gönderilen GIF'ler **30 dk** sonra silinir.

### Otomatik temizlik
- `.github/workflows/temizlik.yml`: cron `3-59/10 * * * *` (her 10 dk), `workflow_dispatch` ile elle de çalışır. Ortam: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (repo secret'ları), `MAX_AGE_MIN=30`.
- `scripts/temizlik.mjs`: bucket'ı sayfa sayfa listeler, 30 dk'dan eski dosyaları Storage API ile 100'lük gruplarla siler. `DELETE_ALL=true` ile (Actions → "Tüm GIF'leri sil (etkinlik sonu)") hepsini siler. Bir dosya en fazla ~40–45 dk yaşar.
- Etkinlik dışında workflow'u kapat (günde 144 çalıştırma). GitHub, 60 gün commit olmayan public depolarda zamanlanmış işleri kendiliğinden durdurur.

## Ayarlar (varsayılanlar)

Ayarlar `localStorage`'da (`kehanet-kabin-ayarlar`) tutulur; geçersiz/eksik alanlar varsayılana döner. Sayı numarası `kehanet-kabin-sayi` anahtarındadır ve her çekimde artar (kuponda "No." olarak görünür).

| Ayar | Varsayılan | Seçenekler |
|---|---|---|
| Gazete adı | Kehanet Postası | metin (40) |
| Slogan | GDG On Campus Selçuk'un resmî gazetesi | metin (70) |
| Üst başlık | Olağanüstü haber | metin (40) |
| Manşet modu | `random` | `random` / `fixed` |
| Fotoğraf altı yazısı | `{isim}, muhabirimizin objektifine poz verirken.` | metin (120), `{isim}` yer tutucu |
| Çekim süresi | 2 sn | 1,5 / 2 / 2,5 / 3 |
| GIF genişliği | 480 px | 360 / 480 / 600 |
| Telefona giden GIF | 360 px | 360 / 480 |
| İleri-geri döngü | açık | |
| Ayna görüntüsü | açık | |
| Deklanşör sesi | açık | |
| Kamera | otomatik | listeden seçilir |

Rastgele manşetler `js/settings.js` içindeki `HEADLINES` dizisindedir (10 adet; ör. "Muhabirimiz bu kişiyi iş başında yakaladı").

## Yerelde çalıştırma

`file://` ile açılmaz (ES module + Web Worker). Klasörde sunucu başlat:

```bash
python -m http.server 8000
# ya da
npx serve .
```

Sonra `http://localhost:8000` adresini aç ve kamera iznini ver. Tüm yollar göreli olduğundan GitHub Pages proje alt dizininde de çalışır.

## Üçüncü parti bileşenler

| Bileşen | Sürüm | Lisans | Not |
|---|---|---|---|
| gifenc | 1.0.3 | MIT | Yerel kopya, kare ofseti için küçük yama içerir |
| @supabase/supabase-js | 2.45.4 (UMD) | MIT | Yalnızca paylaşım açıksa yüklenir |
| qrcode-generator | 1.4.4 | MIT | Yalnızca paylaşım açıksa yüklenir |
| Fontlar (@fontsource 5.3.0) | | SIL OFL 1.1 | Grenze Gotisch 900, Libre Caslon Display 400, Old Standard TT 400 / 400 italik (latin + latin-ext) |

## Erişilebilirlik

- Canvas ve GIF için `aria-label`/`alt` metinleri; `aria-live` bölgesi (`#status`) geri sayım, çekim, kodlama ve sonuç durumlarını duyurur.
- Sonuç ekranı `role="dialog"`, odak tuzağı (Tab) ve Esc/Boşluk ile kapatma içerir.
- `prefers-reduced-motion` açıksa bekleme yazısı yanıp sönmez.

## Bilinen noktalar / dikkat

- Kamera API'si yalnızca güvenli bağlamda (https ya da localhost) vardır; düz `http://192.168.x.x` ile yerel ağdan denenemez.
- Oturumdaki baskılar yalnızca bellektedir; sayfa yenilenince silinir.
- GitHub Actions zamanlanmış işleri yoğunlukta gecikebilir; bu yüzden TTL "tam 30 dk" değil "en fazla ~40–45 dk"dır.
- Paylaşım için kabinde her etkinlik öncesi giriş yapılmış olmalı; oturum süresi dolarsa kullanıcıya "kabin girişi yapılmamış" ve "Ayarlar'dan kabin girişi yap" mesajı çıkar.
