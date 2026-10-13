// GitHub Actions temizliği: `gifs` bucket'ında MAX_AGE_MIN dakikadan eski GIF'leri siler
// (DELETE_ALL=true ise hepsini). Silme Storage API ile yapılır; SQL ile silinen kayıtların
// dosyaları bucket'ta sahipsiz kalır.
//
// Ortam değişkenleri: SUPABASE_URL, SUPABASE_SECRET_KEY, MAX_AGE_MIN (varsayılan 30), DELETE_ALL
// Kullanım: npm install --no-save @supabase/supabase-js@2.45.4 && node scripts/temizlik.mjs

import { pathToFileURL } from 'node:url';

export const BUCKET = 'gifs';
const PAGE_SIZE = 1000;
const REMOVE_BATCH = 100;

/** Bucket kökündeki tüm dosyaları sayfa sayfa toplar (klasörlerin id'si null'dır, atlanır). */
export async function listAll(storage, pageSize = PAGE_SIZE) {
  const files = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await storage.list('', {
      limit: pageSize,
      offset,
      sortBy: { column: 'created_at', order: 'asc' },
    });
    if (error) throw new Error(`Liste alınamadı: ${error.message || error}`);
    const page = data || [];
    for (const item of page) if (item.id) files.push(item);
    if (page.length < pageSize) return files;
  }
}

/**
 * Temizliği yapar. Önce listenin tamamı alınır, sonra silinir: silerken sayfalamak
 * ofsetleri kaydırıp dosya atlatırdı.
 */
export async function cleanup({ client, maxAgeMin = 30, deleteAll = false, now = Date.now(), pageSize = PAGE_SIZE, log = console.log }) {
  const storage = client.storage.from(BUCKET);
  const files = await listAll(storage, pageSize);
  const cutoff = now - maxAgeMin * 60000;
  const targets = files.filter((f) => {
    if (deleteAll) return true;
    const t = Date.parse(f.created_at);
    return Number.isFinite(t) && t < cutoff;
  });

  let deleted = 0;
  for (let i = 0; i < targets.length; i += REMOVE_BATCH) {
    const names = targets.slice(i, i + REMOVE_BATCH).map((f) => f.name);
    const { data, error } = await storage.remove(names);
    if (error) throw new Error(`Silinemedi (${deleted} dosya silindikten sonra): ${error.message || error}`);
    deleted += Array.isArray(data) ? data.length : names.length;
  }

  const result = { found: files.length, deleted, remaining: files.length - deleted };
  const scope = deleteAll ? 'tümü' : `${maxAgeMin} dk'dan eski`;
  log(`Bulunan: ${result.found} · Silinen (${scope}): ${result.deleted} · Kalan: ${result.remaining}`);
  if (deleted < targets.length) log(`Uyarı: ${targets.length} dosya hedeflendi, ${deleted} tanesi silindi.`);
  return result;
}

async function main() {
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  const missing = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY'].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Eksik ortam değişkeni: ${missing.join(', ')}. GitHub › Settings › Secrets and variables › Actions bölümüne ekle.`);
    process.exit(1);
  }
  const maxAgeMin = Number(process.env.MAX_AGE_MIN || 30);
  if (!Number.isFinite(maxAgeMin) || maxAgeMin < 0) {
    console.error(`MAX_AGE_MIN geçersiz: ${process.env.MAX_AGE_MIN}`);
    process.exit(1);
  }
  const deleteAll = String(process.env.DELETE_ALL).toLowerCase() === 'true';

  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await cleanup({ client, maxAgeMin, deleteAll });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(`Temizlik başarısız: ${err.message || err}`);
    process.exit(1);
  });
}
