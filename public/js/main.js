import { ensureSeed, resetDemo } from './core/seed.js';
import { parseHash, esc } from './core/utils.js';
import { confirmDialog, toast } from './core/ui.js';
import { openBackupModal } from './core/backup.js';

const NAV = [
  ['registro', 'Registro'],
  ['clientes', 'Clientes'],
  ['proveedores', 'Proveedores'],
  ['inventario', 'Inventario'],
  ['crm', 'CRM'],
  ['finanzas', 'Finanzas'],
];

const loaders = {
  registro: () => import('./modules/registro.js'),
  clientes: () => import('./modules/clientes.js'),
  proveedores: () => import('./modules/proveedores.js'),
  inventario: () => import('./modules/inventario.js'),
  crm: () => import('./modules/crm/index.js'),
  finanzas: () => import('./modules/finanzas/index.js'),
};

const view = document.getElementById('view');
const nav = document.getElementById('nav');

// Pantalla de carga: dura al menos ~0,9 s y se oculta cuando Ionic y la primera pantalla están listos.
const splash = document.getElementById('splash');
const closeSplash = () => {
  if (!splash || splash.classList.contains('hide')) return;
  splash.classList.add('hide');
  setTimeout(() => splash.remove(), 600);
};
const hideSplash = async () => {
  await customElements.whenDefined('ion-app');
  setTimeout(closeSplash, Math.max(0, 900 - performance.now()));
};
setTimeout(closeSplash, 10000); // por si algo falla al cargar, que no se quede cargando para siempre

// Sesión: quién está conectado y cómo salir (los datos de la clínica no se tocan)
const usuario = (() => { try { return localStorage.getItem('vetara.usuario') || ''; } catch { return ''; } })();
document.getElementById('user-name').textContent = usuario || 'Invitado';
document.getElementById('backup').addEventListener('click', openBackupModal);
document.getElementById('logout').addEventListener('click', () => {
  try { localStorage.removeItem('vetara.usuario'); } catch {}
  location.href = '/login.html';
});

nav.innerHTML = NAV.map(([k, t]) => `<a href="#/${k}" data-key="${k}">${t}</a>`).join('');

let token = 0;

async function route() {
  const { parts, query } = parseHash();
  const key = loaders[parts[0]] ? parts[0] : 'clientes';
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.key === key));
  const mine = ++token;
  try {
    const mod = await loaders[key]();
    if (mine !== token) return;
    view.innerHTML = '';
    await mod.render(view, { parts: parts.slice(1), query });
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="panel"><h2>No se pudo cargar la pantalla</h2><p class="muted">${esc(err.message)}</p></div>`;
  }
  document.getElementById('scroller')?.scrollToTop?.(0);
  document.querySelector('ion-menu')?.close?.();
  hideSplash();
}

// Restablecer borra todo: el botón solo existe en tu computadora (localhost), no en la versión publicada
const resetBtn = document.getElementById('reset-demo');
if (!['localhost', '127.0.0.1'].includes(location.hostname)) resetBtn.remove();
else resetBtn.addEventListener('click', async () => {
  const ok = await confirmDialog({
    header: 'Restablecer datos de ejemplo',
    message: 'Se borrarán todos los registros actuales y se cargarán los datos de ejemplo.',
    confirmText: 'Restablecer',
  });
  if (!ok) return;
  await resetDemo();
  toast('Datos de ejemplo restablecidos', 'success');
  route();
});

window.addEventListener('hashchange', route);

await ensureSeed();
if (!location.hash) location.hash = '#/clientes';
else route();
