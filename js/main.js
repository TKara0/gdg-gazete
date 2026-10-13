// Başlatma, olay bağlama, ana döngü.

import { openCamera, listCameras, cameraErrorMessage } from './camera.js';
import { PAGE_W, PAGE_H, LOGO, renderPage, photoRect, loadFonts, loadLogo, logoReady, drawPhotoMessage, drawIdlePrompt } from './newspaper.js';
import { renderPhoto } from './effects.js';
import {
  createSound, runCountdown, captureFrames, FPS,
  drawCountdown, drawCaptureOverlay, drawFlash, drawEncodingOverlay,
} from './recorder.js';
import { loadSettings, loadIssue, saveIssue, pickHeadline, initSettingsDialog } from './settings.js';
import { createShareService, describeShareError, ShareError } from './share.js';

const PREVIEW_GRAIN = 0.12;
const GIF_GRAIN = 0.07;
const TICKS_PER_SECOND = 12;
const MAX_PHOTO_SCALE = 1.5; // önizlemede efekt işlenen en yüksek çözünürlük (mantıksal × 1.5)
const HISTORY_MAX = 8;
const IDLE_PROMPT_MS = 60000; // bu kadar kullanılmazsa "POZ VERMEK İÇİN BOŞLUĞA BAS" görünür
const IDLE_BLINK_MS = 2400; // yanıp sönme periyodu
const RESULT_TIMEOUT_MS = 45000; // sonuç ekranı etkileşimsiz kalırsa kendiliğinden kapanır
const RESULT_WARN_MS = 10000; // son 10 sn geri sayım görünür
const SHARE_REUSE_MARGIN_MS = 5 * 60000; // silinmesine bu kadar kalan bir yükleme tekrar kullanılmaz

const $ = (id) => document.getElementById(id);

const TR_MAP = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c', â: 'a', î: 'i', û: 'u' };

function slugify(text) {
  const slug = text
    .replace(/[ıİşŞğĞüÜöÖçÇâîû]/g, (ch) => TR_MAP[ch])
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug || 'okur';
}

/** kehanet-postasi-{ad-slug}-{SSDDss}.gif */
function gifFilename(name) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `kehanet-postasi-${slugify(name)}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.gif`;
}

function init() {
  const ui = {
    canvas: $('page'),
    video: $('video'),
    name: $('name'),
    pose: $('pose'),
    another: $('another'),
    openSettings: $('open-settings'),
    fullscreen: $('fullscreen'),
    camError: $('cam-error'),
    camErrorText: $('cam-error-text'),
    camRetry: $('cam-retry'),
    historyList: $('history-list'),
    historyEmpty: $('history-empty'),
    status: $('status'),
    result: $('result'),
    resultImg: $('result-img'),
    resultMeta: $('result-meta'),
    resultDownload: $('result-download'),
    resultAgain: $('result-again'),
    resultClose: $('result-close'),
    resultTimeout: $('result-timeout'),
    share: $('share'),
    shareSend: $('share-send'),
    shareWait: $('share-wait'),
    shareWaitText: $('share-wait-text'),
    shareQr: $('share-qr'),
    shareQrCanvas: $('share-qr-canvas'),
    shareTtl: $('share-ttl'),
    couponNo: $('coupon-no'),
    shareError: $('share-error'),
    shareErrorText: $('share-error-text'),
    shareErrorHint: $('share-error-hint'),
    shareRetry: $('share-retry'),
    settings: $('settings'),
  };

  const state = {
    settings: loadSettings(),
    issue: loadIssue(),
    headline: '',
    name: '',
    camera: 'opening', // 'opening' | 'ready' | 'error'
    phase: 'idle', // 'idle' | 'countdown' | 'capture' | 'encoding' | 'result'
    phaseStart: 0,
    progress: 0,
    dirty: true,
    history: [],
    returnFocus: null,
    lastActivity: performance.now(),
    idlePrompt: false,
    idlePromptStart: 0,
    resultTimer: 0,
    resultEntry: null,
    shareToken: 0, // sonuç ekranı kapanınca/değişince artar; eski yüklemenin sonucu ekrana basılmaz
  };
  state.headline = state.settings.headlineMode === 'fixed' ? state.settings.fixedHeadline : pickHeadline('');

  const sound = createSound();
  const share = createShareService();
  ui.shareTtl.textContent = `GEÇERLİLİK: ${share.ttlMin} DAKİKA · SÜRE DOLUNCA BASKI İMHA EDİLİR`;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- görünüm ----------

  const ctx = ui.canvas.getContext('2d');
  const staticLayer = document.createElement('canvas');
  const photo = document.createElement('canvas');
  const photoCtx = photo.getContext('2d', { willReadFrequently: true });
  const view = { scale: 0, rect: null };

  // Boşta bekleme yazısı alt yazının yerine basılır; o sırada alt yazı çizilmez.
  function pageData(name = state.name, hideCaption = state.idlePrompt) {
    const s = state.settings;
    return {
      title: s.title,
      slogan: s.slogan,
      kicker: s.kicker,
      headline: state.headline,
      caption: hideCaption ? '' : s.caption.split('{isim}').join(name.trim() || 'Okurumuz'),
      issue: state.issue,
      date: new Date(),
    };
  }

  function redrawStatic() {
    if (!view.scale) return;
    renderPage(staticLayer, view.scale, pageData());
    state.dirty = true;
  }

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = ui.canvas.clientWidth || PAGE_W;
    const s = Math.max(0.25, (cssW * dpr) / PAGE_W);
    if (Math.abs(s - view.scale) < 0.001) return;
    view.scale = s;
    view.rect = photoRect(s);
    ui.canvas.width = Math.round(PAGE_W * s);
    ui.canvas.height = Math.round(PAGE_H * s);
    const pr = photoRect(Math.min(s, MAX_PHOTO_SCALE));
    photo.width = pr.w;
    photo.height = pr.h;
    photoCtx.fillStyle = '#16100b';
    photoCtx.fillRect(0, 0, pr.w, pr.h);
    redrawStatic();
  }

  function composite(now) {
    const s = view.scale;
    const r = view.rect;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticLayer, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(photo, r.x, r.y, r.w, r.h);
    ctx.setTransform(s, 0, 0, s, 0, 0);

    const t = now - state.phaseStart;
    if (state.camera !== 'ready' && state.phase === 'idle') {
      drawPhotoMessage(ctx, state.camera === 'error' ? 'Kamera açılamadı' : 'Kamera açılıyor…');
    } else if (state.phase === 'countdown') {
      drawCountdown(ctx, t);
    } else if (state.phase === 'capture') {
      drawCaptureOverlay(ctx, state.progress);
      drawFlash(ctx, t);
    } else if (state.phase === 'encoding') {
      drawEncodingOverlay(ctx, state.progress);
    }
    if (state.idlePrompt) {
      const phase = ((now - state.idlePromptStart) / IDLE_BLINK_MS) * Math.PI * 2;
      drawIdlePrompt(ctx, reducedMotion.matches ? 1 : 0.6 + 0.4 * Math.cos(phase));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!view.scale) return;
    updateIdlePrompt(now);
    // Kodlama ve sonuç ekranında efekt döngüsü durur; yalnızca gerektiğinde yeniden çizilir.
    const frozen = state.phase === 'encoding' || state.phase === 'result';
    if (frozen) {
      if (!state.dirty) return;
    } else if (state.camera === 'ready' && ui.video.readyState >= 2) {
      const tick = Math.floor((now / 1000) * TICKS_PER_SECOND);
      renderPhoto(photoCtx, ui.video, photo.width, photo.height, {
        mirror: state.settings.mirror,
        tick,
        grain: PREVIEW_GRAIN,
      });
    }
    composite(now);
    state.dirty = false;
  }

  // ---------- boşta bekleme ve etkileşim ----------

  function updateIdlePrompt(now) {
    const show =
      state.phase === 'idle' && state.camera === 'ready' && !ui.settings.open && now - state.lastActivity >= IDLE_PROMPT_MS;
    if (show === state.idlePrompt) return;
    state.idlePrompt = show;
    state.idlePromptStart = now;
    redrawStatic();
  }

  /** Fare hareketi, dokunma ya da tuş basışı: boşta yazısını kaldırır, sonuç ekranı süresini sıfırlar. */
  function markActivity() {
    state.lastActivity = performance.now();
    if (state.idlePrompt) updateIdlePrompt(state.lastActivity);
    if (state.phase === 'result') updateResultTimer();
  }

  function updateResultTimer() {
    const left = RESULT_TIMEOUT_MS - (performance.now() - state.lastActivity);
    if (left <= 0) {
      closeResult({ focusPose: true });
      return;
    }
    if (left > RESULT_WARN_MS) {
      ui.resultTimeout.hidden = true;
      return;
    }
    const text = `${Math.ceil(left / 1000)} sn sonra kapanacak`;
    if (ui.resultTimeout.hidden) {
      ui.resultTimeout.hidden = false;
      announce('Sonuç ekranı 10 saniye sonra kapanacak');
    }
    if (ui.resultTimeout.textContent !== text) ui.resultTimeout.textContent = text;
  }

  // ---------- kontroller ----------

  const busy = () => state.phase === 'countdown' || state.phase === 'capture' || state.phase === 'encoding';

  function updateControls() {
    const b = busy();
    ui.name.disabled = b;
    ui.pose.disabled = b || state.camera !== 'ready';
    ui.another.disabled = b;
    ui.openSettings.disabled = b;
    ui.fullscreen.disabled = b;
    ui.camRetry.disabled = b;
    for (const btn of ui.historyList.querySelectorAll('button')) btn.disabled = b;
  }

  function setPhase(phase) {
    state.phase = phase;
    state.phaseStart = performance.now();
    state.progress = 0;
    state.dirty = true;
    state.lastActivity = state.phaseStart; // çekim ve sonuç ekranı da kullanım sayılır
    updateControls();
  }

  function announce(text) {
    ui.status.textContent = text;
  }

  function showError(message, retry) {
    ui.camErrorText.textContent = message;
    ui.camRetry.hidden = !retry;
    ui.camError.hidden = false;
  }

  function hideError() {
    ui.camError.hidden = true;
  }

  // ---------- kamera ----------

  async function startCamera() {
    state.camera = 'opening';
    state.dirty = true;
    hideError();
    updateControls();
    try {
      await openCamera(ui.video, state.settings.cameraId);
      state.camera = 'ready';
    } catch (err) {
      state.camera = 'error';
      showError(cameraErrorMessage(err), true);
    }
    state.dirty = true;
    updateControls();
  }

  // ---------- çekim ----------

  async function pose() {
    if (state.phase !== 'idle' || state.camera !== 'ready') return;
    const settings = state.settings;
    const name = state.name.trim();
    if (settings.sound) sound.unlock();
    hideError();

    if (settings.headlineMode === 'random') state.headline = pickHeadline(state.headline);
    state.issue += 1;
    saveIssue(state.issue);
    redrawStatic();

    // Geri sayım
    setPhase('countdown');
    announce('Geri sayım başladı');
    await runCountdown((n) => {
      if (settings.sound) sound.beep();
      announce(String(n));
    });

    // Çekim: kareler doğrudan GIF ölçeğinde yakalanır
    const W = settings.gifWidth;
    const rect = photoRect(W / PAGE_W);
    const gifPhoto = document.createElement('canvas');
    gifPhoto.width = rect.w;
    gifPhoto.height = rect.h;
    const gctx = gifPhoto.getContext('2d', { willReadFrequently: true });

    setPhase('capture');
    announce('Çekiliyor');
    if (settings.sound) sound.shutter();
    const count = Math.round(settings.duration * FPS);
    let frames;
    try {
      frames = await captureFrames(
        count,
        (i) => {
          renderPhoto(gctx, ui.video, rect.w, rect.h, { mirror: settings.mirror, tick: i + 1, grain: GIF_GRAIN });
          return gctx.getImageData(0, 0, rect.w, rect.h).data;
        },
        (done, total) => {
          state.progress = done / total;
        },
      );
    } catch (err) {
      console.error(err);
      setPhase('idle');
      showError('Çekim sırasında bir sorun oldu. Tekrar dene.', false);
      return;
    }

    const data = pageData(name, false);
    const order = [];
    for (let i = 0; i < frames.length; i++) order.push(i);
    if (settings.pingpong) for (let i = frames.length - 2; i >= 1; i--) order.push(i);

    // Telefon GIF'i için kareler saklanır (arşiv işçisine aktarılan kareler sonra okunamaz)
    const phoneW = share.enabled ? settings.phoneWidth : 0;
    const phoneFrames = phoneW && phoneW !== W ? frames.map((f) => f.slice()) : null;

    // Kodlama (Web Worker)
    setPhase('encoding');
    announce('Baskıya giriyor');
    let buffer;
    try {
      buffer = await encodeGif(gifJob(W, frames, data, order), (p) => {
        const v = Math.floor(p * 100) / 100;
        if (v !== state.progress) {
          state.progress = v;
          state.dirty = true;
        }
      });
    } catch (err) {
      console.error(err);
      setPhase('idle');
      showError(err.userMessage || 'GIF hazırlanamadı. Tekrar dene.', false);
      return;
    }

    const blob = new Blob([buffer], { type: 'image/gif' });
    const entry = {
      url: URL.createObjectURL(blob),
      name,
      size: blob.size,
      filename: gifFilename(name),
      issue: state.issue, // kuponda "No." olarak görünür
      phone: null, // Promise<Blob>: telefon GIF'i
      phoneFailed: false,
      phoneSource: null, // telefon GIF'inin kareleri; sonuç ekranı kapanınca bırakılır
      upload: null, // Promise<{ id, link }>: aynı çekim ikinci kez yüklenmez
      uploadedAt: 0,
    };
    if (phoneFrames) {
      entry.phoneSource = { frames: phoneFrames, rect, width: phoneW, data, order };
      startPhoneGif(entry, true);
    } else if (phoneW) {
      entry.phone = Promise.resolve(blob);
    }
    addHistory(entry);
    setPhase('idle');
    showResult(entry, ui.pose);
  }

  /**
   * Telefon GIF'ini saklanan karelerden üretir. Başarısız olursa phoneFailed işaretlenir ve
   * kareler hâlâ duruyorsa "Telefonuma gönder" / "Tekrar dene" yeniden üretir.
   */
  function startPhoneGif(entry, defer = false) {
    const { frames, rect, width, data, order } = entry.phoneSource;
    // İlk üretim arşiv GIF'i biter bitmez arka planda; sonuç ekranı gecikmesin diye bir sonraki görevde başlar
    const start = defer ? new Promise((r) => setTimeout(r, 0)) : Promise.resolve();
    const phone = start.then(() => makePhoneGif(frames, rect, width, data, order));
    entry.phone = phone;
    entry.phoneFailed = false;
    phone.catch((err) => {
      console.error("Telefon GIF'i hazırlanamadı:", err);
      if (entry.phone === phone) entry.phoneFailed = true;
    });
  }

  /** Kodlama işi: ilk kare tam sayfa (statik katman + ilk fotoğraf karesi), sonrakiler fotoğraf bölgesi. */
  function gifJob(W, frames, data, order) {
    const H = Math.round((W * 4) / 3);
    const gs = W / PAGE_W;
    const rect = photoRect(gs);
    const pageCanvas = document.createElement('canvas');
    const pctx = pageCanvas.getContext('2d', { willReadFrequently: true });
    renderPage(pageCanvas, gs, data);
    pctx.putImageData(new ImageData(new Uint8ClampedArray(frames[0]), rect.w, rect.h), rect.x, rect.y);
    const page = pctx.getImageData(0, 0, W, H).data;
    // Paletin logo renklerini koruması için logo bölgesi örneğe ayrıca eklenir
    let logo = null;
    if (logoReady()) {
      const lx = Math.floor(LOGO.x * gs);
      const ly = Math.floor(LOGO.y * gs);
      logo = pctx.getImageData(lx, ly, Math.ceil((LOGO.x + LOGO.w) * gs) - lx, Math.ceil((LOGO.y + LOGO.h) * gs) - ly).data;
    }
    return { width: W, height: H, page, logo, rect, frames, order, delay: 100 };
  }

  /**
   * Telefon GIF'i: aynı çekimin kareleri telefon genişliğine ölçeklenir, statik katman o genişlikte
   * yeniden çizilir (yazılar net kalır). Palet, döngü ve kare kuralları arşiv GIF'iyle aynı.
   */
  async function makePhoneGif(frames, srcRect, W, data, order) {
    const rect = photoRect(W / PAGE_W);
    const src = document.createElement('canvas');
    src.width = srcRect.w;
    src.height = srcRect.h;
    const sctx = src.getContext('2d');
    const dst = document.createElement('canvas');
    dst.width = rect.w;
    dst.height = rect.h;
    const dctx = dst.getContext('2d', { willReadFrequently: true });
    dctx.imageSmoothingEnabled = true;
    dctx.imageSmoothingQuality = 'high';
    const scaled = frames.map((f) => {
      sctx.putImageData(new ImageData(f, srcRect.w, srcRect.h), 0, 0);
      dctx.drawImage(src, 0, 0, rect.w, rect.h);
      return dctx.getImageData(0, 0, rect.w, rect.h).data;
    });
    const buffer = await encodeGif(gifJob(W, scaled, data, order), () => {});
    return new Blob([buffer], { type: 'image/gif' });
  }

  // ---------- GIF işçisi ----------
  // Tek işçi sayfa açılışında oluşturulur ve tüm kodlamalarda kullanılır; böylece ağ gidince de çekim sürer.
  // Yalnızca ölürse (yüklenemedi ya da yakalanmamış hata) bir sonraki işte yeniden oluşturulur.

  function createGifWorker() {
    const slot = { worker: null, ready: false, dead: true, job: null };
    try {
      slot.worker = new Worker(new URL('./gif-worker.js', import.meta.url), { type: 'module' });
    } catch (err) {
      console.warn('GIF işçisi oluşturulamadı:', err);
      return slot;
    }
    slot.dead = false;
    slot.worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        slot.ready = true;
        return;
      }
      const job = slot.job;
      if (!job) return;
      if (msg.type === 'progress') job.onProgress(msg.value);
      else if (msg.type === 'done') {
        slot.job = null;
        job.resolve(msg.buffer);
      } else if (msg.type === 'error') {
        // Kodlama hatası işçinin içinde yakalandı; işçi sağlam, yeniden oluşturulmaz
        slot.job = null;
        job.reject(new Error(msg.message));
      }
    };
    slot.worker.onerror = (e) => {
      e.preventDefault();
      slot.dead = true;
      slot.worker.terminate();
      const err = gifWorkerError(slot.ready, e.message);
      const job = slot.job;
      slot.job = null;
      if (job) job.reject(err);
      else console.warn(err.message);
    };
    return slot;
  }

  /** Ölen işçinin hatası; userMessage ekranda gösterilir. */
  function gifWorkerError(loaded, detail) {
    const err = new Error(`GIF işçisi durdu${detail ? `: ${detail}` : ''}`);
    if (loaded) err.userMessage = 'GIF hazırlanamadı. Tekrar dene.';
    else if (navigator.onLine === false) {
      err.userMessage = 'GIF hazırlanamadı: internet bağlantısı yok, GIF hazırlayıcı yeniden yüklenemedi. Bağlantı gelince tekrar dene.';
    } else err.userMessage = 'GIF hazırlayıcı yüklenemedi. Sayfayı yenileyip tekrar dene.';
    return err;
  }

  let gifWorker = createGifWorker();
  let gifQueue = Promise.resolve(); // arşiv ve telefon GIF'leri işçiyi sırayla kullanır

  function encodeGif(job, onProgress) {
    const run = gifQueue.then(() => runGifJob(job, onProgress));
    gifQueue = run.catch(() => {});
    return run;
  }

  function runGifJob(job, onProgress) {
    if (gifWorker.dead) gifWorker = createGifWorker();
    const slot = gifWorker;
    if (slot.dead) return Promise.reject(gifWorkerError(false));
    return new Promise((resolve, reject) => {
      slot.job = { resolve, reject, onProgress };
      const transfer = [job.page.buffer, ...job.frames.map((f) => f.buffer)];
      if (job.logo) transfer.push(job.logo.buffer);
      slot.worker.postMessage(job, transfer);
    });
  }

  // ---------- sonuç ekranı ----------

  function formatSize(bytes) {
    const fmt = (n) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
    return bytes >= 1024 * 1024 ? `${fmt(bytes / 1024 / 1024)} MB` : `${fmt(bytes / 1024)} KB`;
  }

  function showResult(entry, returnFocus) {
    const who = entry.name || 'Okurumuz';
    ui.resultImg.src = entry.url;
    ui.resultImg.alt = `${state.settings.title} gazete sayfası: ${who}, hareketli fotoğrafta`;
    ui.resultMeta.textContent = `${who} · ${formatSize(entry.size)}`;
    ui.resultDownload.href = entry.url;
    ui.resultDownload.download = entry.filename;
    ui.couponNo.textContent = String(entry.issue);
    state.resultEntry = entry;
    resetShare();
    state.returnFocus = returnFocus || ui.pose;
    ui.result.hidden = false;
    setPhase('result');
    announce('Baskı hazır');
    ui.resultDownload.focus();
    ui.resultTimeout.hidden = true;
    clearInterval(state.resultTimer);
    state.resultTimer = setInterval(updateResultTimer, 250);
  }

  function closeResult({ deferFocus = false, focusPose = false } = {}) {
    if (state.phase !== 'result') return;
    clearInterval(state.resultTimer);
    ui.resultTimeout.hidden = true;
    ui.result.hidden = true;
    if (state.resultEntry) state.resultEntry.phoneSource = null; // telefon GIF'inin karelerini bırak
    state.resultEntry = null;
    resetShare();
    ui.name.value = '';
    state.name = '';
    redrawStatic();
    setPhase('idle');
    const back = state.returnFocus;
    const target = !focusPose && back && back.isConnected && !back.disabled ? back : ui.pose;
    // Boşluk ile kapatıldıysa odak keyup'tan sonra taşınır; yoksa butonun keyup'ı yeni çekim başlatır.
    if (deferFocus) document.addEventListener('keyup', () => target.focus(), { once: true });
    else target.focus();
  }

  function trapFocus(e) {
    const items = [ui.resultDownload, ui.shareSend, ui.shareRetry, ui.resultAgain, ui.resultClose].filter(
      (el) => el.getClientRects().length > 0 && !el.disabled,
    );
    const i = items.indexOf(document.activeElement);
    e.preventDefault();
    const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i + 1) % items.length;
    items[next].focus();
  }

  // ---------- telefona gönder ----------

  /** Paylaşım bölümünü ilk hâline getirir; süren bir yüklemenin sonucu artık ekrana basılmaz. */
  function resetShare() {
    state.shareToken++;
    const entry = state.resultEntry;
    // Telefon GIF'i başarısız olmuş ve kareleri bırakılmışsa yeniden üretilemez; buton gösterilmez
    ui.share.hidden = !share.enabled || !entry || !entry.phone || (entry.phoneFailed && !entry.phoneSource);
    ui.shareSend.hidden = false;
    ui.shareWait.hidden = true;
    ui.shareQr.hidden = true;
    ui.shareError.hidden = true;
    const c = ui.shareQrCanvas;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
  }

  function setShareView(view) {
    const focused = ui.share.contains(document.activeElement);
    ui.shareSend.hidden = true;
    ui.shareWait.hidden = view !== 'wait';
    ui.shareQr.hidden = view !== 'qr';
    ui.shareError.hidden = view !== 'error';
    // Basılan buton kaybolunca odak sonuç ekranından düşmesin (gizlenen öğe hâlâ activeElement olabilir)
    if (focused && !document.activeElement.getClientRects().length) ui.share.focus();
  }

  /** Aynı çekimin yüklemesi tekrar kullanılır; silinmek üzereyse yeniden yüklenir. */
  function uploadEntry(entry) {
    const fresh = Date.now() - entry.uploadedAt < share.ttlMin * 60000 - SHARE_REUSE_MARGIN_MS;
    if (entry.upload && (!entry.uploadedAt || fresh)) return entry.upload;
    entry.uploadedAt = 0;
    const upload = entry.phone.then(
      (blob) => share.upload(blob),
      (err) => {
        throw new ShareError(navigator.onLine === false ? 'offline' : 'other', err);
      },
    );
    entry.upload = upload;
    upload.then(
      () => {
        entry.uploadedAt = Date.now();
      },
      () => {
        if (entry.upload === upload) entry.upload = null; // "Tekrar dene" yeniden yükler
      },
    );
    return upload;
  }

  async function sendToPhone() {
    const entry = state.resultEntry;
    if (!entry || !entry.phone || !ui.shareWait.hidden) return;
    const token = ++state.shareToken;
    const alive = () => token === state.shareToken && state.resultEntry === entry;
    try {
      ui.shareWaitText.textContent = 'Hazırlanıyor…';
      setShareView('wait');
      announce('Hazırlanıyor');
      if (entry.phoneFailed && entry.phoneSource) startPhoneGif(entry); // önce telefon GIF'ini yeniden üret
      await entry.phone.catch(() => {});
      if (!alive()) return;
      if (!entry.uploadedAt) {
        ui.shareWaitText.textContent = 'Yükleniyor…';
        announce('Yükleniyor');
      }
      const { link } = await uploadEntry(entry);
      if (!alive()) return;
      await share.qr(ui.shareQrCanvas, link);
      if (!alive()) return;
      setShareView('qr');
      announce('QR kod hazır. Telefon kameranla okut.');
      // QR göründüğü an otomatik kapanma süresi baştan başlar
      state.lastActivity = performance.now();
      updateResultTimer();
    } catch (err) {
      if (!alive()) return;
      console.warn('Telefona gönderilemedi:', err);
      const { text, hint } = describeShareError(err);
      ui.shareErrorText.textContent = text;
      ui.shareErrorHint.textContent = hint;
      ui.shareErrorHint.hidden = !hint;
      setShareView('error');
      announce(text);
      if (document.activeElement === ui.share || document.activeElement === document.body) ui.shareRetry.focus();
    }
  }

  // ---------- geçmiş ----------

  function addHistory(entry) {
    state.history.unshift(entry);
    while (state.history.length > HISTORY_MAX) URL.revokeObjectURL(state.history.pop().url);
    renderHistory();
  }

  function renderHistory() {
    ui.historyEmpty.hidden = state.history.length > 0;
    ui.historyList.replaceChildren(
      ...state.history.map((entry) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'thumb';
        btn.setAttribute('aria-label', `${entry.name || 'Okurumuz'} baskısını aç`);
        const img = document.createElement('img');
        img.src = entry.url;
        img.alt = '';
        btn.append(img);
        btn.addEventListener('click', () => {
          if (state.phase === 'idle') showResult(entry, btn);
        });
        li.append(btn);
        return li;
      }),
    );
    updateControls();
  }

  // ---------- olaylar ----------

  ui.name.addEventListener('input', () => {
    state.name = ui.name.value;
    redrawStatic();
  });

  ui.pose.addEventListener('click', pose);

  ui.another.addEventListener('click', () => {
    state.headline = pickHeadline(state.headline);
    redrawStatic();
  });

  ui.camRetry.addEventListener('click', startCamera);

  if (document.fullscreenEnabled) {
    ui.fullscreen.addEventListener('click', () => {
      const req = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
      if (req && req.catch) req.catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => {
      ui.fullscreen.textContent = document.fullscreenElement ? 'Tam ekrandan çık' : 'Tam ekran';
    });
  } else {
    ui.fullscreen.hidden = true;
  }

  ui.resultAgain.addEventListener('click', () => {
    closeResult();
    pose();
  });
  ui.resultClose.addEventListener('click', () => closeResult());
  ui.shareSend.addEventListener('click', sendToPhone);
  ui.shareRetry.addEventListener('click', sendToPhone);

  for (const type of ['pointermove', 'pointerdown', 'touchstart', 'keydown']) {
    document.addEventListener(type, markActivity, { capture: true, passive: true });
  }

  document.addEventListener('keydown', (e) => {
    if (ui.settings.open) return;
    if (state.phase === 'result') {
      if (e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        closeResult({ deferFocus: e.key === ' ' });
      } else if (e.key === 'Tab') {
        trapFocus(e);
      }
      return;
    }
    if (e.key !== ' ' && e.key !== 'Enter') return;
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t === ui.name) {
      if (e.key === 'Enter') {
        e.preventDefault();
        pose();
      }
      return;
    }
    if (t instanceof Element && t.closest('button, a, input, select, textarea, summary, [contenteditable]')) return;
    e.preventDefault();
    pose();
  });

  initSettingsDialog({
    dialog: ui.settings,
    openButton: ui.openSettings,
    getSettings: () => state.settings,
    listCameras,
    onSave(next, prev) {
      state.settings = next;
      if (next.headlineMode === 'fixed') state.headline = next.fixedHeadline;
      redrawStatic();
      if (next.cameraId !== prev.cameraId) startCamera();
    },
    share,
  });

  new ResizeObserver(resize).observe(ui.canvas);
  window.addEventListener('resize', resize);

  // Fontlar ve logo yüklenince statik katmanı yeniden çiz
  loadFonts().then(redrawStatic);
  loadLogo().then(redrawStatic);
  if (document.fonts) {
    document.fonts.ready.then(redrawStatic);
    document.fonts.addEventListener('loadingdone', redrawStatic);
  }

  resize();
  renderHistory();
  requestAnimationFrame(loop);
  startCamera();
  share.init();
}

init();
