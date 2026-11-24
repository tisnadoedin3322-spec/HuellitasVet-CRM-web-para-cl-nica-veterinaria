import { db, loadAll, byId } from '../../core/store.js';
import { esc, money, fmtDate, todayISO, addDays, addMonths, num, sum, round2 } from '../../core/utils.js';
import { fIn, readForm, validateRequired, setError, toast, openModal, emptyState } from '../../core/ui.js';

function rango(tipo, today) {
  const first = today.slice(0, 8) + '01';
  if (tipo === 'mes') return [first, addDays(addMonths(first, 1), -1)];
  if (tipo === 'anterior') return [addMonths(first, -1), addDays(first, -1)];
  return [addDays(today, -89), today];
}

export async function render(root) {
  const data = await loadAll('staff', 'services', 'pets');
  const petMap = byId(data.pets);
  const today = todayISO();
  let tipo = 'mes';
  const again = () => render(root);

  root.innerHTML = `
    <div class="toolbar">
      <ion-select id="per" interface="popover" label="Período" label-placement="stacked" fill="outline" value="mes">
        <ion-select-option value="mes">Este mes</ion-select-option><ion-select-option value="anterior">Mes anterior</ion-select-option><ion-select-option value="90">Últimos 90 días</ion-select-option></ion-select>
      <span class="grow muted">La comisión se calcula sobre el monto de cada servicio que hace el profesional</span>
      <ion-button id="new">Nuevo profesional</ion-button>
    </div>
    <div class="panel flush"><div class="table-wrap" id="tbl"></div></div>`;

  const paint = () => {
    const [d, h] = rango(tipo, today);
    const rows = data.staff.map((s) => {
      const lista = data.services.filter((x) => x.staffId === s.id && x.fecha >= d && x.fecha <= h);
      const base = sum(lista, (x) => x.monto);
      return { s, lista, base, comision: round2((base * s.comision) / 100) };
    });
    root.querySelector('#tbl').innerHTML = rows.length
      ? `<table class="table"><thead><tr><th>Profesional</th><th>Rol</th><th class="right">% comisión</th><th class="right">Servicios</th><th class="right">Monto generado</th><th class="right">Comisión a pagar</th><th></th></tr></thead><tbody>
        ${rows.map((r, i) => `<tr><td><strong>${esc(r.s.nombre)}</strong></td><td>${esc(r.s.rol)}</td><td class="right num">${r.s.comision}%</td><td class="right num">${r.lista.length}</td>
          <td class="right num">${money(r.base)}</td><td class="right num"><strong>${money(r.comision)}</strong></td>
          <td class="right nowrap"><ion-button class="sm" fill="outline" data-d="${i}">Ver detalle</ion-button><ion-button class="sm" fill="clear" data-e="${i}">Editar</ion-button></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4">Total</td><td class="right num">${money(sum(rows, (r) => r.base))}</td><td class="right num">${money(sum(rows, (r) => r.comision))}</td><td></td></tr></tfoot></table>`
      : emptyState('Aún no hay profesionales', 'Agrega médicos y groomers con su porcentaje de comisión');
    root.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
      const r = rows[Number(b.dataset.d)];
      openModal({
        title: `Servicios de ${r.s.nombre}`, size: 'lg',
        html: r.lista.length
          ? `<table class="table"><thead><tr><th>Fecha</th><th>Mascota</th><th>Servicio</th><th class="right">Monto</th><th class="right">Comisión</th></tr></thead><tbody>
            ${r.lista.sort((a, b) => b.fecha.localeCompare(a.fecha)).map((x) => `<tr><td>${fmtDate(x.fecha)}</td><td>${esc(petMap.get(x.petId)?.nombre || '—')}</td><td>${esc(x.tipo)}</td><td class="right num">${money(x.monto)}</td><td class="right num">${money((x.monto * r.s.comision) / 100)}</td></tr>`).join('')}</tbody></table>`
          : emptyState('Sin servicios en este período'),
      });
    }));
    root.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => modal(rows[Number(b.dataset.e)].s)));
  };

  const modal = (cur = null) => {
    const m = openModal({
      title: cur ? 'Editar profesional' : 'Nuevo profesional', size: 'sm',
      html: `<form class="stack" id="sf" novalidate>
        ${fIn('nombre', 'Nombre', cur?.nombre, { req: true, mask: 'name', len: 60, minLen: 2 })}${fIn('rol', 'Rol (por ejemplo, Groomer)', cur?.rol, { req: true, mask: 'name', len: 30, minLen: 2 })}
        ${fIn('comision', 'Comisión (%)', cur?.comision ?? '', { mask: 'money', req: true, len: 6, min: 0, max: 100 })}</form>`,
      footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="ss">Guardar</ion-button>`,
    });
    m.foot.querySelector('#ss').addEventListener('click', async () => {
      const form = m.body.querySelector('#sf');
      if (!validateRequired(form)) return;
      const v = readForm(form);
      const pct = num(v.comision);
      if (pct < 0 || pct > 100) return setError(form, 'comision', 'Ingresa un porcentaje entre 0 y 100');
      const data2 = { nombre: String(v.nombre).trim(), rol: String(v.rol).trim(), comision: pct };
      if (cur) await db.update('staff', cur.id, data2);
      else await db.insert('staff', data2);
      m.close();
      toast('Profesional guardado', 'success');
      again();
    });
  };

  root.querySelector('#per').addEventListener('ionChange', (e) => { tipo = e.detail.value; paint(); });
  root.querySelector('#new').addEventListener('click', () => modal());
  paint();
}
