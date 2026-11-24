import { pageHead, tabsHTML } from '../../core/ui.js';

const TABS = [
  ['hoy', 'Tareas de hoy'],
  ['segmentos', 'Segmentación'],
  ['oportunidades', 'Oportunidades'],
  ['bitacora', 'Bitácora'],
  ['encuestas', 'Encuestas'],
  ['reclamos', 'Reclamos'],
];

const loaders = {
  hoy: () => import('./hoy.js'),
  segmentos: () => import('./segmentos.js'),
  oportunidades: () => import('./oportunidades.js'),
  bitacora: () => import('./bitacora.js'),
  encuestas: () => import('./encuestas.js'),
  reclamos: () => import('./reclamos.js'),
};

export async function render(view, { parts }) {
  const tab = loaders[parts[0]] ? parts[0] : 'hoy';
  view.innerHTML = `
    ${pageHead('CRM', 'Seguimiento de clientes: a quién contactar hoy, quién se está alejando y cómo les fue')}
    ${tabsHTML(TABS, tab, '#/crm/')}
    <div id="tab"></div>`;
  const mod = await loaders[tab]();
  await mod.render(view.querySelector('#tab'));
}
