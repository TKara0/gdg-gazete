// Kamera: getUserMedia, kamera listesi, Türkçe hata mesajları.

export function hasCameraSupport() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function constraints(deviceId) {
  const video = { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' };
  if (deviceId) video.deviceId = { exact: deviceId };
  return { video, audio: false };
}

export function stopCamera(video) {
  const stream = video.srcObject;
  if (stream && stream.getTracks) stream.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}

function waitForMetadata(video) {
  if (video.readyState >= 1 && video.videoWidth) return Promise.resolve();
  return new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
}

/** Kamerayı açar; seçili kamera bulunamazsa varsayılan kameraya düşer. */
export async function openCamera(video, deviceId) {
  if (!hasCameraSupport()) {
    const err = new Error('mediaDevices yok');
    err.name = 'InsecureContextError';
    throw err;
  }
  stopCamera(video);

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints(deviceId));
  } catch (err) {
    if (deviceId && (err.name === 'OverconstrainedError' || err.name === 'NotFoundError')) {
      stream = await navigator.mediaDevices.getUserMedia(constraints(''));
    } else {
      throw err;
    }
  }

  video.srcObject = stream;
  await waitForMetadata(video);
  await video.play();
  return stream;
}

export async function listCameras() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput' && d.deviceId)
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Kamera ${i + 1}` }));
  } catch {
    return [];
  }
}

export function cameraErrorMessage(err) {
  switch (err && err.name) {
    case 'InsecureContextError':
      return 'Kamera yalnızca https üzerinden çalışır.';
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Kamera izni verilmedi. Adres çubuğundaki kamera simgesinden izin verip sayfayı yenile.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Bağlı bir kamera bulunamadı.';
    case 'NotReadableError':
      return 'Kamera başka bir uygulama tarafından kullanılıyor olabilir. O uygulamayı kapatıp tekrar dene.';
    default:
      return 'Kamera açılamadı.';
  }
}
