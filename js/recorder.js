// Geri sayım, kare yakalama, sesler ve bu aşamaların fotoğraf alanı üzerindeki çizimleri.

import { PHOTO, PAGE_W, PAGE_H } from './newspaper.js';

export const COUNTDOWN_MS = 3000;
export const FLASH_MS = 380;
export const FPS = 10;

const PAPER = '#e7d9b8';
const F_DISPLAY = '"Libre Caslon Display", Georgia, serif';
const F_TEXT = '"Old Standard TT", Georgia, serif';
const HAS_LETTER_SPACING = typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;

// ---------- ses (WebAudio) ----------

export function createSound() {
  let ac = null;

  function ensure() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return ac;
  }

  function beep() {
    const a = ensure();
    if (!a) return;
    const t = a.currentTime;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  function shutter() {
    const a = ensure();
    if (!a) return;
    const t = a.currentTime;
    const len = Math.floor(a.sampleRate * 0.18);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buf;
    const filter = a.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2400;
    filter.Q.value = 0.8;
    const gain = a.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.9, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.5, t + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    src.connect(filter).connect(gain).connect(a.destination);
    src.start(t);
    src.stop(t + 0.18);
  }

  return { unlock: ensure, beep, shutter };
}

// ---------- zamanlama ----------

/** 3 sn geri sayım; her saniyenin başında onSecond(3|2|1) çağrılır. */
export function runCountdown(onSecond) {
  return new Promise((resolve) => {
    const start = performance.now();
    let next = 0;
    const step = () => {
      const t = performance.now() - start;
      while (next < 3 && t >= next * 1000) {
        onSecond(3 - next);
        next++;
      }
      if (t >= COUNTDOWN_MS) resolve();
      else setTimeout(step, Math.min(50, Math.max(0, next * 1000 - t)));
    };
    step();
  });
}

/** `count` kareyi `FPS` hızında yakalar. grab(i) kare piksellerini döndürür. */
export function captureFrames(count, grab, onFrame) {
  return new Promise((resolve, reject) => {
    const frames = [];
    const interval = 1000 / FPS;
    const start = performance.now();
    const step = () => {
      try {
        const i = frames.length;
        frames.push(grab(i));
        onFrame(i + 1, count);
        if (frames.length >= count) return resolve(frames);
        const due = start + frames.length * interval;
        setTimeout(step, Math.max(0, due - performance.now()));
      } catch (err) {
        reject(err);
      }
    };
    step();
  });
}

// ---------- fotoğraf alanı üzerindeki çizimler (mantıksal 600×800 koordinat) ----------

function clipPhoto(ctx) {
  ctx.beginPath();
  ctx.rect(PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h);
  ctx.clip();
}

/** Eski film başlangıcı: koyu perde, dolan dilim, iki halka, artı çizgileri, rakam. */
export function drawCountdown(ctx, elapsed) {
  const t = Math.max(0, Math.min(COUNTDOWN_MS - 1, elapsed));
  const digit = 3 - Math.floor(t / 1000);
  const frac = (t % 1000) / 1000;
  const cx = PHOTO.x + PHOTO.w / 2;
  const cy = PHOTO.y + PHOTO.h / 2;

  ctx.save();
  clipPhoto(ctx);

  ctx.fillStyle = 'rgba(18, 13, 9, 0.8)';
  ctx.fillRect(PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h);

  // Saat yönünde dolan dilim
  ctx.fillStyle = 'rgba(231, 217, 184, 0.16)';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, 400, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = PAPER;
  ctx.globalAlpha = 0.75;
  // Artı şeklinde çizgiler
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PHOTO.x, cy);
  ctx.lineTo(PHOTO.x + PHOTO.w, cy);
  ctx.moveTo(cx, PHOTO.y);
  ctx.lineTo(cx, PHOTO.y + PHOTO.h);
  ctx.stroke();
  // İki halka
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 150, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 124, 0, Math.PI * 2);
  ctx.stroke();

  // Ortada büyük rakam
  ctx.globalAlpha = 1;
  ctx.fillStyle = PAPER;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 170px ${F_DISPLAY}`;
  ctx.fillText(String(digit), cx, cy + 8);

  // Altta "POZ VERİN!"
  ctx.font = `400 18px ${F_TEXT}`;
  if (HAS_LETTER_SPACING) ctx.letterSpacing = '4px';
  ctx.fillText('POZ VERİN!', cx + 2, PHOTO.y + PHOTO.h - 26);
  ctx.restore();
}

/** "● ÇEKİLİYOR · KIPIRDA!" etiketi + ilerleme çubuğu. */
export function drawCaptureOverlay(ctx, progress) {
  ctx.save();
  clipPhoto(ctx);

  const label = 'ÇEKİLİYOR · KIPIRDA!';
  ctx.font = `400 13px ${F_TEXT}`;
  if (HAS_LETTER_SPACING) ctx.letterSpacing = '2px';
  const w = ctx.measureText(label).width + 40;
  const x = PHOTO.x + 14;
  const y = PHOTO.y + 14;
  ctx.fillStyle = 'rgba(18, 13, 9, 0.78)';
  ctx.fillRect(x, y, w, 28);
  ctx.fillStyle = '#c4452c';
  ctx.beginPath();
  ctx.arc(x + 15, y + 14, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PAPER;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(label, x + 28, y + 15);

  const barY = PHOTO.y + PHOTO.h - 8;
  ctx.fillStyle = 'rgba(18, 13, 9, 0.7)';
  ctx.fillRect(PHOTO.x, barY, PHOTO.w, 8);
  ctx.fillStyle = PAPER;
  ctx.fillRect(PHOTO.x, barY + 2, PHOTO.w * Math.max(0, Math.min(1, progress)), 4);
  ctx.restore();
}

/** Beyaz flaş: FLASH_MS içinde söner. */
export function drawFlash(ctx, elapsed) {
  if (elapsed >= FLASH_MS) return;
  ctx.save();
  ctx.globalAlpha = 1 - elapsed / FLASH_MS;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.restore();
}

/** "BASKIYA GİRİYOR %xx" */
export function drawEncodingOverlay(ctx, progress) {
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const cx = PHOTO.x + PHOTO.w / 2;
  const cy = PHOTO.y + PHOTO.h / 2;
  ctx.save();
  clipPhoto(ctx);
  ctx.fillStyle = 'rgba(18, 13, 9, 0.72)';
  ctx.fillRect(PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h);
  ctx.fillStyle = PAPER;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 26px ${F_DISPLAY}`;
  if (HAS_LETTER_SPACING) ctx.letterSpacing = '3px';
  ctx.fillText(`BASKIYA GİRİYOR %${pct}`, cx + 1.5, cy - 10);
  if (HAS_LETTER_SPACING) ctx.letterSpacing = '0px';
  ctx.globalAlpha = 0.35;
  ctx.fillRect(cx - 140, cy + 24, 280, 3);
  ctx.globalAlpha = 1;
  ctx.fillRect(cx - 140, cy + 24, 280 * (pct / 100), 3);
  ctx.restore();
}
