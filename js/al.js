// Telefon paylaşım sayfası: #{id} ile gelen GIF'i public adresten çeker, kaydetme/paylaşma sunar.
// Supabase kütüphanesi kullanılmaz; yalnızca fetch.

import { SUPABASE_URL, BUCKET, SHARE_TTL_MIN } from './config.js';
import { isValidId, publicGifUrl } from './share.js';

const FILENAME = 'kehanet-postasi.gif';
const $ = (id) => document.getElementById(id);

const ui = {
  loading: $('loading'),
  ready: $('ready'),
  gif: $('gif'),
  save: $('save'),
  problem: $('problem'),
  problemTitle: $('problem-title'),
  problemText: $('problem-text'),
  retry: $('retry'),
};

let file = null;
let objectUrl = '';

function showProblem(title, text, retry = false) {
  ui.loading.hidden = true;
  ui.ready.hidden = true;
  ui.problemTitle.textContent = title;
  ui.problemText.textContent = text;
  ui.retry.hidden = !retry;
  ui.problem.hidden = false;
}

const RETRY_FIRST_MS = 1000; // ilk bekleme
const RETRY_STEP_MS = 500; // her denemede bekleme bu kadar artar
const RETRY_MAX_MS = 3000; // bekleme en fazla bu kadar olur
const RETRY_TOTAL_MS = 60000; // toplam deneme süresi (~60 sn)
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function load(id) {
  ui.problem.hidden = true;
  ui.loading.hidden = false;
  let blob;
  // QR, kabindeki yükleme bitmeden okutulmuş olabilir: dosya görünene kadar ~60 sn boyunca
  // 1 sn'den başlayıp en fazla 3 sn'ye artan aralıklarla tekrar denenir. Dosya yok (404/400)
  // ve ağ hatası (fetch'in fırlattığı TypeError, zaman aşımı dahil) tekrar denenir; 5xx hemen hata verir.
  const started = Date.now();
  let lastFailure = 'network'; // 'missing' | 'network': süre dolunca hangi mesaj gösterilecek
  for (let attempt = 0; ; attempt++) {
    const remaining = RETRY_TOTAL_MS - (Date.now() - started);
    if (remaining <= 0) break;
    // Tek bir istek (gövde indirme dahil) toplam süreyi aşamaz
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const res = await fetch(publicGifUrl(SUPABASE_URL, BUCKET, id), { cache: 'no-store', signal: controller.signal });
      if (res.ok) {
        blob = await res.blob();
        break;
      }
      // Supabase olmayan dosya için 400 ya da 404 döndürür
      if (res.status === 404 || res.status === 400) {
        lastFailure = 'missing';
      } else {
        showProblem('Baskı getirilemedi.', `Sunucu yanıt vermedi (${res.status}). Biraz sonra tekrar dene.`, true);
        return;
      }
    } catch {
      lastFailure = 'network';
    } finally {
      clearTimeout(timer);
    }
    const delay = Math.min(RETRY_MAX_MS, RETRY_FIRST_MS + attempt * RETRY_STEP_MS);
    if (Date.now() - started + delay > RETRY_TOTAL_MS) break;
    ui.loading.textContent = 'Fotoğrafın geliyor…';
    await wait(delay);
  }
  if (!blob) {
    if (lastFailure === 'missing') {
      showProblem('BASKI TÜKENDİ', `Bu baskı ${SHARE_TTL_MIN} dakika sonra imha edildi.`);
    } else {
      showProblem('Baskı getirilemedi.', 'İnternet bağlantını kontrol edip tekrar dene.', true);
    }
    return;
  }

  const gif = new Blob([blob], { type: 'image/gif' });
  file = new File([gif], FILENAME, { type: 'image/gif' });
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = URL.createObjectURL(gif);
  ui.gif.src = objectUrl;
  ui.loading.hidden = true;
  ui.ready.hidden = false;
}

function download() {
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = FILENAME;
  document.body.append(a);
  a.click();
  a.remove();
}

async function save() {
  if (!file) return;
  if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return; // paylaşım penceresi kapatıldı
    }
  }
  download();
}

const id = location.hash.slice(1);
if (!isValidId(id)) {
  showProblem('Bu kupon geçersiz.', 'QR kodu kabindeki ekrandan tekrar okut.');
} else if (!SUPABASE_URL) {
  showProblem('Paylaşım yapılandırılmamış.', 'Kabin görevlisine haber ver.');
} else {
  ui.save.addEventListener('click', save);
  ui.retry.addEventListener('click', () => load(id));
  load(id);
}
