import { db, loadAll, byId } from '../../core/store.js';
import { esc, money, fmtDate, todayISO, addDays, num, norm, ageYears, diffDays, filterSimilar, debounce } from '../../core/utils.js';
import { fIn, fSel, readForm, validateRequired, toast, openModal, emptyState, picker, icon, badge } from '../../core/ui.js';
import { ESTADOS_PIPELINE, petStats, getSettings } from '../../core/domain.js';
import { openContactModal, primerNombre } from './contacto.js';

function sugerencias({ pets, services, owners, oportunidades }) {
  const today = todayISO();
  const hace = (n) => addDays(today, -n);
  const stats = petStats({ pets, services });
  const ownerMap = byId(owners);
  const out = [];
  for (const p of pets) {
    const st = stats.get(p.id);
    const lista = st.servicios;
    const reciente = (tipo, dias) => lista.some((s) => s.tipo === tipo && s.fecha >= hace(dias));
    const texto = norm(Object.values(p.antecedentes || {}).join(' ') + ' ' + (p.observaciones || ''));
    const o = ownerMap.get(p.ownerId);
    const push = (titulo, monto, motivo) => {
      const yaExiste = oportunidades.some((x) => x.petId === p.id && norm(x.titulo) === norm(titulo) && x.estado !== 'Perdido');
      if (!yaExiste) out.push({ p, o, titulo, monto, motivo });
    };
    if (/sarro|dental|encia/.test(texto) && !reciente('Profilaxis dental', 365)) push('Profilaxis dental', 220, 'Tiene sarro o problemas dentales y no se le limpia hace más de un año');
    if (ageYears(p) >= 7 && !reciente('Análisis de laboratorio', 365)) push('Chequeo geriátrico con análisis', 270, 'Tiene 7 años o más y no tiene análisis de laboratorio en el último año');
    if (lista.some((s) => (s.tipo === 'Cirugía' || s.tipo === 'Hospitalización') && s.fecha >= hace(30))) push('Alimento medicado de recuperación', 89, 'Tuvo una cirugía u hospitalización en el último mes');
    if (/renal|rinon|riñon/.test(texto) && !lista.some((s) => s.tipo === 'Análisis de laboratorio' && s.fecha >= hace(90))) push('Control renal con análisis', 120, 'Tiene antecedente renal y su último análisis tiene más de 3 meses');
    if (lista.filter((s) => s.tipo === 'Baño y corte' && s.fecha >= hace(180)).length >= 3) push('Paquete mensual de baños', 240, 'Se baña con frecuencia: un paquete le ahorra dinero y asegura su cita');
  }
  return out.slice(0, 10);
}

// Color de cada etapa del embudo (ver .kcol[data-tone] en modules.css)
const TONO = { Cotizado: 'warn', 'En seguimiento': 'info', Agendado: 'ok', Perdido: 'bad' };

const ABIERTAS = ['Cotizado', 'En seguimiento'];
const suma = (l) => l.reduce((a, x) => a + (Number(x.monto) || 0), 0);

export async function render(root, q = '') {
  const data = await loadAll('oportunidades', 'pets', 'owners', 'services');
  const cfg = await getSettings();
  const petMap = byId(data.pets);
  const ownerMap = byId(data.owners);
  const items = data.oportunidades;
  const f = { q };
  const again = () => render(root, f.q); // al mover una tarjeta se conserva lo que había en el buscador
  const hoy = todayISO();

  // Indicadores: cuánto hay en juego y a quién hay que perseguir
  const abiertas = items.filter((x) => ABIERTAS.includes(x.estado));
  const agendadas = items.filter((x) => x.estado === 'Agendado');
  const cerradas = agendadas.length + items.filter((x) => x.estado === 'Perdido').length;
  const tasa = cerradas ? Math.round((agendadas.length / cerradas) * 100) : null;
  const frias = abiertas.filter((x) => diffDays(hoy, x.fecha) > 14).length;

  const col = (estado, visibles) => {
    const list = visibles.filter((x) => x.estado === estado).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const total = suma(list);
    return `<section class="kcol" data-estado="${estado}" data-tone="${TONO[estado] || ''}">
      <header><h3>${estado}</h3><span class="kcount">${list.length}</span><span class="ktotal num">${money(total)}</span></header>
      <div class="kdrop">${
        list.length
          ? list
              .map((x) => {
                const p = petMap.get(x.petId);
                const o = ownerMap.get(x.ownerId);
                const i = ESTADOS_PIPELINE.indexOf(estado);
                const dias = diffDays(hoy, x.fecha);
                const edad = dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} d`;
                const tono = ABIERTAS.includes(estado) ? (dias > 14 ? 'bad' : dias > 7 ? 'warn' : 'neutral') : 'neutral';
                return `<article class="kcard" draggable="true" data-id="${x.id}">
              <div class="ktop"><strong>${esc(x.titulo)}</strong>${estado !== 'Perdido' ? `<ion-button fill="clear" class="sm ico" data-contact="${x.id}" title="Contactar al propietario por WhatsApp o correo" aria-label="Contactar al propietario">${icon('whatsapp', 'icon-only')}</ion-button>` : ''}</div>
              <div class="muted">${esc(p?.nombre || '—')} · ${esc(o?.nombre || '')}</div>
              <div class="row between kmeta"><span class="num">${money(x.monto)}</span><span title="Creada el ${fmtDate(x.fecha)}">${badge(edad, tono)}</span></div>
              <div class="row kact">
                ${i > 0 && estado !== 'Perdido' ? `<ion-button fill="clear" class="sm ico" data-move="${x.id}" data-to="${ESTADOS_PIPELINE[i - 1]}" title="Volver a la etapa anterior" aria-label="Volver a la etapa anterior">${icon('back', 'icon-only')}</ion-button>` : ''}
                ${i < 2 ? `<ion-button fill="outline" class="sm" data-move="${x.id}" data-to="${ESTADOS_PIPELINE[i + 1]}">Avanzar${icon('next', 'end')}</ion-button>` : ''}
                ${estado !== 'Perdido' ? `<ion-button fill="clear" class="sm ico danger" data-move="${x.id}" data-to="Perdido" title="Marcar como perdido" aria-label="Marcar como perdido">${icon('lost', 'icon-only')}</ion-button>` : `<ion-button fill="outline" class="sm" data-move="${x.id}" data-to="Cotizado">${icon('undo')}Reabrir</ion-button>`}
              </div></article>`;
              })
              .join('')
          : `<p class="faint kempty">${f.q ? 'Sin coincidencias' : 'Sin oportunidades'}</p>`
      }</div></section>`;
  };

  const sug = sugerencias(data);

  root.innerHTML = `
    <div class="row between sec-head">
      <div><h2>Embudo de oportunidades</h2><p class="muted">Presupuestos y paquetes cotizados, arrastra las tarjetas entre columnas o usa los botones</p></div>
      <ion-button id="new">Nueva oportunidad</ion-button>
    </div>
    <div class="kpis kpis-tight">
      <div class="kpi"><div class="label">Valor en juego (${abiertas.length} ${abiertas.length === 1 ? 'abierta' : 'abiertas'})</div><div class="value">${money(suma(abiertas))}</div></div>
      <div class="kpi good"><div class="label">Agendado (${agendadas.length})</div><div class="value">${money(suma(agendadas))}</div></div>
      <div class="kpi ${tasa === null ? '' : tasa >= 50 ? 'good' : 'warn'}" title="Agendadas ÷ (agendadas + perdidas)"><div class="label">Tasa de cierre</div><div class="value">${tasa === null ? '—' : tasa + '%'}</div></div>
      <div class="kpi ${frias ? 'bad' : ''}" title="Abiertas con más de 14 días sin cerrarse"><div class="label">Fríos: más de 14 días sin cerrar</div><div class="value">${frias}</div></div>
    </div>
    <div class="toolbar">
      <ion-searchbar class="grow" id="q" placeholder="Buscar por presupuesto, mascota o propietario" debounce="0" autocomplete="off" value="${esc(f.q)}"></ion-searchbar>
      <span class="muted" id="count"></span>
    </div>
    <div class="kanban" id="board"></div>
    <section class="panel flush cross">
      <div class="panel-head"><h2>Venta cruzada sugerida</h2><span class="muted">Según el historial de cada mascota</span></div>
      <div class="table-wrap">${
        sug.length
          ? `<table class="table"><thead><tr><th>Mascota</th><th>Sugerencia</th><th>Por qué</th><th class="right">Monto estimado</th><th></th></tr></thead><tbody>
          ${sug
            .map(
              (s, i) => `<tr><td><a href="#/clientes/${s.p.id}"><strong>${esc(s.p.nombre)}</strong></a><div class="faint">${esc(s.o?.nombre || '')}</div></td>
            <td>${esc(s.titulo)}</td><td class="muted">${esc(s.motivo)}</td><td class="right num">${money(s.monto)}</td>
            <td class="right"><ion-button class="sm" fill="outline" data-sug="${i}">Crear oportunidad</ion-button></td></tr>`,
            )
            .join('')}</tbody></table>`
          : emptyState('Sin sugerencias por ahora', 'Aparecerán cuando el historial de una mascota sugiera otro servicio')
      }</div>
    </section>`;

  const move = async (id, to) => {
    await db.update('oportunidades', id, { estado: to });
    toast(`Movida a “${to}”`, 'success');
    again();
  };

  const contactar = (x) => {
    const p = petMap.get(x.petId);
    const o = ownerMap.get(x.ownerId);
    if (!o) return toast('Esta oportunidad no tiene propietario asociado.', 'danger');
    openContactModal({
      pet: p,
      owner: o,
      asunto: `${x.titulo} para ${p?.nombre || 'tu mascota'}`,
      mensaje:
        x.estado === 'Agendado'
          ? `Hola ${primerNombre(o)}, te escribimos de ${cfg.clinica} para confirmar la cita de “${x.titulo}” de ${p?.nombre}. ¿Todo bien con la fecha?`
          : `Hola ${primerNombre(o)}, te escribimos de ${cfg.clinica}. Te recordamos el presupuesto de “${x.titulo}” para ${p?.nombre} (${money(x.monto)}). ¿Te gustaría agendarlo? Quedamos atentos.`,
      nota: `Seguimiento de la oportunidad “${x.titulo}”.`,
    });
  };

  // El tablero se vuelve a dibujar con cada letra del buscador, sin recargar la pantalla
  const board = root.querySelector('#board');
  const paintBoard = () => {
    const visibles = filterSimilar(items, f.q, (x) => `${x.titulo} ${petMap.get(x.petId)?.nombre || ''} ${ownerMap.get(x.ownerId)?.nombre || ''}`);
    root.querySelector('#count').textContent = f.q
      ? `${visibles.length} de ${items.length} oportunidades`
      : `${items.length} ${items.length === 1 ? 'oportunidad' : 'oportunidades'}`;
    board.innerHTML = ESTADOS_PIPELINE.map((e) => col(e, visibles)).join('');

    board.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => move(b.dataset.move, b.dataset.to)));
    board.querySelectorAll('[data-contact]').forEach((b) => b.addEventListener('click', () => contactar(items.find((x) => x.id === b.dataset.contact))));
    board.querySelectorAll('.kcard').forEach((c) => {
      c.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', c.dataset.id);
        c.classList.add('dragging');
      });
      c.addEventListener('dragend', () => c.classList.remove('dragging'));
    });
    board.querySelectorAll('.kcol').forEach((k) => {
      k.addEventListener('dragover', (e) => {
        e.preventDefault();
        k.classList.add('over');
      });
      k.addEventListener('dragleave', () => k.classList.remove('over'));
      k.addEventListener('drop', (e) => {
        e.preventDefault();
        k.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        const it = items.find((x) => x.id === id);
        if (it && it.estado !== k.dataset.estado) move(id, k.dataset.estado);
      });
    });
  };
  root.querySelector('#q').addEventListener('ionInput', debounce((e) => { f.q = e.target.value || ''; paintBoard(); }, 120));
  paintBoard();

  root.querySelectorAll('[data-sug]').forEach((b) =>
    b.addEventListener('click', async () => {
      const s = sug[Number(b.dataset.sug)];
      await db.insert('oportunidades', { titulo: s.titulo, petId: s.p.id, ownerId: s.p.ownerId, monto: s.monto, estado: 'Cotizado', fecha: todayISO() });
      toast('Oportunidad creada en “Cotizado”', 'success');
      again();
    }),
  );

  root.querySelector('#new').addEventListener('click', () => {
    let chosen = null;
    const m = openModal({
      title: 'Nueva oportunidad',
      size: 'sm',
      html: `<form class="form-grid" id="of" novalidate>
        <div class="full"><div class="muted pick-label">Mascota *</div><div id="pk"></div></div>
        <div class="full">${fIn('titulo', 'Presupuesto o paquete', '', { req: true, mask: 'text', len: 60, minLen: 3 })}</div>
        ${fIn('monto', 'Monto (S/)', '', { mask: 'money', req: true })}
        ${fSel('estado', 'Estado', ESTADOS_PIPELINE, 'Cotizado', { req: true })}
      </form>`,
      footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="os">Guardar</ion-button>`,
    });
    picker(m.body.querySelector('#pk'), {
      items: data.pets,
      textOf: (p) => p.nombre,
      subOf: (p) => ownerMap.get(p.ownerId)?.nombre || '',
      onSelect: (p) => (chosen = p),
    });
    m.foot.querySelector('#os').addEventListener('click', async () => {
      const form = m.body.querySelector('#of');
      if (!chosen) return toast('Elige la mascota a la que pertenece el presupuesto.', 'danger');
      if (!validateRequired(form)) return;
      const v = readForm(form);
      await db.insert('oportunidades', { titulo: String(v.titulo).trim(), petId: chosen.id, ownerId: chosen.ownerId, monto: num(v.monto), estado: v.estado, fecha: todayISO() });
      m.close();
      toast('Oportunidad registrada', 'success');
      again();
    });
  });
}

