const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

export const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export const money = (n) =>
  'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// randomUUID solo existe con https (o localhost): con http se arma un UUID válido igual, la nube exige ese formato
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16),
  );

const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export const parseISO = (s) => {
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
export const addMonths = (iso, n) => {
  const d = parseISO(iso);
  d.setMonth(d.getMonth() + n);
  return toISO(d);
};
export const diffDays = (a, b) => Math.round((parseISO(a) - parseISO(b)) / 86400000);

export const fmtDate = (iso) =>
  iso
    ? parseISO(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '—';

export const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('es-PE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const monthName = (iso) =>
  parseISO(iso).toLocaleDateString('es-PE', { month: 'short', year: '2-digit' }).replace('.', '');

export function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function matchScore(query, text) {
  const q = norm(query);
  if (!q) return 0;
  const t = norm(text);
  if (t.includes(q)) return 0;
  const words = t.split(/[\s,.\-/]+/).filter(Boolean);
  let total = 0;
  for (const w of q.split(/\s+/)) {
    let best = Infinity;
    for (const x of words) {
      const d = Math.min(lev(w, x), lev(w, x.slice(0, w.length)));
      if (d < best) best = d;
    }
    const tol = w.length <= 3 ? 0 : w.length <= 5 ? 1 : 2;
    if (best > tol) return -1;
    total += best;
  }
  return total + 1;
}

export function filterSimilar(items, query, textOf) {
  if (!norm(query)) return items;
  return items
    .map((item) => ({ item, s: matchScore(query, textOf(item)) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .map((x) => x.item);
}

export const initials = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

const AVATAR_COLORS = ['#0f3f4c', '#2d5da1', '#4a5a68', '#2e7d5b', '#5d4a8a', '#7a5a2b'];
export const avatarColor = (seed) => {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

export const ageText = (p) => {
  const a = Number(p.edadAnios || 0);
  const m = Number(p.edadMeses || 0);
  const parts = [];
  if (a) parts.push(`${a} ${a === 1 ? 'año' : 'años'}`);
  if (m) parts.push(`${m} ${m === 1 ? 'mes' : 'meses'}`);
  return parts.join(' y ') || 'Menos de 1 mes';
};

export const ageYears = (p) => Number(p.edadAnios || 0) + Number(p.edadMeses || 0) / 12;

export const digits = (s) => String(s ?? '').replace(/\D/g, '');

export const waLink = (phone, text) => {
  let n = digits(phone);
  if (n.length === 9) n = '51' + n;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
};

export const mailLink = (to, subject, body) =>
  `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);

export const groupBy = (arr, f) => {
  const m = new Map();
  for (const x of arr) {
    const k = f(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};

export const debounce = (fn, ms = 160) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  return { parts: path.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(qs)) };
}

export function resizeImage(file, max = 480) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
