// "Telefonuma gönder": kabin girişi/çıkışı, GIF yükleme, ID üretimi, QR çizimi.
// Supabase ve QR kütüphaneleri yalnızca paylaşım yapılandırılmışsa, ilk gerektiğinde yüklenir.

import * as defaultConfig from './config.js';

export const ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'; // 0/o, 1/l/i gibi karışan karakterler yok
export const ID_LENGTH = 10;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // bucket sınırı
const QR_INK = '#1e160f';
const QR_PAPER = '#f4ead3';
const QR_QUIET = 4; // modül cinsinden sessiz bölge
const QR_CSS_SIZE = 240;

export const REASONS = {
  offline: 'internet bağlantısı yok',
  auth: 'kabin girişi yapılmamış',
  'too-large': 'dosya çok büyük',
  other: 'beklenmeyen bir hata oluştu',
};

export class ShareError extends Error {
  constructor(reason, cause) {
    super(REASONS[reason] || REASONS.other);
    this.name = 'ShareError';
    this.reason = REASONS[reason] ? reason : 'other';
    this.cause = cause;
  }
}

export function isConfigured(cfg) {
  return !!(cfg && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && cfg.SITE_URL);
}

const trimSlash = (s) => String(s).replace(/\/+$/, '');

/** 10 karakterlik rastgele ID; mod yanlılığı olmasın diye 248 ve üstü baytlar atılır (248 = 31 × 8). */
export function makeId(getRandomValues = (a) => crypto.getRandomValues(a)) {
  const n = ID_ALPHABET.length;
  const limit = 256 - (256 % n);
  let id = '';
  while (id.length < ID_LENGTH) {
    const bytes = getRandomValues(new Uint8Array(16));
    for (const b of bytes) {
      if (b < limit && id.length < ID_LENGTH) id += ID_ALPHABET[b % n];
    }
  }
  return id;
}

export function isValidId(k) {
  return typeof k === 'string' && k.length === ID_LENGTH && [...k].every((ch) => ID_ALPHABET.includes(ch));
}

export function shareLink(siteUrl, id) {
  return `${trimSlash(siteUrl)}/al.html?k=${id}`;
}

export function publicGifUrl(supabaseUrl, bucket, id) {
  return `${trimSlash(supabaseUrl)}/storage/v1/object/public/${bucket}/${id}.gif`;
}

// ---------- hata sınıflandırma ----------

const isNetworkError = (err) =>
  !!err &&
  (err.name === 'TypeError' ||
    err.name === 'AuthRetryableFetchError' ||
    (err.name === 'StorageUnknownError' && err.originalError && err.originalError.name === 'TypeError'));

/**
 * Yükleme hatasını sebebe çevirir. storage-js 2.7: sunucu hatası ham JSON ({statusCode:'403', error, message}),
 * ağ hatası fırlatılan TypeError olarak gelir.
 */
export function classifyUploadError(err, online = true) {
  if (err instanceof ShareError) return err;
  if (!online || isNetworkError(err)) return new ShareError('offline', err);
  const status = Number((err && (err.statusCode || err.status)) || 0);
  const text = `${(err && err.error) || ''} ${(err && err.message) || ''}`;
  if (status === 413 || /too large|maximum allowed size/i.test(text)) return new ShareError('too-large', err);
  if (status === 401 || status === 403 || /row-level security|jwt|unauthori[sz]ed|not authenticated/i.test(text)) {
    return new ShareError('auth', err);
  }
  return new ShareError('other', err);
}

/** "Telefona gönderilemedi: …" mesajı ve varsa yönlendirme. */
export function describeShareError(err) {
  const e = err instanceof ShareError ? err : new ShareError('other', err);
  return {
    reason: e.reason,
    text: `Telefona gönderilemedi: ${e.message}.`,
    hint: e.reason === 'auth' ? "Ayarlar'dan kabin girişi yap." : '',
  };
}

export function loginErrorMessage(err) {
  const code = (err && err.code) || '';
  const msg = (err && err.message) || '';
  if (isNetworkError(err) || (err && err.status === 0)) return 'İnternet bağlantısı yok ya da sunucuya ulaşılamıyor.';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(msg)) return 'E-posta ya da şifre hatalı.';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(msg)) return 'Bu e-posta adresi henüz doğrulanmamış.';
  if ((err && err.status === 429) || /rate limit|too many/i.test(msg)) return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar dene.';
  return 'Giriş yapılamadı. Bilgileri kontrol edip tekrar dene.';
}

// ---------- QR ----------

/** QR'ı canvas'a çizer: koyu mürekkep açık kâğıt üstünde, 4 modül sessiz bölge, hata düzeltme M. */
export function drawQr(canvas, text, qrcodeLib, { cssSize = QR_CSS_SIZE, dpr = 1 } = {}) {
  const qr = qrcodeLib(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const total = n + QR_QUIET * 2;
  const cell = Math.max(1, Math.ceil((cssSize * dpr) / total)); // tam sayı piksel: kenarlar keskin kalır
  canvas.width = canvas.height = total * cell;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = QR_PAPER;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = QR_INK;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + QR_QUIET) * cell, (r + QR_QUIET) * cell, cell, cell);
    }
  }
  if (canvas.style) canvas.style.width = canvas.style.height = `${(total * cell) / dpr}px`;
  return { modules: n, size: total * cell };
}

// ---------- kütüphane yükleme ----------

const scripts = new Map();

/** Klasik (UMD) betiği bir kez yükler, tanımladığı globali döndürür. */
function loadGlobal(file, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  if (!scripts.has(file)) {
    scripts.set(
      file,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = new URL(`./vendor/${file}`, import.meta.url).href;
        s.async = true;
        s.onload = () => (window[globalName] ? resolve(window[globalName]) : reject(new Error(`${file} beklenen globali tanımlamadı`)));
        s.onerror = () => {
          scripts.delete(file);
          reject(new Error(`${file} yüklenemedi`));
        };
        document.head.append(s);
      }),
    );
  }
  return scripts.get(file);
}

// ---------- servis ----------

/**
 * Paylaşım servisi. Testte bağımlılıklar değiştirilebilir:
 *   config, loadSupabase() → { createClient }, loadQrcode() → qrcode, isOnline() → boolean
 */
export function createShareService({
  config = defaultConfig,
  loadSupabase = () => loadGlobal('supabase.js', 'supabase'),
  loadQrcode = () => loadGlobal('qrcode.js', 'qrcode'),
  isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false,
} = {}) {
  const enabled = isConfigured(config);
  const bucket = config.BUCKET || 'gifs';
  const ttlMin = Number(config.SHARE_TTL_MIN) || 30;
  let clientPromise = null;

  function client() {
    if (!enabled) return Promise.reject(new Error('Paylaşım yapılandırılmamış'));
    if (!clientPromise) {
      clientPromise = loadSupabase().then((lib) =>
        lib.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        }),
      );
      clientPromise.catch(() => {
        clientPromise = null;
      });
    }
    return clientPromise;
  }

  /** Oturum değiştikçe cb(user|null) çağrılır (ilk çağrı mevcut oturumla). */
  async function onAuthChange(cb) {
    const c = await client();
    c.auth.onAuthStateChange((_event, session) => cb(session ? session.user : null));
  }

  async function signIn(email, password) {
    if (!isOnline()) throw new Error(loginErrorMessage({ name: 'TypeError' }));
    let c;
    try {
      c = await client();
    } catch {
      throw new Error('Paylaşım kütüphanesi yüklenemedi.');
    }
    let res;
    try {
      res = await c.auth.signInWithPassword({ email, password });
    } catch (err) {
      throw new Error(loginErrorMessage(err));
    }
    if (res.error) throw new Error(loginErrorMessage(res.error));
    return res.data.user;
  }

  async function signOut() {
    const c = await client();
    const { error } = await c.auth.signOut({ scope: 'local' });
    if (error) {
      throw new Error(isNetworkError(error) || !isOnline() ? 'Çıkış yapılamadı: internet bağlantısı yok.' : 'Çıkış yapılamadı.');
    }
  }

  /** GIF'i {id}.gif olarak yükler, telefon linkini döndürür. Hata ShareError olarak fırlar. */
  async function upload(blob) {
    if (!enabled) throw new ShareError('other');
    if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new ShareError('too-large');
    if (!isOnline()) throw new ShareError('offline');
    const file = blob.type === 'image/gif' ? blob : new Blob([blob], { type: 'image/gif' });

    let c;
    try {
      c = await client();
    } catch (err) {
      throw new ShareError('other', err);
    }

    let session;
    try {
      const { data, error } = await c.auth.getSession();
      if (error) throw error;
      session = data && data.session;
    } catch (err) {
      throw isNetworkError(err) || !isOnline() ? new ShareError('offline', err) : new ShareError('auth', err);
    }
    if (!session) throw new ShareError('auth');

    // 31^10 ihtimalde çakışma neredeyse imkânsız; yine de 409 gelirse bir kez yeni ID ile denenir.
    for (let attempt = 0; ; attempt++) {
      const id = makeId();
      let error;
      try {
        ({ error } = await c.storage.from(bucket).upload(`${id}.gif`, file, {
          contentType: 'image/gif',
          cacheControl: String(ttlMin * 60),
          upsert: false,
        }));
      } catch (err) {
        throw classifyUploadError(err, isOnline());
      }
      if (!error) return { id, link: shareLink(config.SITE_URL, id) };
      const status = Number(error.statusCode || error.status || 0);
      if (status === 409 && attempt === 0) continue;
      throw classifyUploadError(error, isOnline());
    }
  }

  /** QR'ı çizer (QR kütüphanesi gerekirse yüklenir). */
  async function qr(canvas, text) {
    const lib = await loadQrcode();
    return drawQr(canvas, text, lib, { dpr: (typeof window !== 'undefined' && window.devicePixelRatio) || 1 });
  }

  /** Kütüphaneleri önceden yükler, kayıtlı oturumu canlandırır; hata kabini etkilemez. */
  function init() {
    if (!enabled) return;
    client().catch((err) => console.warn('Paylaşım kütüphanesi yüklenemedi:', err));
    loadQrcode().catch(() => {});
  }

  return { enabled, ttlMin, init, onAuthChange, signIn, signOut, upload, qr };
}
