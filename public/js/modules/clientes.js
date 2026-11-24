import { db, loadAll, byId, enNube } from '../core/store.js';
import { esc, norm, money, fmtDate, ageText, filterSimilar, debounce, resizeImage, todayISO, addDays, num } from '../core/utils.js';
import {
  fIn, fSel, fArea, readForm, validateRequired, toast, confirmDialog, openModal,
  badge, avatar, emptyState, ratingHTML, bindRating, pageHead, icon,
} from '../core/ui.js';
import { SERVICIOS, servicioDe, criticalTags, debtByOwner, petStats, CANAL_QR } from '../core/domain.js';

export async function render(view, { parts }) {
  if (parts[0]) return renderFicha(view, parts[0]);
  return renderLista(view);
}

// q0 y previa solo se usan al refrescar sola la lista: se conserva lo que se estaba buscando y, si ya se cambió de pantalla, no se dibuja
async function renderLista(view, q0 = '', previa = null) {
  const { pets, owners, services, sales, interacciones } = await loadAll('pets', 'owners', 'services', 'sales', 'interacciones');
  if (previa && !previa.isConnected) return;
  const ownerMap = byId(owners);
  const stats = petStats({ pets, services });
  const debts = debtByOwner(sales);
  // Quien se registró por el QR en la última semana lleva la etiqueta "Nuevo por QR"
  const nuevosQr = new Set(
    interacciones.filter((i) => i.canal === CANAL_QR && i.petId && Date.now() - Date.parse(i.fecha) < 7 * 864e5).map((i) => i.petId),
  );

  const seen = new Set();
  const rows = pets
    .filter((p) => {
      const k = p.ownerId + '|' + norm(p.nombre);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  view.innerHTML = `
    ${pageHead('Clientes', 'Cada fila es una mascota con su propietario, abre una para ver su ficha médica', `<ion-button href="#/registro">Registrar mascota</ion-button>`)}
    <div class="toolbar">
      <ion-searchbar class="grow" id="q" placeholder="Buscar por nombre de la mascota" value="${esc(q0)}" debounce="0" autocomplete="off"></ion-searchbar>
      <span class="muted" id="count"></span>
    </div>
    <div class="panel flush"><div class="table-wrap" id="tbl"></div></div>`;

  const tbl = view.querySelector('#tbl');
  const count = view.querySelector('#count');

  const paint = (q) => {
    const list = filterSimilar(rows, q, (p) => p.nombre + ' ' + (ownerMap.get(p.ownerId)?.nombre || ''));
    count.textContent = `${list.length} ${list.length === 1 ? 'mascota' : 'mascotas'}`;
    if (!list.length) {
      tbl.innerHTML = emptyState('No hay coincidencias', q ? `Ninguna mascota se parece a “${q}”, revisa cómo lo escribiste o registra una nueva` : 'Registra la primera mascota para empezar');
      return;
    }
    tbl.innerHTML = `<table class="table"><thead><tr>
        <th>Mascota</th><th>Propietario</th><th class="hide-sm">Último servicio</th><th class="hide-sm">Calificación</th><th>Avisos</th>
      </tr></thead><tbody>
      ${list
        .map((p) => {
          const o = ownerMap.get(p.ownerId);
          const st = stats.get(p.id);
          const d = debts.get(p.ownerId);
          const tags = [
            nuevosQr.has(p.id) ? badge('Nuevo por QR', 'info') : '',
            ...criticalTags(p, o).map((t) => badge(t, 'bad')),
            d?.vencida ? badge('Deuda vencida', 'warn') : '',
          ].join(' ');
          return `<tr class="row-link" data-id="${p.id}">
            <td><div class="cell-pet">${avatar(p)}<div><a href="#/clientes/${p.id}"><strong>${esc(p.nombre)}</strong></a>
              <span class="sub">${esc(p.especie)} · ${esc(p.raza)}</span></div></div></td>
            <td>${esc(o?.nombre || '—')}<div class="faint">${esc(o?.celular || '')}</div></td>
            <td class="nowrap hide-sm">${fmtDate(st.ultima)}</td>
            <td class="hide-sm">${p.calificacion ? badge(`${p.calificacion} de 5`, p.calificacion >= 4 ? 'ok' : p.calificacion === 3 ? 'warn' : 'bad') : '<span class="faint nowrap">Sin calificar</span>'}</td>
            <td>${tags || '<span class="faint">—</span>'}</td>
          </tr>`;
        })
        .join('')}
      </tbody></table>`;
    tbl.querySelectorAll('tr.row-link').forEach((tr) =>
      tr.addEventListener('click', (e) => {
        if (e.target.closest('a')) return;
        location.hash = `#/clientes/${tr.dataset.id}`;
      }),
    );
  };
  let q = q0;
  paint(q);
  view.querySelector('#q').addEventListener('ionInput', debounce((e) => paint((q = e.target.value || '')), 120));

  // Con la nube, lo que llega por el QR aparece solo: cada 8 segundos se mira si hay mascotas nuevas
  if (enNube) {
    const timer = setInterval(async () => {
      if (!tbl.isConnected) return clearInterval(timer);
      if (document.hidden) return;
      try {
        const ids = await db.buscar('pets', {}, 'id');
        if (!tbl.isConnected || ids.length === pets.length) return;
        clearInterval(timer);
        if (ids.length > pets.length) toast('Llegó una mascota nueva', 'success');
        renderLista(view, q, tbl);
      } catch {} // sin conexión por un momento: se vuelve a intentar en el siguiente ciclo
    }, 8000);
  }
}

async function renderFicha(view, id) {
  const data = await loadAll('pets', 'owners', 'services', 'staff', 'sales');
  const pet = data.pets.find((p) => p.id === id);
  if (!pet) {
    view.innerHTML = `<div class="panel">${emptyState('No encontramos esa mascota', 'Puede que ya se haya eliminado')}
      <div class="form-actions"><ion-button href="#/clientes">Volver a clientes</ion-button></div></div>`;
    return;
  }
  const owner = data.owners.find((o) => o.id === pet.ownerId);
  const staffMap = byId(data.staff);
  const services = data.services.filter((s) => s.petId === pet.id).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const debt = debtByOwner(data.sales).get(pet.ownerId);
  const a = pet.antecedentes || {};
  const tags = criticalTags(pet, owner);
  const pending = services.filter((s) => !s.cobrado);

  view.innerHTML = `
    <p class="crumb"><a href="#/clientes">Clientes</a></p>
    ${pageHead(
      pet.nombre,
      `${pet.especie} · ${pet.raza}`,
      `<ion-button fill="outline" href="#/registro/${pet.id}">Editar datos</ion-button>
       <ion-button id="add-svc">Registrar servicio</ion-button>
       ${pending.length ? `<ion-button color="secondary" href="#/finanzas/pos?owner=${pet.ownerId}">Cobrar (${pending.length})</ion-button>` : ''}`,
    )}
    ${tags.length ? `<div class="banner bad"><strong>Aviso para el personal:</strong> ${tags.join(' · ')}</div>` : ''}
    ${debt?.vencida ? `<div class="banner warn"><strong>Deuda vencida:</strong> ${esc(owner.nombre)} debe ${money(debt.vencida)} en cuentas vencidas. Conviene regularizarla antes de agendar un nuevo servicio.</div>` : ''}
    <div class="grid grid-ficha">
      <div class="stack">
        <section class="panel">
          <div id="foto">${avatar(pet, 'lg')}</div>
          <div class="row foto-actions">
            <ion-button fill="outline" class="sm" id="foto-btn">Cambiar foto</ion-button>
            ${pet.foto ? '<ion-button fill="clear" class="sm" id="foto-del">Quitar</ion-button>' : ''}
            <input type="file" id="foto-file" accept="image/*" hidden>
          </div>
        </section>
        <section class="panel">
          <h3>Datos de la mascota</h3>
          <dl class="dl dl-tight">
            <dt>Raza</dt><dd>${esc(pet.raza)}</dd>
            <dt>Edad</dt><dd>${esc(ageText(pet))}</dd>
            <dt>Sexo</dt><dd>${esc(pet.sexo)}</dd>
            <dt>Propietario</dt><dd>${esc(owner?.nombre || '—')}</dd>
            <dt>Celular</dt><dd>${esc(owner?.celular || '—')}</dd>
            <dt>Correo</dt><dd>${esc(owner?.correo || '—')}</dd>
          </dl>
        </section>
        <section class="panel">
          <h3>Calificación</h3>
          <p class="muted cal-help">De 1 a 5, donde 5 es lo mejor</p>
          <div id="cal">${ratingHTML(pet.calificacion || 0)}</div>
        </section>
      </div>
      <div class="stack">
        <section class="panel">
          <h3>Antecedentes</h3>
          <dl class="dl dl-wide">
            <dt>Enfermedades anteriores</dt><dd>${esc(a.enfermedades) || '<span class="faint">Sin datos</span>'}</dd>
            <dt>Tratamientos recibidos</dt><dd>${esc(a.tratamientos) || '<span class="faint">Sin datos</span>'}</dd>
            <dt>Vacunaciones</dt><dd>${esc(a.vacunaciones) || '<span class="faint">Sin datos</span>'}</dd>
            <dt>Accidentes</dt><dd>${esc(a.accidentes) || '<span class="faint">Sin datos</span>'}</dd>
          </dl>
        </section>
        <section class="panel">
          <h3>Observaciones</h3>
          <dl class="dl dl-wide">
            <dt>Sobre la mascota</dt><dd>${esc(pet.observaciones) || '<span class="faint">Sin observaciones</span>'}</dd>
            <dt>Sobre el propietario</dt><dd>${esc(owner?.observaciones) || '<span class="faint">Sin observaciones</span>'}</dd>
          </dl>
        </section>
        <section class="panel flush">
          <div class="panel-head"><h2>Servicios recibidos</h2><span class="muted">Del más reciente al más antiguo</span></div>
          <div class="table-wrap">${
            services.length
              ? `<table class="table"><thead><tr><th>Fecha</th><th>Servicio</th><th class="right">Monto</th><th>Próxima fecha</th><th>Cobro</th></tr></thead><tbody>
              ${services
                .map(
                  (s) => `<tr>
                <td class="nowrap">${fmtDate(s.fecha)}</td>
                <td><strong>${esc(s.tipo)}</strong><div class="faint">${esc(staffMap.get(s.staffId)?.nombre || '')}${s.detalle ? ' · ' + esc(s.detalle) : ''}</div></td>
                <td class="right num nowrap">${money(s.monto)}</td>
                <td class="nowrap">${s.proximaFecha ? fmtDate(s.proximaFecha) : '<span class="faint">—</span>'}</td>
                <td>${s.cobrado ? badge('Cobrado', 'ok') : `${badge('Pendiente', 'warn')}<div class="cell-act"><ion-button fill="clear" class="sm danger" data-del="${s.id}">${icon('trash')}Quitar</ion-button></div>`}</td>
              </tr>`,
                )
                .join('')}</tbody></table>`
              : emptyState('Aún no hay servicios', 'Registra la primera consulta, vacuna o baño de esta mascota')
          }</div>
        </section>
        <div class="row between">
          <span></span>
          <ion-button fill="outline" class="danger" id="del-pet">${icon('trash')}Eliminar esta mascota</ion-button>
        </div>
      </div>
    </div>`;

  const again = () => renderFicha(view, id);

  bindRating(view.querySelector('#cal'), async (v) => {
    await db.update('pets', pet.id, { calificacion: v });
    toast(`Calificación guardada: ${v} de 5`, 'success');
  });

  const file = view.querySelector('#foto-file');
  view.querySelector('#foto-btn').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try {
      await db.update('pets', pet.id, { foto: await resizeImage(file.files[0]) });
      again();
    } catch {
      toast('No se pudo leer la imagen. Prueba con otra.', 'danger');
    }
  });
  view.querySelector('#foto-del')?.addEventListener('click', async () => {
    await db.update('pets', pet.id, { foto: '' });
    again();
  });

  view.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      if (!(await confirmDialog({ header: 'Quitar servicio', message: 'Este servicio aún no se cobró. ¿Quieres quitarlo de la ficha?', confirmText: 'Quitar' }))) return;
      await db.remove('services', b.dataset.del);
      again();
    }),
  );

  view.querySelector('#del-pet').addEventListener('click', async () => {
    const ok = await confirmDialog({
      header: `Eliminar a ${pet.nombre}`,
      message: 'Se eliminará la mascota y todos sus servicios. Los cobros ya emitidos se conservan. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
    });
    if (!ok) return;
    try {
      // Los cobros ya emitidos se conservan: se desvinculan de la mascota, y el propietario se queda si tiene cobros
      for (const s of data.sales.filter((x) => x.petId === pet.id)) await db.update('sales', s.id, { petId: null });
      for (const s of services) await db.remove('services', s.id);
      await db.remove('pets', pet.id);
      const tieneCobros = data.sales.some((x) => x.ownerId === pet.ownerId);
      const tieneOtras = data.pets.some((p) => p.id !== pet.id && p.ownerId === pet.ownerId);
      if (!tieneCobros && !tieneOtras) await db.remove('owners', pet.ownerId);
      toast(`${pet.nombre} fue eliminada`);
      location.hash = '#/clientes';
    } catch (err) {
      toast('No se pudo eliminar: ' + err.message, 'danger');
    }
  });

  view.querySelector('#add-svc').addEventListener('click', () => openServiceModal({ pet, owner, staff: data.staff, debt, onSaved: again }));
}

function openServiceModal({ pet, owner, staff, debt, onSaved }) {
  const first = SERVICIOS[0];
  const m = openModal({
    title: `Registrar servicio para ${pet.nombre}`,
    size: 'sm',
    html: `
      ${debt?.vencida ? `<div class="banner warn"><strong>Deuda vencida:</strong> ${esc(owner.nombre)} tiene ${money(debt.vencida)} vencidos. Avísale antes de continuar.</div>` : ''}
      <form class="form-grid" id="svc-form" novalidate>
        <div class="full">${fSel('tipo', 'Servicio', SERVICIOS.map((s) => [s.tipo, `${s.tipo} — ${money(s.precio)}`]), first.tipo, { req: true })}</div>
        ${fIn('fecha', 'Fecha', todayISO(), { type: 'date', stacked: true, req: true, max: todayISO() })}
        ${fIn('monto', 'Monto (S/)', first.precio, { mask: 'money', req: true })}
        <div class="full">${fSel('staffId', 'Profesional', staff.map((s) => [s.id, `${s.nombre} (${s.rol})`]), staff[0]?.id || '', { req: true })}</div>
        <div class="full">${fIn('proximaFecha', 'Próxima fecha (para el recordatorio)', first.intervalo ? addDays(todayISO(), first.intervalo) : '', { type: 'date', stacked: true })}</div>
        <div class="full">${fArea('detalle', 'Detalle del servicio', '')}</div>
      </form>`,
    footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="svc-save">Guardar servicio</ion-button>`,
  });
  const form = m.body.querySelector('#svc-form');
  const el = (n) => form.querySelector(`[name=${n}]`);
  const sync = () => {
    const cat = servicioDe(el('tipo').value);
    if (!cat) return;
    el('monto').value = cat.precio;
    el('proximaFecha').value = cat.intervalo && el('fecha').value ? addDays(el('fecha').value, cat.intervalo) : '';
  };
  el('tipo').addEventListener('ionChange', sync);
  el('fecha').addEventListener('ionChange', sync);

  m.foot.querySelector('#svc-save').addEventListener('click', async () => {
    if (!validateRequired(form)) return;
    const v = readForm(form);
    await db.insert('services', {
      petId: pet.id,
      fecha: v.fecha,
      tipo: v.tipo,
      detalle: String(v.detalle || '').trim(),
      monto: num(v.monto),
      staffId: v.staffId,
      proximaFecha: v.proximaFecha || null,
      cobrado: false,
      saleId: null,
      avisoEnviado: null,
      seguimientoEnviado: null,
    });
    m.close();
    toast('Servicio registrado. Queda pendiente de cobro.', 'success');
    onSaved();
  });
}

