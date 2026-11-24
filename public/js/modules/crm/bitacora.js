import { db, loadAll, byId } from '../../core/store.js';
import { esc, fmtDateTime, filterSimilar, debounce } from '../../core/utils.js';
import { fSel, fArea, readForm, validateRequired, toast, openModal, badge, emptyState, picker } from '../../core/ui.js';
import { criticalTags, CANAL_QR } from '../../core/domain.js';
import { tagsHTML } from './contacto.js';

const CANALES = ['Llamada', 'WhatsApp', 'Correo', 'Visita', 'Nota'];
const FILTROS = [...CANALES, CANAL_QR]; // "Registro QR" lo anota el sistema, por eso no se puede elegir al registrar a mano

export async function render(root) {
  const data = await loadAll('interacciones', 'pets', 'owners');
  const petMap = byId(data.pets);
  const ownerMap = byId(data.owners);
  const all = data.interacciones.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  let q = '';
  let canal = '';

  root.innerHTML = `
    <div class="toolbar">
      <ion-searchbar class="grow" id="q" placeholder="Buscar por mascota o propietario" debounce="0" autocomplete="off"></ion-searchbar>
      <ion-select id="canal" interface="popover" aria-label="Canal" fill="outline" value="">
        <ion-select-option value="">Todos los canales</ion-select-option>
        ${FILTROS.map((c) => `<ion-select-option value="${c}">${c}</ion-select-option>`).join('')}
      </ion-select>
      <ion-button id="new">Registrar interacción</ion-button>
    </div>
    <div class="panel flush"><div id="list"></div></div>`;

  const list = root.querySelector('#list');
  const paint = () => {
    let rows = all;
    if (canal) rows = rows.filter((r) => r.canal === canal);
    rows = filterSimilar(rows, q, (r) => (petMap.get(r.petId)?.nombre || '') + ' ' + (ownerMap.get(r.ownerId)?.nombre || ''));
    if (!rows.length) {
      list.innerHTML = emptyState('Sin interacciones', 'Cada llamada, mensaje o nota que registres aparecerá aquí, en orden');
      return;
    }
    list.innerHTML = rows
      .map((r) => {
        const p = petMap.get(r.petId);
        const o = ownerMap.get(r.ownerId);
        return `<article class="log">
          <div class="log-when"><strong>${fmtDateTime(r.fecha)}</strong><div>${badge(r.canal, r.canal === 'Nota' ? 'neutral' : 'info')}</div></div>
          <div class="log-body">
            <div><strong>${esc(o?.nombre || '—')}</strong>${p ? ` · <a href="#/clientes/${p.id}">${esc(p.nombre)}</a>` : ''}
              ${criticalTags(p, o).map((t) => ' ' + badge(t, 'bad')).join('')}</div>
            <p>${esc(r.nota)}</p>
          </div></article>`;
      })
      .join('');
  };
  paint();

  root.querySelector('#q').addEventListener('ionInput', debounce((e) => { q = e.target.value || ''; paint(); }, 120));
  root.querySelector('#canal').addEventListener('ionChange', (e) => { canal = e.detail.value || ''; paint(); });

  root.querySelector('#new').addEventListener('click', () => {
    let chosen = null;
    const m = openModal({
      title: 'Registrar interacción',
      size: 'sm',
      html: `<div class="muted pick-label">Mascota *</div><div id="pk"></div><div id="warn"></div>
        <form class="stack" id="bf" novalidate>
          ${fSel('canal', 'Canal', CANALES, 'Llamada', { req: true })}
          ${fArea('nota', 'Qué se conversó o acordó', '', { req: true, rows: 4 })}
        </form>`,
      footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="bs">Guardar</ion-button>`,
    });
    picker(m.body.querySelector('#pk'), {
      items: data.pets,
      textOf: (p) => p.nombre,
      subOf: (p) => ownerMap.get(p.ownerId)?.nombre || '',
      onSelect: (p) => {
        chosen = p;
        m.body.querySelector('#warn').innerHTML = p ? tagsHTML(p, ownerMap.get(p.ownerId)) : '';
      },
    });
    m.foot.querySelector('#bs').addEventListener('click', async () => {
      const form = m.body.querySelector('#bf');
      if (!chosen) return toast('Elige la mascota de la interacción.', 'danger');
      if (!validateRequired(form)) return;
      const v = readForm(form);
      await db.insert('interacciones', { petId: chosen.id, ownerId: chosen.ownerId, canal: v.canal, nota: String(v.nota).trim(), fecha: new Date().toISOString() });
      m.close();
      toast('Interacción registrada', 'success');
      render(root);
    });
  });
}
