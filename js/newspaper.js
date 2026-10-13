// Statik gazete katmanı: 600×800 mantıksal koordinatta çizilir, istenen ölçekte üretilir.

import { mulberry32 } from './effects.js';

export const PAGE_W = 600;
export const PAGE_H = 800;
/** Koyu zeminli fotoğraf alanı */
export const PHOTO_FRAME = { x: 32, y: 272, w: 536, h: 408 };
/** Kamera görüntüsünün çizildiği alan (5px içeride) */
export const PHOTO = { x: 37, y: 277, w: 526, h: 398 };
/** Alt bilgideki logo: genişlik 326, oranlı yükseklik, y=750..794 arasında dikey ortalı */
const LOGO_SRC = 'assets/gdg-selcuk-logo-gazete.png';
const LOGO_W = 326;
const LOGO_RATIO = 223 / 1700;
const LOGO_H = LOGO_W * LOGO_RATIO;
export const LOGO = { x: (PAGE_W - LOGO_W) / 2, y: (750 + 794) / 2 - LOGO_H / 2, w: LOGO_W, h: LOGO_H };

const INK = '#1e160f';
const INK_FADED = '#5b4a36';
const PAPER = '#e7d9b8';
const MARGIN_L = 32;
const MARGIN_R = 568;
const COL_W = MARGIN_R - MARGIN_L; // 536

const F_GOTHIC = '"Grenze Gotisch", Georgia, serif';
const F_DISPLAY = '"Libre Caslon Display", Georgia, serif';
const F_TEXT = '"Old Standard TT", Georgia, serif';

const HAS_LETTER_SPACING = typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;

const upper = (s) => s.toLocaleUpperCase('tr-TR');

/** Fotoğraf dikdörtgenini verilen ölçeğe yuvarlar (x/y ve sağ/alt kenar ayrı ayrı). */
export function photoRect(scale) {
  const x = Math.round(PHOTO.x * scale);
  const y = Math.round(PHOTO.y * scale);
  const r = Math.round((PHOTO.x + PHOTO.w) * scale);
  const b = Math.round((PHOTO.y + PHOTO.h) * scale);
  return { x, y, w: r - x, h: b - y };
}

/** Gazete fontlarını (Türkçe karakter alt kümeleriyle birlikte) yükler. */
export function loadFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const sample = 'Kehanet Postası İıŞşĞğÜüÖöÇç 0123456789 ·';
  return Promise.allSettled([
    document.fonts.load(`900 70px "Grenze Gotisch"`, sample),
    document.fonts.load(`400 36px "Libre Caslon Display"`, sample),
    document.fonts.load(`400 14px "Old Standard TT"`, sample),
    document.fonts.load(`italic 400 14px "Old Standard TT"`, sample),
  ]);
}

const logo = { img: null, status: 'idle' }; // 'idle' | 'loading' | 'ok' | 'error'

/** Gazete logosunu önceden yükler; yüklense de yüklenemese de çözülür. */
export function loadLogo() {
  if (logo.status !== 'idle') return Promise.resolve(logo.status);
  logo.status = 'loading';
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      logo.img = img;
      logo.status = 'ok';
      resolve(logo.status);
    };
    img.onerror = () => {
      logo.status = 'error';
      resolve(logo.status);
    };
    img.src = LOGO_SRC;
  });
}

/** Logo statik katmana çizilebiliyor mu (GIF paletinde logo bölgesi örneklenecek mi). */
export function logoReady() {
  return logo.status === 'ok';
}

// ---------- yardımcılar ----------

function setSpacing(ctx, px) {
  if (HAS_LETTER_SPACING) ctx.letterSpacing = px + 'px';
}

/** Harf aralıklı metin; harf aralığının sondaki fazlasını hizaya göre telafi eder. */
function spacedText(ctx, text, x, y, spacing, align) {
  ctx.save();
  ctx.textAlign = align;
  if (HAS_LETTER_SPACING && spacing) {
    setSpacing(ctx, spacing);
    if (align === 'center') x += spacing / 2;
    else if (align === 'right') x += spacing;
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

function measureSpaced(ctx, text, spacing) {
  ctx.save();
  if (spacing) setSpacing(ctx, spacing);
  const w = ctx.measureText(text).width - (HAS_LETTER_SPACING ? spacing : 0);
  ctx.restore();
  return w;
}

function rule(ctx, y, width, x0 = MARGIN_L, x1 = MARGIN_R) {
  ctx.fillRect(x0, y - width / 2, x1 - x0, width);
}

function wrap(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (!line || ctx.measureText(test).width <= maxW) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t.trimEnd() + '…';
}

/** En fazla `max` satıra böler; taşan kısım son satırda "…" ile kesilir. */
function wrapMax(ctx, text, maxW, max) {
  const lines = wrap(ctx, text, maxW);
  if (lines.length <= max) return lines.map((l) => ellipsize(ctx, l, maxW));
  const kept = lines.slice(0, max);
  kept[max - 1] = ellipsize(ctx, lines.slice(max - 1).join(' '), maxW);
  return kept;
}

// ---------- kâğıt ----------

let paperTile = null;
function getPaperTile() {
  if (paperTile) return paperTile;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(128, 128);
  const rng = mulberry32(1847);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 255 - Math.floor(rng() * rng() * 46);
    img.data[i] = v;
    img.data[i + 1] = v - 2;
    img.data[i + 2] = v - 6;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  paperTile = c;
  return c;
}

function drawPaper(ctx) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // Prosedürel doku: cihaz pikselinde, multiply
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = ctx.createPattern(getPaperTile(), 'repeat');
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

function drawAging(ctx) {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';

  // Birkaç kahverengi leke
  const rng = mulberry32(90210);
  for (let i = 0; i < 6; i++) {
    const x = rng() * PAGE_W;
    const y = rng() * PAGE_H;
    const r = 30 + rng() * 90;
    const a = 0.06 + rng() * 0.1;
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r);
    g.addColorStop(0, `rgba(150, 105, 55, ${a})`);
    g.addColorStop(0.75, `rgba(140, 95, 45, ${a * 0.6})`);
    g.addColorStop(0.92, `rgba(120, 78, 35, ${a * 1.2})`);
    g.addColorStop(1, 'rgba(120, 78, 35, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Kenarlarda koyulaşan vinyet
  const v = ctx.createRadialGradient(PAGE_W / 2, PAGE_H / 2, 250, PAGE_W / 2, PAGE_H / 2, 520);
  v.addColorStop(0, 'rgb(255, 255, 255)');
  v.addColorStop(1, 'rgb(176, 142, 100)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.restore();
}

// ---------- sayfa ----------

/**
 * Statik katmanı canvas'a çizer. Canvas boyutu 600×800 × scale olarak ayarlanır.
 * data: { title, slogan, kicker, headline, caption, issue, date }
 */
export function renderPage(canvas, scale, data) {
  const cw = Math.round(PAGE_W * scale);
  const ch = Math.round(PAGE_H * scale);
  if (canvas.width !== cw) canvas.width = cw;
  if (canvas.height !== ch) canvas.height = ch;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.textBaseline = 'alphabetic';

  drawPaper(ctx);

  ctx.fillStyle = INK;

  // Üst satır
  rule(ctx, 34, 1);
  rule(ctx, 58, 1);
  ctx.font = `400 10.5px ${F_TEXT}`;
  ctx.fillStyle = INK;
  const dateStr = new Intl.DateTimeFormat('tr-TR', { dateStyle: 'full' }).format(data.date);
  spacedText(ctx, upper(`Cilt CXII · Sayı ${data.issue}`), MARGIN_L, 50, 1.6, 'left');
  spacedText(ctx, upper(dateStr), PAGE_W / 2, 50, 1.6, 'center');
  spacedText(ctx, upper('Fiyatı 7 kuruş'), MARGIN_R, 50, 1.6, 'right');

  // Gazete adı
  let size = 70;
  ctx.font = `900 ${size}px ${F_GOTHIC}`;
  const tw = ctx.measureText(data.title).width;
  if (tw > COL_W) {
    size = Math.floor((size * COL_W) / tw);
    ctx.font = `900 ${size}px ${F_GOTHIC}`;
  }
  ctx.textAlign = 'center';
  ctx.fillText(data.title, PAGE_W / 2, 124);

  // Slogan: 536px'e sığana kadar küçülür (en az 11px)
  const slogan = `${data.slogan}  ·  Güvercinle teslimat ücretsizdir`;
  let sloganSize = 14;
  ctx.font = `italic 400 ${sloganSize}px ${F_TEXT}`;
  while (sloganSize > 11 && ctx.measureText(slogan).width > COL_W) {
    sloganSize = Math.max(11, sloganSize - 0.5);
    ctx.font = `italic 400 ${sloganSize}px ${F_TEXT}`;
  }
  ctx.fillStyle = INK_FADED;
  ctx.fillText(ellipsize(ctx, slogan, COL_W), PAGE_W / 2, 147);

  // Çift çizgi
  ctx.fillStyle = INK;
  rule(ctx, 158, 2.5);
  rule(ctx, 163, 1);

  // Üst başlık + iki yanında ince çizgi
  ctx.font = `400 10px ${F_TEXT}`;
  const kicker = upper(data.kicker);
  const kw = measureSpaced(ctx, kicker, 3);
  spacedText(ctx, kicker, PAGE_W / 2, 186, 3, 'center');
  ctx.fillStyle = INK_FADED;
  const gap = 12;
  const len = 96;
  rule(ctx, 182.5, 0.75, PAGE_W / 2 - kw / 2 - gap - len, PAGE_W / 2 - kw / 2 - gap);
  rule(ctx, 182.5, 0.75, PAGE_W / 2 + kw / 2 + gap, PAGE_W / 2 + kw / 2 + gap + len);

  // Manşet: en fazla 2 satır, 36px → 22px, y=199..265 arasında dikey ortalı
  ctx.fillStyle = INK;
  drawHeadline(ctx, upper(data.headline));

  // Fotoğraf alanı: koyu zemin + 3.5px dışarıda 1px çerçeve
  ctx.fillStyle = '#16100b';
  ctx.fillRect(PHOTO_FRAME.x, PHOTO_FRAME.y, PHOTO_FRAME.w, PHOTO_FRAME.h);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.strokeRect(PHOTO_FRAME.x - 3.5, PHOTO_FRAME.y - 3.5, PHOTO_FRAME.w + 7, PHOTO_FRAME.h + 7);

  // Fotoğraf altı yazısı
  ctx.font = `italic 400 13.5px ${F_TEXT}`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  wrapMax(ctx, data.caption, COL_W, 2).forEach((line, i) => ctx.fillText(line, PAGE_W / 2, 704 + i * 17));

  // Alt çift çizgi + logo
  rule(ctx, 740, 1);
  rule(ctx, 745, 2.5);
  drawLogo(ctx);

  drawAging(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

/** Logo kâğıda basılmış gibi (multiply) çizilir; yüklenemediyse aynı yere yazı basılır. */
function drawLogo(ctx) {
  if (logo.status === 'ok') {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(logo.img, LOGO.x, LOGO.y, LOGO.w, LOGO.h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  } else if (logo.status === 'error') {
    ctx.font = `400 10px ${F_TEXT}`;
    ctx.fillStyle = INK_FADED;
    spacedText(ctx, 'GDG ON CAMPUS SELÇUK UNIVERSITY', PAGE_W / 2, LOGO.y + LOGO.h / 2 + 3.5, 2.6, 'center');
  }
}

/** Satır bloğunun gerçek glif yüksekliği (İ noktası, Ç çengeli dahil). */
function headlineBlock(ctx, lines, lh) {
  const first = ctx.measureText(lines[0]);
  const last = ctx.measureText(lines[lines.length - 1]);
  const ascent = first.actualBoundingBoxAscent;
  const descent = last.actualBoundingBoxDescent;
  return { ascent, height: ascent + (lines.length - 1) * lh + descent };
}

function drawHeadline(ctx, text) {
  const top = 199;
  const bottom = 265;
  const area = bottom - top;
  let size = 36;
  let lines;
  let block;
  for (; size >= 22; size--) {
    ctx.font = `400 ${size}px ${F_DISPLAY}`;
    lines = wrap(ctx, text, COL_W);
    if (lines.length > 2 || !lines.every((l) => ctx.measureText(l).width <= COL_W)) continue;
    block = headlineBlock(ctx, lines, size * 1.1);
    if (block.height <= area) break;
  }
  if (size < 22) {
    size = 22;
    ctx.font = `400 ${size}px ${F_DISPLAY}`;
    lines = wrapMax(ctx, text, COL_W, 2);
    block = headlineBlock(ctx, lines, size * 1.1);
  }
  const lh = size * 1.1;
  let y = top + (area - block.height) / 2 + block.ascent;
  ctx.textAlign = 'center';
  for (const line of lines) {
    ctx.fillText(line, PAGE_W / 2, y);
    y += lh;
  }
}

/**
 * Boşta bekleme yazısı: fotoğraf alanının altında, alt yazının yerinde (o sırada alt yazı çizilmez).
 * alpha ile yanıp söner.
 */
export function drawIdlePrompt(ctx, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = INK;
  ctx.font = `400 17px ${F_DISPLAY}`;
  spacedText(ctx, 'POZ VERMEK İÇİN BOŞLUĞA BAS', PAGE_W / 2, 718, 3, 'center');
  ctx.restore();
}

/** Kamera hazır değilken fotoğraf alanına yazılan mesaj (mantıksal koordinatta). */
export function drawPhotoMessage(ctx, text) {
  ctx.save();
  ctx.fillStyle = '#16100b';
  ctx.fillRect(PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h);
  ctx.fillStyle = PAPER;
  ctx.globalAlpha = 0.85;
  ctx.font = `italic 400 22px ${F_TEXT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, PHOTO.x + PHOTO.w / 2, PHOTO.y + PHOTO.h / 2);
  ctx.restore();
}
