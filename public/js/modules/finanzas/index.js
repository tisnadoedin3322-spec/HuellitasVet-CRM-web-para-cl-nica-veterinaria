import { pageHead, tabsHTML } from '../../core/ui.js';

const TABS = [
  ['pos', 'Punto de venta'],
  ['caja', 'Caja diaria'],
  ['cobrar', 'Por cobrar'],
  ['egresos', 'Egresos y por pagar'],
  ['reportes', 'Reportes'],
  ['comisiones', 'Comisiones'],
];

const loaders = {
  pos: () => import('./pos.js'),
  caja: () => import('./caja.js'),
  cobrar: () => import('./cobrar.js'),
  egresos: () => import('./egresos.js'),
  reportes: () => import('./reportes.js'),
  comisiones: () => import('./comisiones.js'),
};

export async function render(view, { parts, query }) {
  const tab = loaders[parts[0]] ? parts[0] : 'pos';
  view.innerHTML = `
    ${pageHead('Finanzas', 'Cobros, caja, deudas, gastos y rentabilidad de la clínica')}
    ${tabsHTML(TABS, tab, '#/finanzas/')}
    <div id="tab"></div>`;
  const mod = await loaders[tab]();
  await mod.render(view.querySelector('#tab'), { query });
}
