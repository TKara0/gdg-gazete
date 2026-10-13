// Ayarlar diyaloğu + localStorage.

const STORAGE_KEY = 'kehanet-kabin-ayarlar';
const ISSUE_KEY = 'kehanet-kabin-sayi';

export const HEADLINES = [
  'Muhabirimiz bu kişiyi iş başında yakaladı',
  'Bu kişi dün gece süpürgeyle uçarken görüldü',
  'Kayıp çorapların sırrını çözdüğünü iddia ediyor',
  'Çay ocağındaki mucizenin tek tanığı konuştu',
  'Mahallenin kedileri bu kişiye neden selam veriyor?',
  'Yılın en fotojenik büyücüsü seçildi',
  'Saat kulesiyle tartışan kişi nihayet görüntülendi',
  'Uçan halı ehliyetini ilk denemede aldı',
  'Aynadaki yansımasıyla anlaşmazlığa düştü',
  'Dolunayı cebinde taşıdığı iddia edilen kişi',
];

export const DEFAULTS = Object.freeze({
  title: 'Kehanet Postası',
  slogan: "GDG On Campus Selçuk'un resmî gazetesi",
  kicker: 'Olağanüstü haber',
  headlineMode: 'random', // 'random' | 'fixed'
  fixedHeadline: HEADLINES[0],
  caption: '{isim}, muhabirimizin objektifine poz verirken.',
  duration: 2,
  gifWidth: 480,
  phoneWidth: 360, // "Telefonuma gönder" GIF'i
  cameraId: '',
  pingpong: true,
  mirror: true,
  sound: true,
});

const TEXT_FIELDS = ['title', 'slogan', 'kicker', 'fixedHeadline', 'caption'];
const OLD_DEFAULT_SLOGAN = 'Yarının haberleri bugünden';
const DURATIONS = [1.5, 2, 2.5, 3];
const WIDTHS = [360, 480, 600];
const PHONE_WIDTHS = [360, 480];
const FLAGS = ['pingpong', 'mirror', 'sound'];

/** Eksik/geçersiz alanları varsayılana döndürür. */
function normalize(raw) {
  const s = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return s;
  for (const k of TEXT_FIELDS) {
    if (typeof raw[k] === 'string' && raw[k].trim()) s[k] = raw[k].trim();
  }
  if (raw.headlineMode === 'random' || raw.headlineMode === 'fixed') s.headlineMode = raw.headlineMode;
  const dur = Number(raw.duration);
  if (DURATIONS.includes(dur)) s.duration = dur;
  const w = Number(raw.gifWidth);
  if (WIDTHS.includes(w)) s.gifWidth = w;
  const pw = Number(raw.phoneWidth);
  if (PHONE_WIDTHS.includes(pw)) s.phoneWidth = pw;
  if (typeof raw.cameraId === 'string') s.cameraId = raw.cameraId;
  for (const k of FLAGS) if (typeof raw[k] === 'boolean') s[k] = raw[k];
  return s;
}

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    // Eski varsayılan slogan yeni varsayılanla değişir; kullanıcının yazdığına dokunulmaz.
    // Eski `footer` alanı normalize() tarafından yok sayılır.
    if (raw && raw.slogan === OLD_DEFAULT_SLOGAN) raw.slogan = DEFAULTS.slogan;
    return normalize(raw);
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* depolama kapalıysa bu oturumda geçerli kalır */
  }
}

export function loadIssue() {
  try {
    const n = parseInt(localStorage.getItem(ISSUE_KEY), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  } catch {
    return 1;
  }
}

export function saveIssue(n) {
  try {
    localStorage.setItem(ISSUE_KEY, String(n));
  } catch {
    /* yok say */
  }
}

/** Bir öncekiyle aynı olmayan rastgele manşet. */
export function pickHeadline(previous) {
  const pool = HEADLINES.filter((h) => h !== previous);
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Diyaloğu bağlar.
 * opts: { dialog, openButton, getSettings, listCameras, onSave(next, prev), share }
 */
export function initSettingsDialog({ dialog, openButton, getSettings, listCameras, onSave, share }) {
  const form = dialog.querySelector('form');
  const el = (name) => form.elements.namedItem(name);
  const cameraSelect = el('cameraId');

  for (const k of TEXT_FIELDS) el(k).placeholder = DEFAULTS[k];

  function syncFixedField() {
    el('fixedHeadline').disabled = el('headlineMode').value !== 'fixed';
  }

  async function fillCameras(selected) {
    const cams = await listCameras();
    const opts = [new Option('Varsayılan kamera', '')];
    for (const c of cams) opts.push(new Option(c.label, c.deviceId));
    if (selected && !cams.some((c) => c.deviceId === selected)) {
      opts.push(new Option('Kayıtlı kamera (bulunamadı)', selected));
    }
    cameraSelect.replaceChildren(...opts);
    cameraSelect.value = selected || '';
  }

  function fill(s) {
    for (const k of TEXT_FIELDS) el(k).value = s[k];
    el('headlineMode').value = s.headlineMode;
    el('duration').value = String(s.duration);
    el('gifWidth').value = String(s.gifWidth);
    el('phoneWidth').value = String(s.phoneWidth);
    for (const k of FLAGS) el(k).checked = s[k];
    syncFixedField();
  }

  function read() {
    const raw = {};
    for (const k of TEXT_FIELDS) raw[k] = el(k).value;
    raw.headlineMode = el('headlineMode').value;
    raw.duration = el('duration').value;
    raw.gifWidth = el('gifWidth').value;
    raw.phoneWidth = el('phoneWidth').value;
    raw.cameraId = cameraSelect.value;
    for (const k of FLAGS) raw[k] = el(k).checked;
    return normalize(raw);
  }

  form.addEventListener('change', (e) => {
    if (e.target.name === 'headlineMode') syncFixedField();
  });

  openButton.addEventListener('click', () => {
    const s = getSettings();
    fill(s);
    fillCameras(s.cameraId);
    dialog.showModal();
  });

  dialog.querySelector('[data-action="defaults"]').addEventListener('click', () => {
    fill(DEFAULTS);
    cameraSelect.value = '';
  });

  dialog.querySelector('[data-action="close"]').addEventListener('click', () => dialog.close());

  initLogin(dialog, share);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const prev = getSettings();
    const next = read();
    saveSettings(next);
    dialog.close();
    onSave(next, prev);
  });
}

/**
 * Kabin girişi bölümü. Şifre yalnızca giriş isteğine gider; hiçbir yere kaydedilmez,
 * diyalog kapanınca alan temizlenir. Oturumu supabase-js kendisi saklar.
 */
function initLogin(dialog, share) {
  const form = dialog.querySelector('form');
  const el = (name) => form.elements.namedItem(name);
  const q = (sel) => dialog.querySelector(sel);
  const email = el('loginEmail');
  const password = el('loginPassword');
  const loginBtn = q('[data-action="login"]');
  const logoutBtn = q('[data-action="logout"]');
  const msg = q('#login-msg');

  const enabled = !!(share && share.enabled);
  q('#share-off').hidden = enabled;
  q('#share-on').hidden = !enabled;
  if (!enabled) return;

  function setMessage(text, isError = false) {
    msg.textContent = text;
    msg.classList.toggle('is-error', isError);
  }

  function render(user) {
    q('#login-form').hidden = !!user;
    q('#login-done').hidden = !user;
    q('#login-email').textContent = user ? user.email || '' : '';
  }

  render(null);
  share.onAuthChange(render).catch(() => setMessage('Paylaşım kütüphanesi yüklenemedi.', true));

  async function login() {
    const e = email.value.trim();
    const p = password.value;
    if (!e || !p) {
      setMessage('E-posta ve şifreyi yaz.', true);
      return;
    }
    loginBtn.disabled = true;
    setMessage('Giriş yapılıyor…');
    try {
      const user = await share.signIn(e, p);
      render(user);
      setMessage('');
    } catch (err) {
      setMessage(err.message, true);
    } finally {
      password.value = '';
      loginBtn.disabled = false;
    }
  }

  async function logout() {
    logoutBtn.disabled = true;
    try {
      await share.signOut();
      render(null);
      setMessage('Çıkış yapıldı.');
    } catch (err) {
      setMessage(err.message, true);
    } finally {
      logoutBtn.disabled = false;
    }
  }

  loginBtn.addEventListener('click', login);
  logoutBtn.addEventListener('click', logout);
  // Giriş alanlarında Enter ayarları kaydedip kapatmasın, giriş yapsın.
  for (const input of [email, password]) {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      login();
    });
  }
  dialog.addEventListener('close', () => {
    password.value = '';
    setMessage('');
  });
}
