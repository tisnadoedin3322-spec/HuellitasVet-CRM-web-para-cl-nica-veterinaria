import { loadAll, byId } from '../../core/store.js';
import { esc, money, fmtDate, todayISO, addMonths, diffDays, filterSimilar, debounce } from '../../core/utils.js';
import { badge, avatar, emptyState } from '../../core/ui.js';
import { SERVICIOS, ownerStats, petStats, ageGroup, VIP_GASTO, VIP_VISITAS, getSettings } from '../../core/domain.js';
import { openContactModal, primerNombre } from './contacto.js';

export async function render(root) {
  const data = await loadAll('pets', 'owners', 'services');
  const cfg = await getSettings();
  const today = todayISO();
  const oStats = ownerStats(data);
  const pStats = petStats(data);
  const ownerMap = byId(data.owners);
  const f = { q: '', segmento: 'todos', meses: '3', calif: '0', edad: 'todas', tipo: 'todos' };

  const rows = data.pets.map((p) => {
    const o = ownerMap.get(p.ownerId);
    const os = oStats.get(p.ownerId);
    const ps = pStats.get(p.id);
    return { p, o, os, ps, vip: os.gasto >= VIP_GASTO || os.visitas >= VIP_VISITAS };
  });

  root.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="label">Clientes VIP o frecuentes</div><div class="value">${new Set(rows.filter((r) => r.vip).map((r) => r.o.id)).size}</div></div>
      <div class="kpi warn"><div class="label">Mascotas sin servicios en 3 meses</div><div class="value">${rows.filter((r) => !r.ps.ultima || r.ps.ultima < addMonths(today, -3)).length}</div></div>
      <div class="kpi"><div class="label">Regla VIP</div><div class="value value-sm">${money(VIP_GASTO)} o ${VIP_VISITAS} visitas</div></div>
    </div>
    <div class="panel filters">
      <ion-searchbar id="q" placeholder="Buscar por nombre de la mascota o del propietario" debounce="0" autocomplete="off"></ion-searchbar>
      <div class="form-grid cols-4">
        <ion-select id="f-seg" label="Segmento" label-placement="stacked" fill="outline" interface="popover" value="todos">
          <ion-select-option value="todos">Todos los clientes</ion-select-option>
          <ion-select-option value="vip">VIP o frecuentes</ion-select-option>
          <ion-select-option value="riesgo">En riesgo (inactivos)</ion-select-option>
        </ion-select>
        <ion-select id="f-meses" label="Sin servicios en" label-placement="stacked" fill="outline" interface="popover" value="3">
          <ion-select-option value="3">Últimos 3 meses</ion-select-option>
          <ion-select-option value="6">Últimos 6 meses</ion-select-option>
          <ion-select-option value="12">Últimos 12 meses</ion-select-option>
        </ion-select>
        <ion-select id="f-cal" label="Calificación mínima" label-placement="stacked" fill="outline" interface="popover" value="0">
          <ion-select-option value="0">Cualquiera</ion-select-option>
          ${[1, 2, 3, 4, 5].map((n) => `<ion-select-option value="${n}">${n} o más</ion-select-option>`).join('')}
        </ion-select>
        <ion-select id="f-edad" label="Edad de la mascota" label-placement="stacked" fill="outline" interface="popover" value="todas">
          <ion-select-option value="todas">Todas las edades</ion-select-option>
          <ion-select-option value="Cachorros">Cachorros (menos de 1 año)</ion-select-option>
          <ion-select-option value="Adultos">Adultos (1 a 7 años)</ion-select-option>
          <ion-select-option value="Geriátricos">Geriátricos (8 años o más)</ion-select-option>
        </ion-select>
        <ion-select id="f-tipo" label="Tipo de servicio consumido" label-placement="stacked" fill="outline" interface="popover" value="todos">
          <ion-select-option value="todos">Cualquiera</ion-select-option>
          ${SERVICIOS.map((s) => `<ion-select-option value="${s.tipo}">${s.tipo}</ion-select-option>`).join('')}
        </ion-select>
      </div>
    </div>
    <div class="panel flush"><div class="panel-head"><h2>Resultado</h2><span class="muted" id="count"></span></div><div class="table-wrap" id="tbl"></div></div>`;

  const tbl = root.querySelector('#tbl');
  const paint = () => {
    const limite = addMonths(today, -Number(f.meses));
    const filtered = rows
      .filter((r) => {
        const inactivo = !r.ps.ultima || r.ps.ultima < limite;
        if (f.segmento === 'vip' && !r.vip) return false;
        if (f.segmento === 'riesgo' && !inactivo) return false;
        if (Number(f.calif) && (r.p.calificacion || 0) < Number(f.calif)) return false;
        if (f.edad !== 'todas' && ageGroup(r.p) !== f.edad) return false;
        if (f.tipo !== 'todos' && !r.ps.tipos.has(f.tipo)) return false;
        return true;
      })
      .sort((a, b) => b.os.gasto - a.os.gasto);
    // Con texto en el buscador se ordena por parecido (como en Clientes); sin texto, por gasto
    const list = filterSimilar(filtered, f.q, (r) => r.p.nombre + ' ' + r.o.nombre);
    root.querySelector('#count').textContent = `${list.length} ${list.length === 1 ? 'mascota' : 'mascotas'}`;
    if (!list.length) {
      tbl.innerHTML = emptyState('Ningún cliente coincide', f.q ? `Nadie se parece a “${f.q}” con estos filtros, revisa cómo lo escribiste o cambia los filtros` : 'Cambia los filtros para ver más resultados');
      return;
    }
    tbl.innerHTML = `<table class="table"><thead><tr><th>Mascota</th><th>Propietario</th><th class="right">Gasto acumulado</th><th class="right">Visitas</th><th>Última visita</th><th>Calificación</th><th>Perfil</th><th></th></tr></thead><tbody>
      ${list
        .map((r, i) => {
          const dias = r.ps.ultima ? diffDays(today, r.ps.ultima) : null;
          const inactivo = !r.ps.ultima || r.ps.ultima < addMonths(today, -3);
          return `<tr>
          <td><div class="cell-pet">${avatar(r.p)}<div><a href="#/clientes/${r.p.id}"><strong>${esc(r.p.nombre)}</strong></a><span class="sub">${esc(r.p.especie)} · ${ageGroup(r.p)}</span></div></div></td>
          <td>${esc(r.o.nombre)}</td>
          <td class="right num">${money(r.os.gasto)}</td>
          <td class="right num">${r.ps.visitas}</td>
          <td class="nowrap">${fmtDate(r.ps.ultima)}${dias != null ? `<div class="faint">${dias === 0 ? 'hoy' : dias === 1 ? 'ayer' : 'hace ' + (dias >= 60 ? Math.round(dias / 30) + ' meses' : dias + ' días')}</div>` : ''}</td>
          <td>${r.p.calificacion ? badge(`${r.p.calificacion} de 5`, r.p.calificacion >= 4 ? 'ok' : r.p.calificacion === 3 ? 'warn' : 'bad') : '<span class="faint">—</span>'}</td>
          <td>${r.vip ? badge('VIP', 'petrol') + ' ' : ''}${inactivo ? badge('En riesgo', 'warn') : badge('Activo', 'ok')}</td>
          <td class="right"><ion-button class="sm" fill="outline" data-i="${i}">Contactar</ion-button></td></tr>`;
        })
        .join('')}</tbody></table>`;
    tbl.querySelectorAll('[data-i]').forEach((b) =>
      b.addEventListener('click', () => {
        const r = list[Number(b.dataset.i)];
        const riesgo = !r.ps.ultima || r.ps.ultima < addMonths(today, -3);
        openContactModal({
          pet: r.p,
          owner: r.o,
          asunto: riesgo ? `Te extrañamos en ${cfg.clinica}` : `Novedades para ${r.p.nombre}`,
          mensaje: riesgo
            ? `Hola ${primerNombre(r.o)}, hace un tiempo que no vemos a ${r.p.nombre} en ${cfg.clinica}. Nos gustaría saber cómo está. ¿Quieres que agendemos un chequeo?`
            : `Hola ${primerNombre(r.o)}, gracias por confiar en ${cfg.clinica} para el cuidado de ${r.p.nombre}. Cuando lo necesites, estamos para ayudarte.`,
          nota: riesgo ? 'Campaña de reactivación.' : 'Mensaje de fidelización.',
        });
      }),
    );
  };

  const bind = (id, key) =>
    root.querySelector(id).addEventListener('ionChange', (e) => {
      f[key] = e.detail.value;
      paint();
    });
  root.querySelector('#q').addEventListener('ionInput', debounce((e) => { f.q = e.target.value || ''; paint(); }, 120));
  bind('#f-seg', 'segmento');
  bind('#f-meses', 'meses');
  bind('#f-cal', 'calif');
  bind('#f-edad', 'edad');
  bind('#f-tipo', 'tipo');
  paint();
}
