// "Telefonuma gönder" yapılandırması. BURAYA DOLDUR:
//   SUPABASE_URL      → Supabase › Project Settings › API › Project URL (ör. https://abcd1234.supabase.co)
//   SUPABASE_ANON_KEY → aynı sayfadaki publishable (sb_publishable_…) ya da anon public anahtar
//   SITE_URL          → sitenin yayındaki adresi, sonda "/" olmadan (ör. https://kullanici.github.io/gazete)
// Secret / service_role anahtarı ASLA buraya yazılmaz; o yalnızca GitHub Actions secret'ında durur.
// Alanlar boşsa "Telefonuma gönder" görünmez, kabin eskisi gibi çalışır.

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
export const SITE_URL = '';
export const BUCKET = 'gifs';
export const SHARE_TTL_MIN = 30;
