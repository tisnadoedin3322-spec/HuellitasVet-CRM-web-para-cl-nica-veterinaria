import { esc, filterSimilar, debounce, fmtDate } from './utils.js';

export async function toast(message, tone = 'dark') {
  const t = document.createElement('ion-toast');
  Object.assign(t, { message, duration: 2800, position: 'bottom', color: tone });
  document.body.append(t);
  t.addEventListener('didDismiss', () => t.remove());
  await customElements.whenDefined('ion-toast');
  t.present();
}

export function confirmDialog({ header, message, confirmText = 'Confirmar' }) {
  return new Promise(async (resolve) => {
    const a = document.createElement('ion-alert');
    Object.assign(a, {
      header,
      message,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: confirmText, role: 'confirm' },
      ],
    });
    a.addEventListener('didDismiss', (e) => {
      resolve(e.detail.role === 'confirm');
      a.remove();
    });
    document.body.append(a);
    await customElements.whenDefined('ion-alert');
    a.present();
  });
}

export function openModal({ title, html, footer = '', size = '' }) {
  const el = document.createElement('ion-modal');
  el.className = `vt-modal ${size}`.trim();
  el.innerHTML = `
    <div class="sheet">
      <header class="sheet-head">
        <h2>${esc(title)}</h2>
        <ion-button fill="clear" class="sm" data-close>Cerrar</ion-button>
      </header>
      <div class="sheet-body">${html}</div>
      ${footer ? `<footer class="sheet-foot">${footer}</footer>` : ''}
    </div>`;
  document.body.append(el);
  const close = () => el.dismiss();
  el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  el.addEventListener('didDismiss', () => el.remove());
  customElements.whenDefined('ion-modal').then(() => el.present());
  return { el, close, body: el.querySelector('.sheet-body'), foot: el.querySelector('.sheet-foot') };
}

/* ───────── Campos estrictos ─────────
   Cada campo declara una máscara con data-mask. Un filtro central limpia lo que se escribe,
   se pega o se autocompleta, y validateRequired revisa el formato al guardar.
   chars: caracteres NO permitidos · fix: reglas de forma · len: largo máximo por defecto */
const TEXT_CHARS = /[^\p{L}\p{M}\p{N}\s.,;:'’"\-#°º\/()&+%@_¿?¡!]/gu;
const collapseSymbols = (s) => s.replace(/([^\p{L}\p{N}\s])\1{2,}/gu, '$1');

const MASKS = {
  digits: { chars: /\D/g, fix: (s) => s, mode: 'numeric', len: 11 },
  ruc: { chars: /\D/g, fix: (s) => s, mode: 'numeric', len: 11 },
  // Celular: al escribir solo se exigen dígitos (máx. 9). Si pegan +51 987 654 321 se quita el 51.
  // Que empiece con 9 se revisa al guardar (fieldProblem), nunca borrando lo que la persona escribe.
  phone: {
    chars: /\D/g,
    fix: (s) => (s.length > 9 && s.startsWith('51') ? s.slice(2) : s),
    mode: 'numeric',
    len: 9,
  },
  int: { chars: /\D/g, fix: (s) => s.replace(/^0+(?=\d)/, ''), mode: 'numeric', len: 6 },
  // Dinero: solo dígitos y un punto con máximo 2 decimales (la coma se convierte en punto)
  money: {
    chars: /[^\d.,]/g,
    fix: (s) => {
      let v = s.replace(/,/g, '.');
      const i = v.indexOf('.');
      if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '').slice(0, 2);
      if (v.startsWith('.')) v = '0' + v;
      return v.replace(/^0+(?=\d)/, '');
    },
    mode: 'decimal',
    len: 10,
  },
  // Personas, mascotas, razas: solo letras, espacios, apóstrofe, guion y punto
  name: {
    chars: /[^\p{L}\p{M}\s'’.\-]/gu,
    fix: (s) => s.replace(/\s+/g, ' ').replace(/^[\s.'’\-]+/, '').replace(/([.'’\-])\1+/g, '$1'),
    len: 60,
    cap: 'words',
  },
  // Texto corto libre (dirección, producto, motivo): letras, números y puntuación común
  text: { chars: TEXT_CHARS, fix: (s) => collapseSymbols(s.replace(/\s+/g, ' ').replace(/^\s+/, '')), len: 80 },
  note: {
    chars: TEXT_CHARS,
    fix: (s) => collapseSymbols(s.replace(/\r/g, '').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '')),
    len: 500,
  },
  email: {
    chars: /[^A-Za-z0-9._%+\-@]/g,
    fix: (s) => {
      let seen = false;
      return s.toLowerCase().replace(/@/g, () => (seen ? '' : ((seen = true), '@'))).replace(/^[@.]+/, '').replace(/\.{2,}/g, '.');
    },
    mode: 'email',
    len: 80,
  },
  url: { chars: /[^A-Za-z0-9\-._~:\/?#[\]@!$&'()*+,;=%]/g, fix: (s) => s, mode: 'url', len: 200 },
  // Usuario de acceso: letras, números, punto, guion y guion bajo; sin espacios
  user: { chars: /[^A-Za-z0-9._\-]/g, fix: (s) => s, len: 30 },
};

const nativeOf = (t) => (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement ? t : null);
const maskHost = (t) => (nativeOf(t) ? t.closest('[data-mask]') : null);

function sanitize(host, value) {
  const m = MASKS[host.dataset.mask];
  if (!m) return String(value);
  const len = Number(host.getAttribute('maxlength')) || m.len;
  return m.fix(String(value).replace(m.chars, '')).slice(0, len);
}
const overMax = (host, v) => host.dataset.max !== undefined && v !== '' && Number(v) > Number(host.dataset.max);
const lastValue = new WeakMap();

// Evita que se escriban caracteres no permitidos (el cursor no se mueve)
document.addEventListener(
  'beforeinput',
  (e) => {
    const host = maskHost(e.target);
    if (!host) return;
    lastValue.set(host, e.target.value);
    if (e.inputType === 'insertText' && e.data && !e.data.replace(MASKS[host.dataset.mask]?.chars ?? /$^/, '')) e.preventDefault();
  },
  true,
);

// Red de seguridad: arrastrar, autocompletar o teclados que saltan el evento anterior
document.addEventListener(
  'input',
  (e) => {
    const t = e.target;
    const host = maskHost(t);
    if (!host || e.isComposing) return;
    const before = t.value;
    let clean = sanitize(host, before);
    if (overMax(host, clean)) clean = lastValue.get(host) ?? '';
    if (clean === before) return;
    const caret = t.selectionStart ?? before.length;
    const left = sanitize(host, before.slice(0, caret));
    t.value = clean;
    try {
      const p = Math.min(left.length, clean.length);
      t.setSelectionRange(p, p);
    } catch {}
  },
  true,
);

// Pegar: se limpia el texto completo (por ejemplo "+51 987 654 321" queda "987654321")
document.addEventListener(
  'paste',
  (e) => {
    const t = e.target;
    const host = maskHost(t);
    if (!host) return;
    e.preventDefault();
    lastValue.set(host, t.value);
    const s = t.selectionStart ?? t.value.length;
    const f = t.selectionEnd ?? s;
    const text = e.clipboardData?.getData('text') ?? '';
    let next = sanitize(host, t.value.slice(0, s) + text + t.value.slice(f));
    if (overMax(host, next)) next = t.value;
    t.value = next;
    try {
      t.setSelectionRange(next.length, next.length);
    } catch {}
    t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  },
  true,
);

// Al salir del campo se quitan espacios sobrantes y el punto decimal suelto ("5." pasa a "5")
document.addEventListener(
  'focusout',
  (e) => {
    const t = e.target;
    const host = maskHost(t);
    if (!host) return;
    let v = t.value.trim();
    if (host.dataset.mask === 'money') v = v.replace(/\.$/, '');
    if (v !== t.value) {
      t.value = v;
      t.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    }
  },
  true,
);

// Opciones: mask, len (largo máximo), minLen, min/max (límites numéricos; en fechas, rango de fechas)
export const fIn = (name, label, value = '', o = {}) => {
  const mask = o.mask || (o.type === 'number' ? 'money' : o.type === 'email' ? 'email' : o.type === 'tel' ? 'digits' : 'text');
  const cfg = MASKS[mask] || MASKS.text;
  const strict =
    o.type === 'date'
      ? `type="date" min="${esc(o.min || '2000-01-01')}" max="${esc(o.max || '2100-12-31')}"`
      : `type="text" data-mask="${mask}" maxlength="${o.len ?? cfg.len}" ${o.inputmode || cfg.mode ? `inputmode="${o.inputmode || cfg.mode}"` : ''}
         ${cfg.cap ? `autocapitalize="${cfg.cap}"` : ''} ${o.min !== undefined ? `data-min="${o.min}"` : ''}
         ${o.max !== undefined ? `data-max="${o.max}"` : ''} ${o.minLen ? `data-minlen="${o.minLen}"` : ''}`;
  return `<ion-input name="${name}" label="${esc(label)}${o.req ? ' *' : ''}" label-placement="${o.stacked ? 'stacked' : 'floating'}" fill="outline"
    value="${esc(value)}" ${strict} ${o.req ? 'data-req' : ''} ${o.attrs || ''}></ion-input>`;
};

export const fSel = (name, label, options, value = '', o = {}) =>
  `<ion-select name="${name}" label="${esc(label)}${o.req ? ' *' : ''}" label-placement="floating" fill="outline"
    interface="popover" value="${esc(value)}" ${o.req ? 'data-req' : ''} ${o.attrs || ''}>
    ${options
      .map((op) => {
        const [v, t] = Array.isArray(op) ? op : [op, op];
        return `<ion-select-option value="${esc(v)}">${esc(t)}</ion-select-option>`;
      })
      .join('')}
  </ion-select>`;

export const fArea = (name, label, value = '', o = {}) =>
  `<ion-textarea name="${name}" label="${esc(label)}${o.req ? ' *' : ''}" label-placement="floating" fill="outline"
    auto-grow="true" rows="${o.rows || 3}" value="${esc(value)}" data-mask="note" maxlength="${o.len ?? 500}"
    ${o.minLen ? `data-minlen="${o.minLen}"` : ''} ${o.req ? 'data-req' : ''}></ion-textarea>`;

export const fCheck = (name, label, checked = false) =>
  `<ion-checkbox name="${name}" label-placement="end" justify="start" ${checked ? 'checked' : ''}>${esc(label)}</ion-checkbox>`;

export function readForm(root) {
  const out = {};
  root.querySelectorAll('[name]').forEach((el) => {
    const k = el.getAttribute('name');
    out[k] = el.tagName === 'ION-CHECKBOX' ? !!el.checked : el.value ?? '';
  });
  return out;
}

// Devuelve el mensaje de error de un campo con valor, o '' si está bien
function fieldProblem(el, val) {
  if (el.getAttribute('type') === 'date') {
    const min = el.getAttribute('min');
    const max = el.getAttribute('max');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return 'Ingresa una fecha válida';
    if (min && val < min) return `La fecha no puede ser anterior al ${fmtDate(min)}`;
    if (max && val > max) return `La fecha no puede ser posterior al ${fmtDate(max)}`;
    return '';
  }
  switch (el.dataset?.mask) {
    case 'phone':
      return /^9\d{8}$/.test(val) ? '' : 'Ingresa un celular de 9 dígitos que empiece con 9';
    case 'ruc':
      return /^\d{11}$/.test(val) ? '' : 'El RUC tiene 11 dígitos';
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val) ? '' : 'Revisa el formato del correo';
    case 'int':
    case 'money': {
      const n = Number(val);
      if (!Number.isFinite(n)) return 'Ingresa un número válido';
      if (el.dataset.min !== undefined && n < Number(el.dataset.min)) return `El valor mínimo es ${el.dataset.min}`;
      if (el.dataset.max !== undefined && n > Number(el.dataset.max)) return `El valor máximo es ${el.dataset.max}`;
      return '';
    }
    case 'name':
    case 'text':
    case 'note': {
      if (!/[\p{L}\p{N}]/u.test(val)) return 'Escribe un texto válido';
      const need = Number(el.dataset.minlen || 0);
      return need && val.length < need ? `Escribe al menos ${need} caracteres` : '';
    }
    default:
      return '';
  }
}

export function validateRequired(root) {
  let ok = true;
  root.querySelectorAll('[data-req], [data-mask], [type="date"]').forEach((el) => {
    const val = String(el.value ?? '').trim();
    const msg = !val ? (el.hasAttribute('data-req') ? 'Este campo es obligatorio' : '') : fieldProblem(el, val);
    el.classList.toggle('ion-invalid', !!msg);
    if (msg) {
      el.classList.add('ion-touched');
      el.errorText = msg;
      ok = false;
    }
  });
  if (!ok) root.querySelector('.ion-invalid')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  return ok;
}

export function setError(root, name, message) {
  const el = root.querySelector(`[name="${name}"]`);
  if (!el) return;
  el.classList.add('ion-invalid', 'ion-touched');
  el.errorText = message;
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}

document.addEventListener('ionInput', (e) => e.target?.classList?.remove('ion-invalid'));
document.addEventListener('ionChange', (e) => {
  e.target?.classList?.remove('ion-invalid');
  const base = e.target?.dataset?.navBase;
  if (base && e.detail?.value) {
    const next = base + e.detail.value;
    if (location.hash !== next) location.hash = next;
  }
});

// Iconos en línea para botones: <ion-button>${icon('whatsapp')}Texto</ion-button>. Toman el color del botón.
const line = (d) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  trash: line('<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
  download: line('<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>'),
  upload: line('<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M5 21h14"/>'),
  back: line('<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>'),
  next: line('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'),
  undo: line('<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>'),
  lost: line('<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>'),
  whatsapp:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
};
export const icon = (name, slot = 'start') => `<span slot="${slot}" class="btn-ico ${slot}" aria-hidden="true">${ICONS[name] || ''}</span>`;

export const badge = (text, tone = 'neutral') => `<span class="badge badge-${tone}">${esc(text)}</span>`;

const USER_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';

// Sin foto: icono de usuario (en las listas el nombre ya está al lado, por eso ahí es decorativo)
export const avatar = (pet, cls = '') =>
  pet?.foto
    ? `<img class="avatar ${cls}" src="${pet.foto}" alt="Foto de ${esc(pet.nombre)}">`
    : `<span class="avatar avatar-empty ${cls}" ${cls.split(' ').includes('lg') ? 'role="img" aria-label="Sin foto"' : 'aria-hidden="true"'}>${USER_ICON}</span>`;

export const emptyState = (title, text = '') =>
  `<div class="empty"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}</div>`;

export const tabsHTML = (items, active, base) =>
  `<div class="tabs"><ion-segment scrollable="true" value="${active}" data-nav-base="${base}">
    ${items.map(([v, t]) => `<ion-segment-button value="${v}"><ion-label>${esc(t)}</ion-label></ion-segment-button>`).join('')}
  </ion-segment></div>`;

export const ratingHTML = (value, name = 'calificacion', small = false) =>
  `<div class="rating ${small ? 'sm' : ''}" data-rating="${name}" role="radiogroup" aria-label="Calificación de 1 a 5">
    ${[1, 2, 3, 4, 5]
      .map((n) => `<button type="button" role="radio" aria-checked="${n === value}" class="${n === value ? 'on' : ''}" data-v="${n}">${n}</button>`)
      .join('')}
  </div>`;

export function bindRating(root, onChange) {
  root.querySelectorAll('[data-rating]').forEach((box) => {
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      const v = Number(b.dataset.v);
      box.dataset.value = v;
      box.querySelectorAll('button').forEach((x) => {
        const on = x === b;
        x.classList.toggle('on', on);
        x.setAttribute('aria-checked', on);
      });
      onChange?.(v, box.dataset.rating);
    });
  });
}

export function picker(root, { items, textOf, subOf, placeholder = 'Buscar por nombre', onSelect, selected = null, limit = 8 }) {
  let chosen = selected;
  const draw = () => {
    if (chosen) {
      root.innerHTML = `<div class="pick-chosen"><div><strong>${esc(textOf(chosen))}</strong>
        ${subOf ? `<div class="muted">${esc(subOf(chosen))}</div>` : ''}</div>
        <ion-button fill="outline" class="sm" data-change>Cambiar</ion-button></div>`;
      root.querySelector('[data-change]').addEventListener('click', () => {
        chosen = null;
        onSelect?.(null);
        draw();
      });
      return;
    }
    root.innerHTML = `<ion-searchbar placeholder="${esc(placeholder)}" debounce="0" autocomplete="off"></ion-searchbar>
      <div class="pick-list"></div>`;
    const list = root.querySelector('.pick-list');
    const paint = (q) => {
      const found = filterSimilar(items, q, (i) => textOf(i) + ' ' + (subOf ? subOf(i) : '')).slice(0, limit);
      list.innerHTML = found.length
        ? found
            .map(
              (it, i) => `<button type="button" class="pick-item" data-i="${i}">
              <span>${esc(textOf(it))}</span><span class="sub">${esc(subOf ? subOf(it) : '')}</span></button>`,
            )
            .join('')
        : `<div class="pick-item muted">No hay coincidencias</div>`;
      list.querySelectorAll('[data-i]').forEach((b) =>
        b.addEventListener('click', () => {
          chosen = found[Number(b.dataset.i)];
          onSelect?.(chosen);
          draw();
        }),
      );
    };
    paint('');
    root.querySelector('ion-searchbar').addEventListener('ionInput', debounce((e) => paint(e.target.value || ''), 120));
  };
  draw();
  return {
    get: () => chosen,
    set: (v) => {
      chosen = v;
      draw();
    },
  };
}

export const printNode = (node) => {
  node.classList.add('print-area');
  window.print();
  setTimeout(() => node.classList.remove('print-area'), 500);
};

// Aparición suave al hacer scroll. Mejora progresiva: si el navegador no soporta
// IntersectionObserver o el usuario pidió menos movimiento, no se oculta nada.
export function revealOnScroll(root, selector) {
  const items = [...root.querySelectorAll(selector)];
  if (!items.length || !('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  items.forEach((el) => el.classList.add('reveal'));
  const io = new IntersectionObserver(
    (entries) => {
      let n = 0;
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        io.unobserve(el);
        el.style.setProperty('--reveal-d', `${n++ * 90}ms`);
        el.classList.add('is-visible');
        // Al terminar la animación se quita todo, el elemento vuelve a su estilo normal
        el.addEventListener('transitionend', function done(e) {
          if (e.target !== el || e.propertyName !== 'opacity') return;
          el.removeEventListener('transitionend', done);
          el.classList.remove('reveal', 'is-visible');
          el.style.removeProperty('--reveal-d');
        });
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -6% 0px' },
  );
  items.forEach((el) => io.observe(el));
}

export const pageHead = (title, sub = '', actions = '') =>
  `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
   <div class="head-actions">${actions}</div></div>`;
