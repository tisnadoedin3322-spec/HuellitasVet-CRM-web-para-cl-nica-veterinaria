import { db, loadAll, byId } from '../../core/store.js';
import { esc, fmtDate, todayISO, addDays } from '../../core/utils.js';
import { fArea, ratingHTML, bindRating, toast, openModal, badge, emptyState } from '../../core/ui.js';
import { servicioDe, getSettings, saveSettings } from '../../core/domain.js';
import { openContactModal, primerNombre } from './contacto.js';

export async function render(root) {
  const data = await loadAll('services', 'pets', 'owners', 'encuestas');
  const cfg = await getSettings();
  const petMap = byId(data.pets);
  const ownerMap = byId(data.owners);
  const svcMap = byId(data.services);
  const today = todayISO();
  const again = () => render(root);

  const pendientes = data.services
    .filter((s) => servicioDe(s.tipo)?.seguimiento && s.fecha <= addDays(today, -1) && s.fecha >= addDays(today, -14) && !s.seguimientoEnviado)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
  const respuestas = data.encuestas.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  const prom = respuestas.length ? (respuestas.reduce((a, r) => a + r.calificacion, 0) / respuestas.length).toFixed(1) : '—';

  root.innerHTML = `
    <div class="kpis">
      <div class="kpi ${pendientes.length ? 'warn' : ''}"><div class="label">Seguimientos por enviar</div><div class="value">${pendientes.length}</div></div>
      <div class="kpi"><div class="label">Respuestas recibidas</div><div class="value">${respuestas.length}</div></div>
      <div class="kpi good"><div class="label">Calificación promedio</div><div class="value">${prom}</div></div>
    </div>
    <section class="panel">
      <h3>Reseñas en Google</h3>
      <p class="muted cal-help">Quien califique con 4 o 5 recibe este enlace, con 1 a 3 el caso pasa a Reclamos</p>
      <div class="row url-row">
        <ion-input id="url" label="Enlace para dejar una reseña" label-placement="stacked" fill="outline" type="text" inputmode="url" data-mask="url" maxlength="200" value="${esc(cfg.googleReviewUrl)}" style="flex:1 1 320px"></ion-input>
        <ion-button fill="outline" id="save-url">Guardar enlace</ion-button>
      </div>
    </section>
    <section class="panel flush">
      <div class="panel-head"><h2>Seguimiento 24 horas después de la atención</h2><span class="muted">Consultas, cirugías y hospitalizaciones de las últimas dos semanas</span></div>
      <div class="table-wrap">${
        pendientes.length
          ? `<table class="table"><thead><tr><th>Mascota</th><th>Servicio</th><th>Fecha</th><th></th></tr></thead><tbody>
          ${pendientes
            .map((s) => {
              const p = petMap.get(s.petId);
              const o = ownerMap.get(p?.ownerId);
              return `<tr><td><a href="#/clientes/${p?.id}"><strong>${esc(p?.nombre)}</strong></a><div class="faint">${esc(o?.nombre || '')}</div></td>
              <td>${esc(s.tipo)}</td><td class="nowrap">${fmtDate(s.fecha)}</td>
              <td class="right"><ion-button class="sm" data-send="${s.id}">Preguntar cómo evoluciona</ion-button>
              <ion-button class="sm" fill="outline" data-reply="${s.id}">Registrar respuesta</ion-button></td></tr>`;
            })
            .join('')}</tbody></table>`
          : emptyState('No hay seguimientos pendientes', 'Después de una consulta, cirugía u hospitalización aparecerá aquí para preguntar cómo va la mascota')
      }</div>
    </section>
    <section class="panel flush">
      <div class="panel-head"><h2>Respuestas de los clientes</h2></div>
      <div class="table-wrap">${
        respuestas.length
          ? `<table class="table"><thead><tr><th>Fecha</th><th>Mascota</th><th>Calificación</th><th>Comentario</th><th>Resultado</th></tr></thead><tbody>
          ${respuestas
            .map((r) => {
              const p = petMap.get(r.petId);
              return `<tr><td class="nowrap">${fmtDate(r.fecha)}</td><td><strong>${esc(p?.nombre || '—')}</strong><div class="faint">${esc(ownerMap.get(r.ownerId)?.nombre || '')}</div></td>
              <td>${badge(`${r.calificacion} de 5`, r.calificacion >= 4 ? 'ok' : r.calificacion === 3 ? 'warn' : 'bad')}</td>
              <td class="muted">${esc(r.comentario || '—')}</td>
              <td>${badge(r.resultado, r.resultado.startsWith('Derivado') ? 'bad' : 'ok')}</td></tr>`;
            })
            .join('')}</tbody></table>`
          : emptyState('Aún no hay respuestas')
      }</div>
    </section>`;

  root.querySelector('#save-url').addEventListener('click', async () => {
    const url = String(root.querySelector('#url').value || '').trim();
    if (!/^https?:\/\/\S+$/.test(url)) return toast('Ingresa un enlace válido que empiece con https://', 'danger');
    await saveSettings({ googleReviewUrl: url });
    toast('Enlace guardado', 'success');
  });

  root.querySelectorAll('[data-send]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = svcMap.get(b.dataset.send);
      const p = petMap.get(s.petId);
      const o = ownerMap.get(p.ownerId);
      openContactModal({
        pet: p,
        owner: o,
        asunto: `¿Cómo sigue ${p.nombre}?`,
        mensaje: `Hola ${primerNombre(o)}, te escribimos de ${cfg.clinica}. Queremos saber cómo ha evolucionado ${p.nombre} después de su ${s.tipo.toLowerCase()}. ¿Cómo la ves? Si pudieras calificar nuestra atención del 1 al 5, nos ayudarías mucho.`,
        nota: `Seguimiento post-atención (${s.tipo.toLowerCase()}).`,
        onSent: async () => {
          await db.update('services', s.id, { seguimientoEnviado: today });
          again();
        },
      });
    }),
  );

  root.querySelectorAll('[data-reply]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = svcMap.get(b.dataset.reply);
      const p = petMap.get(s.petId);
      const o = ownerMap.get(p.ownerId);
      let score = 0;
      const m = openModal({
        title: `Respuesta de ${o.nombre}`,
        size: 'sm',
        html: `<p class="muted cal-help">Atención de ${esc(p.nombre)} · ${esc(s.tipo)} del ${fmtDate(s.fecha)}</p>
          <div class="muted pick-label">Calificación (5 es la mejor)</div>${ratingHTML(0, 'score')}
          <div class="spacer"></div>${fArea('comentario', 'Comentario del cliente', '', { rows: 3 })}`,
        footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="rs">Guardar respuesta</ion-button>`,
      });
      bindRating(m.body, (v) => (score = v));
      m.foot.querySelector('#rs').addEventListener('click', async () => {
        if (!score) return toast('Elige una calificación del 1 al 5.', 'danger');
        const comentario = String(m.body.querySelector('[name=comentario]').value || '').trim();
        const alta = score >= 4;
        const enc = await db.insert('encuestas', {
          serviceId: s.id,
          petId: p.id,
          ownerId: o.id,
          fecha: today,
          calificacion: score,
          comentario,
          resultado: alta ? 'Calificación alta' : 'Derivado a Reclamos',
        });
        if (!alta) {
          await db.insert('reclamos', { encuestaId: enc.id, petId: p.id, ownerId: o.id, fecha: today, calificacion: score, comentario: comentario || 'Sin comentario', estado: 'Abierto' });
        }
        if (!s.seguimientoEnviado) await db.update('services', s.id, { seguimientoEnviado: today });
        m.close();
        if (alta) {
          toast('Respuesta guardada. Invita al cliente a dejar su reseña.', 'success');
          openContactModal({
            pet: p,
            owner: o,
            asunto: 'Tu opinión en Google nos ayuda',
            mensaje: `¡Gracias por tu calificación, ${primerNombre(o)}! Nos alegra que ${p.nombre} esté bien. Si tienes un minuto, cuéntanos tu experiencia aquí: ${cfg.googleReviewUrl}`,
            nota: 'Invitación a reseña de Google.',
            onSent: async () => {
              await db.update('encuestas', enc.id, { resultado: 'Invitado a reseña de Google' });
              again();
            },
          });
          again();
        } else {
          toast('Respuesta guardada. El caso pasó a Reclamos.', 'success');
          again();
        }
      });
    }),
  );
}
