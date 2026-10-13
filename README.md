# Kehanet Postası · Fotoğraf Kabini

Ziyaretçi kameranın karşısına geçer, kendini eski bir gazetenin içinde sepya tonlu, titreşen bir fotoğraf olarak görür. "POZ VER"e basınca (ya da Boşluk tuşuna) 3-2-1 geri sayım başlar, ardından kısa bir çekim yapılır ve gazete sayfasının tamamı hareketli GIF olarak indirilebilir.

Tamamen statik bir sitedir: HTML + CSS + vanilla JS (ES module). Build adımı, sunucu ya da backend yoktur. GIF kodlaması tarayıcıda, bir Web Worker içinde [gifenc](https://github.com/mattdesl/gifenc) (MIT) ile yapılır. Yerel kopyası `js/vendor/` altındadır ve kare ofseti için küçük bir yama içerir.

## Localhost'ta çalıştırma

ES module ve Web Worker kullanıldığı için `index.html` dosyayı çift tıklayarak (`file://`) **açılmaz**. Klasörde basit bir sunucu başlat:

```bash
python -m http.server 8000
# ya da
npx serve .
```

Sonra tarayıcıda `http://localhost:8000` adresini aç ve kamera iznini ver.

## Yayınlama

**GitHub Pages**
1. Bu klasörü bir GitHub deposuna yükle (`index.html` kökte olmalı).
2. *Settings → Pages → Build and deployment* bölümünde kaynak olarak "Deploy from a branch" seç, dal `main`, klasör `/ (root)`.
3. Birkaç dakika sonra site `https://<kullanıcı>.github.io/<depo>/` adresinde yayında olur.

**Cloudflare Pages**
1. *Workers & Pages → Create → Pages* bölümünde depoyu bağla ya da klasörü "Direct Upload" ile yükle.
2. Framework preset: *None*. Build command boş kalsın. Output directory: `/`.
3. Site `https://<proje>.pages.dev` adresinde yayına girer.

Tüm yollar göreli olduğu için alt dizinde (GitHub Pages proje sitesi gibi) de çalışır.

## Kamera neden https istiyor?

Tarayıcılar `navigator.mediaDevices.getUserMedia` API'sini yalnızca **güvenli bağlamda** açar, yani https üzerinden ya da `localhost` üzerinden. Düz `http://` ile açılan bir sayfada kamera API'si hiç yoktur ve kabin "Kamera yalnızca https üzerinden çalışır." uyarısını gösterir. GitHub Pages ve Cloudflare Pages varsayılan olarak https verir. Yerel ağdaki başka bir cihazdan (`http://192.168.x.x`) denemek istersen https gerekir.

## Paylaşım kurulumu ("Telefonuma gönder")

Sonuç ekranındaki **Telefonuma gönder** butonu GIF'in telefon sürümünü (varsayılan 360 px) Supabase Storage'a yükler ve bir QR gösterir. Ziyaretçi QR'ı okutunca `al.html` açılır ve GIF'i oradan kaydeder ya da paylaşır. Dosyalar GitHub Actions ile 30 dakika sonra silinir. `js/config.js` boşsa buton görünmez ve kabin eskisi gibi çalışır.

**1. Supabase** (bir kez). Kurulumun kopyası [`supabase/kurulum.sql`](supabase/kurulum.sql) dosyasındadır:
- `gifs` bucket'ı: public okuma açık, yalnızca `image/gif`, en fazla 5 MB.
- Yalnızca `authenticated` için INSERT kuralı. SELECT, UPDATE ve DELETE kuralı yoktur.
- *Authentication → Users → Add user* ile kabin için bir e-posta + şifre hesabı aç.
- **Önemli:** *Authentication → Sign In / Providers* bölümünde **"Allow new users to sign up"** seçeneğini kapat. Publishable anahtar sitede açıkta durur. Kayıt açık kalırsa herkes kendine hesap açıp bucket'a dosya yükleyebilir.

**2. `js/config.js`'i doldur.** Değerler *Project Settings → API* sayfasında:

```js
export const SUPABASE_URL = 'https://abcd1234.supabase.co';        // Project URL
export const SUPABASE_ANON_KEY = 'sb_publishable_…';               // publishable (ya da eski "anon public") anahtar
export const SITE_URL = 'https://kullanici.github.io/gazete';      // sitenin adresi, sonda "/" yok
```

`BUCKET` ve `SHARE_TTL_MIN` alanlarına dokunma. **Secret / service_role anahtarı asla bu dosyaya yazılmaz.**

**3. Kabin girişi.** Kabinde *Ayarlar → Telefona gönderme* bölümünden kabin hesabının e-postası ve şifresiyle giriş yap. Şifre hiçbir yere kaydedilmez. Oturumu supabase-js kendisi saklar (`sb-…-auth-token`) ve tazeler. Aynı bölümden telefona giden GIF'in genişliğini de seçebilirsin: 360 px (hızlı, ~1,3 MB) ya da 480 px (net, ~2,3 MB). Boyutlar 2 sn'lik çekim için yaklaşık değerlerdir.

**4. GitHub secret'ları.** Depoda *Settings → Secrets and variables → Actions → New repository secret*:
- `SUPABASE_URL`: Project URL
- `SUPABASE_SECRET_KEY`: *Project Settings → API Keys* altındaki secret anahtar (`sb_secret_…`) ya da eski `service_role` anahtarı

`.github/workflows/temizlik.yml` her 10 dakikada bir (`:03, :13, …`) çalışır ve 30 dakikadan eski GIF'leri Storage API ile siler. GitHub zamanlanmış işleri yoğunlukta birkaç dakika geciktirebilir, dolayısıyla bir dosya en fazla ~40-45 dakika yaşar.

**Etkinlik sonunda elle temizlik.** *Actions → GIF temizliği → Run workflow* ekranında **"Tüm GIF'leri sil (etkinlik sonu)"** kutusunu işaretleyip çalıştır. Bucket'taki bütün GIF'ler silinir.

**Etkinlik dışında workflow'u kapat.** *Actions → GIF temizliği → ⋯ → Disable workflow* (ya da `gh workflow disable temizlik.yml`). Günde 144 çalıştırma, özel (private) depolarda Actions dakikalarından düşer. Bir sonraki etkinlikten önce aynı yerden *Enable workflow* ile aç. Not: GitHub, 60 gün commit almayan public depolarda zamanlanmış işleri kendiliğinden kapatır.

## Notlar

- Ayarlar ve sayı numarası tarayıcının `localStorage`'ında tutulur (`kehanet-kabin-ayarlar`, `kehanet-kabin-sayi`). Paylaşım açıksa supabase-js kabin oturumunu da burada saklar.
- `js/vendor/` altındaki üçüncü parti dosyalar: gifenc@1.0.3, @supabase/supabase-js@2.45.4 (UMD) ve qrcode-generator@1.4.4. Hepsi MIT lisanslı, yerel kopyadır ve lisans başlıkları dosyaların içindedir. Supabase ve QR kütüphaneleri yalnızca paylaşım yapılandırılmışsa yüklenir. `al.html` bunları hiç yüklemez, GIF'i düz `fetch` ile alır.
- Oturumdaki baskılar yalnızca bellektedir. Sayfa yenilenince silinir.
- Fontlar `fonts/` klasöründen yerel olarak yüklenir (`css/fonts.css`, @fontsource@5.3.0 kaynaklı latin + latin-ext woff2). İnternet bağlantısı gerekmez. Lisanslar (SIL OFL 1.1) `fonts/OFL-*.txt` dosyalarında.
- GDG On Campus Selçuk logoları `assets/` klasöründedir: panel için `gdg-selcuk-logo-renkli.png`, gazetenin alt kısmı için `gdg-selcuk-logo-gazete.png`.
- Sonuç ekranı 45 sn etkileşimsiz kalırsa kendiliğinden kapanır. Kabin 60 sn kullanılmazsa fotoğrafın altında "POZ VERMEK İÇİN BOŞLUĞA BAS" yazısı yanıp söner.
