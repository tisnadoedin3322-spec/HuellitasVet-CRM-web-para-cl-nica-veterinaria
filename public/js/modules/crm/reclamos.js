import { db, loadAll, byId } from '../../core/store.js';
import { esc, fmtDate } from '../../core/utils.js';
import { toast, badge, emptyState } from '../../core/ui.js';
import { openContactModal, primerNombre } from './contacto.js';
import { getSettings } from '../../core/domain.js';

const ESTADOS = ['Abierto', 'En proceso', 'Resuelto'];
const TONE = { Abierto: 'bad', 'En proceso': 'warn', Resuelto: 'ok' };

export async function render(root) {
  const data = await loadAll('reclamos', 'pets', 'owners');
  const cfg = await getSettings();
  const petMap = byId(data.pets);
  const ownerMap = byId(data.owners);
  const rows = data.reclamos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const n = (e) => rows.filter((r) => r.estado === e).length;

  root.innerHTML = `
    <div class="kpis">
      ${ESTADOS.map((e) => `<div class="kpi ${e === 'Abierto' && n(e) ? 'bad' : e === 'Resuelto' ? 'good' : ''}"><div class="label">${e === 'Abierto' ? 'Abiertos' : e === 'En proceso' ? 'En proceso' : 'Resueltos'}</div><div class="value">${n(e)}</div></div>`).join('')}
    </div>
    <div class="panel flush"><div class="panel-head"><h2>Reclamos</h2><span class="muted">Llegan solos cuando una encuesta tiene calificación de 1 a 3</span></div>
    <div class="table-wrap">${
      rows.length
        ? `<table class="table"><thead><tr><th>Fecha</th><th>Mascota</th><th>Calificación</th><th>Motivo</th><th>Estado</th><th></th></tr></thead><tbody>
        ${rows
          .map((r) => {
            const p = petMap.get(r.petId);
            const o = ownerMap.get(r.ownerId);
            return `<tr><td class="nowrap">${fmtDate(r.fecha)}</td>
            <td><a href="#/clientes/${p?.id}"><strong>${esc(p?.nombre || '—')}</strong></a><div class="faint">${esc(o?.nombre || '')}</div></td>
            <td>${badge(`${r.calificacion} de 5`, 'bad')}</td><td class="muted reclamo-text">${esc(r.comentario)}</td>
            <td><ion-select class="estado-sel" interface="popover" aria-label="Estado" value="${r.estado}" data-id="${r.id}">
              ${ESTADOS.map((e) => `<ion-select-option value="${e}">${e}</ion-select-option>`).join('')}</ion-select></td>
            <td class="right"><ion-button class="sm" fill="outline" data-c="${r.id}">Contactar</ion-button></td></tr>`;
          })
          .join('')}</tbody></table>`
        : emptyState('No hay reclamos', 'Cuando un cliente califique con 1 a 3, el caso aparecerá aquí')
    }</div></div>`;

  root.querySelectorAll('.estado-sel').forEach((s) =>
    s.addEventListener('ionChange', async (e) => {
      const r = rows.find((x) => x.id === s.dataset.id);
      if (!r || r.estado === e.detail.value) return;
      await db.update('reclamos', r.id, { estado: e.detail.value });
      toast(`Reclamo marcado como “${e.detail.value}”`, 'success');
      render(root);
    }),
  );
  root.querySelectorAll('[data-c]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = rows.find((x) => x.id === b.dataset.c);
      const p = petMap.get(r.petId);
      const o = ownerMap.get(r.ownerId);
      openContactModal({
        pet: p,
        owner: o,
        asunto: 'Queremos resolver tu reclamo',
        mensaje: `Hola ${primerNombre(o)}, soy parte del equipo de ${cfg.clinica}. Lamentamos que la atención de ${p?.nombre || 'tu mascota'} no haya sido la esperada. Queremos escucharte y resolverlo. ¿Cuándo podemos llamarte?`,
        nota: 'Contacto por reclamo.',
      });
    }),
  );
}
