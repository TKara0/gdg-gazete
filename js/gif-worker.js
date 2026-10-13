// GIF kodlama (Web Worker). İlk kare tam sayfa, sonrakiler yalnızca fotoğraf bölgesi.

import { GIFEncoder, quantize, applyPalette } from './vendor/gifenc.esm.js';

// Betik ve bağımlılıkları yüklendi; ana sayfa bundan sonraki hataları "yüklenemedi" saymaz.
self.postMessage({ type: 'ready' });

self.onmessage = (e) => {
  const { width, height, page, logo, rect, frames, order, delay } = e.data;
  try {
    // Tek global palet: tam sayfanın ilk karesi + ortadaki fotoğraf karesi
    // + logo bölgesi 4 kez daha (logo renkleri sepya fotoğrafın baskısı altında çamurlaşmasın)
    const mid = frames[Math.floor(frames.length / 2)];
    const parts = [page, mid];
    if (logo) for (let k = 0; k < 4; k++) parts.push(logo);
    const combined = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let offset = 0;
    for (const p of parts) {
      combined.set(p, offset);
      offset += p.length;
    }
    const palette = quantize(combined, 256);
    self.postMessage({ type: 'progress', value: 0.1 });

    const gif = GIFEncoder();
    gif.writeFrame(applyPalette(page, palette), width, height, { palette, delay, repeat: 0, dispose: 1 });

    const indexed = new Map(); // ileri-geri döngüde aynı kare iki kez kodlanmasın
    for (let i = 1; i < order.length; i++) {
      const f = order[i];
      let idx = indexed.get(f);
      if (!idx) {
        idx = applyPalette(frames[f], palette);
        indexed.set(f, idx);
      }
      gif.writeFrame(idx, rect.w, rect.h, { delay, dispose: 1, x: rect.x, y: rect.y });
      self.postMessage({ type: 'progress', value: 0.1 + 0.9 * (i / (order.length - 1 || 1)) });
    }

    gif.finish();
    const buffer = gif.bytes().buffer;
    self.postMessage({ type: 'done', buffer }, [buffer]);
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};
