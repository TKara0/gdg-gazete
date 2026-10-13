// Sepya + gren + vinyet + çizik/toz efekti (piksel bazlı).

/** Seed'li PRNG: aynı seed her zaman aynı diziyi verir. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Boyut başına bir kez üretilen noise + vignette tabloları.
const tableCache = new Map();
const MAX_CACHED_SIZES = 4;

function getTables(w, h) {
  const key = w + 'x' + h;
  let t = tableCache.get(key);
  if (t) return t;

  const n = w * h;
  const rng = mulberry32(0x5eed ^ (w * 73856093) ^ (h * 19349663));
  const noise = [];
  for (let k = 0; k < 4; k++) {
    const arr = new Int8Array(n);
    for (let p = 0; p < n; p++) arr[p] = (rng() * 256 - 128) | 0;
    noise.push(arr);
  }

  const vignette = new Float32Array(n);
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const maxD = Math.hypot(cx, cy) || 1;
  for (let y = 0, p = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++, p++) {
      const d = Math.hypot(x - cx, dy) / maxD;
      vignette[p] = 1 - 0.6 * Math.pow(d, 2.3);
    }
  }

  t = { noise, vignette };
  if (tableCache.size >= MAX_CACHED_SIZES) tableCache.delete(tableCache.keys().next().value);
  tableCache.set(key, t);
  return t;
}

/** Kamera görüntüsünü w×h alanına "cover" mantığıyla çizer; ayna açıksa yatay çevirir. */
export function drawCover(ctx, video, w, h, mirror) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return false;
  const scale = Math.max(w / vw, h / vh);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (vw - sw) / 2;
  const sy = (vh - sh) / 2;
  ctx.save();
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
  ctx.restore();
  return true;
}

/**
 * Fotoğraf karesini üretir: kamera → sepya/gren/vinyet/titreme → çizik + toz.
 * ctx, boyutu w×h olan ve {willReadFrequently:true} ile açılmış bir canvas'a ait olmalı.
 */
export function renderPhoto(ctx, video, w, h, { mirror, tick, grain }) {
  ctx.fillStyle = '#16100b';
  ctx.fillRect(0, 0, w, h);
  drawCover(ctx, video, w, h, mirror);

  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const { noise, vignette } = getTables(w, h);
  const nz = noise[((tick % 4) + 4) % 4];
  const rng = mulberry32(Math.imul(tick + 1, 2654435761));
  const flicker = 0.9 + rng() * 0.12;
  const n = w * h;

  // d bir Uint8ClampedArray: atamalar otomatik olarak 0–255 arasına kısıtlanır.
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    let l = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    l = (l - 128) * 1.22 + 136 + nz[p] * grain;
    l = l * vignette[p] * flicker;
    d[i] = l + 22;
    d[i + 1] = l * 0.9 + 10;
    d[i + 2] = l * 0.7 + 2;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const u = w / 526; // fotoğraf alanının mantıksal genişliğine göre ölçek

  // Kare başına %40 ihtimalle ince dikey açık renkli çizik
  if (rng() < 0.4) {
    const x = rng() * w;
    const lw = Math.max(1, u * (0.6 + rng() * 0.8));
    const top = rng() * h * 0.3;
    const len = h * (0.5 + rng() * 0.5);
    ctx.fillStyle = `rgba(250, 240, 215, ${0.25 + rng() * 0.3})`;
    ctx.fillRect(x, top, lw, len);
  }

  // Birkaç rastgele toz noktası
  const dots = 2 + Math.floor(rng() * 5);
  for (let k = 0; k < dots; k++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = Math.max(0.6, u * (0.5 + rng() * 1.6));
    ctx.fillStyle = rng() < 0.6 ? `rgba(18, 11, 6, ${0.45 + rng() * 0.4})` : `rgba(250, 240, 215, ${0.35 + rng() * 0.35})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
