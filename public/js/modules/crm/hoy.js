import { db, loadAll } from '../../core/store.js';
import { esc, fmtDate, todayISO, addDays } from '../../core/utils.js';
import { badge, avatar, emptyState, toast, icon } from '../../core/ui.js';
import { computeAlerts, whenText, getSettings } from '../../core/domain.js';
import { openContactModal, primerNombre, logInteraccion } from './contacto.js';

const HORIZONS = [
  ['0', 'Solo vencidos y de hoy'],
  ['7', 'Próximos 7 días'],
  ['15', 'Próximos 15 días'],
  ['30', 'Próximos 30 días'],
];

export async function render(root) {
  const data = await loadAll('pets', 'owners', 'services');
  const cfg = await getSettings();
  const today = todayISO();
  const all = computeAlerts(data, today);
  const recent = addDays(today, -7);
  const contacted = (a) => a.service.avisoEnviado && a.service.avisoEnviado >= recent;
  let horizon = '7';

  const count = (f) => all.filter(f).length;
  const kpis = `<div class="kpis">
    <div class="kpi ${count((a) => a.dias < 0 && !contacted(a)) ? 'bad' : ''}"><div class="label">Vencidos sin contactar</div><div class="value">${count((a) => a.dias < 0 && !contacted(a))}</div></div>
    <div class="kpi ${count((a) => a.dias === 0 && !contacted(a)) ? 'warn' : ''}"><div class="label">Vencen hoy</div><div class="value">${count((a) => a.dias === 0 && !contacted(a))}</div></div>
    <div class="kpi"><div class="label">Vencen en 7 días</div><div class="value">${count((a) => a.dias > 0 && a.dias <= 7 && !contacted(a))}</div></div>
    <div class="kpi good"><div class="label">Contactados esta semana</div><div class="value">${count(contacted)}</div></div>
  </div>`;

  root.innerHTML = `${kpis}
    <div class="toolbar">
      <ion-select id="hz" interface="popover" label="Mostrar" label-placement="stacked" fill="outline" value="7">
        ${HORIZONS.map(([v, t]) => `<ion-select-option value="${v}">${t}</ion-select-option>`).join('')}
      </ion-select>
      <span class="muted">Sale del historial médico: vacunas, desparasitaciones, controles y baños</span>
    </div>
    <div id="list" class="stack"></div>`;

  const list = root.querySelector('#list');

  const task = (a) => {
    const { pet, owner, service: s, dias } = a;
    const tone = dias < 0 ? 'bad' : dias === 0 ? 'warn' : dias <= 3 ? 'warn' : 'info';
    const done = contacted(a);
    return `<article class="task ${done ? 'done' : ''}" data-key="${s.id}">
      <div class="cell-pet">${avatar(pet)}<div>
        <strong><a href="#/clientes/${pet.id}">${esc(pet.nombre)}</a> · ${esc(owner?.nombre || '')}</strong>
        <span class="sub">${esc(s.tipo)} ${whenText(dias)} (${fmtDate(s.proximaFecha)})</span>
      </div></div>
      <div class="task-tags">${badge(dias < 0 ? `Vencido hace ${-dias} d` : dias === 0 ? 'Hoy' : `En ${dias} d`, tone)}
        ${pet.agresiva ? badge('Mascota agresiva', 'bad') : ''} ${owner?.conflictivo ? badge('Propietario conflictivo', 'bad') : ''}
        ${done ? badge(`Contactado ${fmtDate(s.avisoEnviado)}`, 'ok') : ''}</div>
      <div class="task-actions">
        <ion-button class="sm" data-act="wa">${icon('whatsapp')}WhatsApp</ion-button>
        <ion-button class="sm" fill="outline" data-act="mail" ${owner?.correo ? '' : 'disabled'}>${icon('mail')}Correo</ion-button>
        <ion-button class="sm" fill="clear" data-act="call">Registrar llamada</ion-button>
      </div></article>`;
  };

  const paint = () => {
    const h = Number(horizon);
    const visible = all.filter((a) => a.dias <= h);
    const pending = visible.filter((a) => !contacted(a));
    const done = visible.filter(contacted);
    if (!visible.length) {
      list.innerHTML = `<div class="panel">${emptyState('Nada por contactar en este rango', 'Cuando una vacuna, desparasitación, control o baño esté por vencer, aparecerá aquí')}</div>`;
      return;
    }
    const group = (title, items) =>
      items.length ? `<h3 class="group-title">${title} <span class="faint">${items.length}</span></h3>${items.map(task).join('')}` : '';
    list.innerHTML =
      group('Vencidos', pending.filter((a) => a.dias < 0)) +
      group('Vencen hoy', pending.filter((a) => a.dias === 0)) +
      group('Próximos', pending.filter((a) => a.dias > 0)) +
      group('Ya contactados', done);
    if (!pending.length) list.insertAdjacentHTML('afterbegin', `<div class="banner info">Todo el personal al día: no quedan contactos pendientes en este rango.</div>`);

    list.querySelectorAll('.task').forEach((el) => {
      const a = visible.find((x) => x.service.id === el.dataset.key);
      const mark = async () => {
        await db.update('services', a.service.id, { avisoEnviado: todayISO() });
        render(root);
      };
      el.querySelector('[data-act=wa]').addEventListener('click', () => open(a, mark));
      el.querySelector('[data-act=mail]').addEventListener('click', () => open(a, mark));
      el.querySelector('[data-act=call]').addEventListener('click', async () => {
        await logInteraccion({ petId: a.pet.id, ownerId: a.owner.id, canal: 'Llamada', nota: `Llamada por ${a.service.tipo.toLowerCase()} ${whenText(a.dias)}.` });
        toast('Llamada registrada en la bitácora', 'success');
        mark();
      });
    });
  };

  const open = (a, onSent) =>
    openContactModal({
      pet: a.pet,
      owner: a.owner,
      asunto: `Recordatorio de ${a.service.tipo.toLowerCase()} para ${a.pet.nombre}`,
      mensaje: `Hola ${primerNombre(a.owner)}, te escribimos de ${cfg.clinica}. A ${a.pet.nombre} le corresponde ${a.service.tipo.toLowerCase()} y ${whenText(a.dias)} (${fmtDate(a.service.proximaFecha)}). ¿Te agendamos una cita?`,
      nota: `Recordatorio de ${a.service.tipo.toLowerCase()} (${whenText(a.dias)}).`,
      onSent,
    });

  root.querySelector('#hz').addEventListener('ionChange', (e) => {
    horizon = e.detail.value;
    paint();
  });
  paint();
}
