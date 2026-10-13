// Telefon paylaşım sayfası: ?k={id} ile gelen GIF'i public adresten çeker, kaydetme/paylaşma sunar.
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

async function load(id) {
  ui.problem.hidden = true;
  ui.loading.hidden = false;
  let blob;
  try {
    const res = await fetch(publicGifUrl(SUPABASE_URL, BUCKET, id), { cache: 'no-store' });
    // Supabase olmayan dosya için 400 ya da 404 döndürür
    if (res.status === 404 || res.status === 400) {
      showProblem('BASKI TÜKENDİ', `Bu baskı ${SHARE_TTL_MIN} dakika sonra imha edildi.`);
      return;
    }
    if (!res.ok) {
      showProblem('Baskı getirilemedi.', `Sunucu yanıt vermedi (${res.status}). Biraz sonra tekrar dene.`, true);
      return;
    }
    blob = await res.blob();
  } catch {
    showProblem('Baskı getirilemedi.', 'İnternet bağlantını kontrol edip tekrar dene.', true);
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

const id = new URLSearchParams(location.search).get('k');
if (!isValidId(id)) {
  showProblem('Bu kupon geçersiz.', 'QR kodu kabindeki ekrandan tekrar okut.');
} else if (!SUPABASE_URL) {
  showProblem('Paylaşım yapılandırılmamış.', 'Kabin görevlisine haber ver.');
} else {
  ui.save.addEventListener('click', save);
  ui.retry.addEventListener('click', () => load(id));
  load(id);
}
