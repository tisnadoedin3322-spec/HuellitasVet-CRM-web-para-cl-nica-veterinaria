import { db, loadAll } from '../../core/store.js';
import { esc, money, fmtDate, todayISO, num, round2 } from '../../core/utils.js';
import { fIn, fSel, fArea, readForm, validateRequired, setError, toast, openModal, badge, emptyState } from '../../core/ui.js';
import { METODOS, DIGITALES } from '../../core/domain.js';
import { openCaja, resumenCaja, horaLocal } from './shared.js';

export async function render(root) {
  const data = await loadAll('cajas', 'sales', 'cajaMovs');
  const caja = data.cajas.find((c) => c.estado === 'Abierta') || null;
  const again = () => render(root);
  const cerradas = data.cajas.filter((c) => c.estado === 'Cerrada').sort((a, b) => b.fechaApertura.localeCompare(a.fechaApertura));

  let top = '';
  if (!caja) {
    top = `<section class="panel narrow">
      <h2>Abrir caja</h2>
      <p class="muted cal-help">Anota el efectivo con el que empieza el día, sin caja abierta no se puede cobrar</p>
      <form class="stack" id="of" novalidate>
        ${fIn('monto', 'Monto inicial en efectivo (S/)', '0', { mask: 'money', req: true })}
        ${fIn('responsable', 'Responsable de caja', '', { req: true, mask: 'name', len: 60, minLen: 2 })}
        <ion-button id="open">Abrir caja</ion-button>
      </form></section>`;
  } else {
    const r = resumenCaja(caja, data.sales, data.cajaMovs);
    top = `
      <div class="kpis">
        <div class="kpi"><div class="label">Caja abierta desde</div><div class="value value-sm">${fmtDate(caja.fechaApertura)} ${esc(caja.hora || '')}</div><div class="faint">${esc(caja.responsable)}</div></div>
        <div class="kpi"><div class="label">Monto inicial</div><div class="value">${money(caja.montoInicial)}</div></div>
        <div class="kpi good"><div class="label">Cobros registrados</div><div class="value">${money(r.cobros)}</div></div>
        <div class="kpi warn"><div class="label">Efectivo esperado en caja</div><div class="value">${money(r.esperadoEfectivo)}</div></div>
      </div>
      <div class="grid grid-2">
        <section class="panel">
          <h3>Cobros por medio de pago</h3>
          <table class="table compact"><tbody>${METODOS.map((m) => `<tr><td>${m}</td><td class="right num">${money(r.porMetodo[m])}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td>Total</td><td class="right num">${money(r.cobros)}</td></tr></tfoot></table>
        </section>
        <section class="panel">
          <div class="panel-head"><h3>Caja chica</h3><ion-button fill="outline" class="sm" id="mov">Registrar movimiento</ion-button></div>
          ${
            r.movs.length
              ? `<table class="table compact"><tbody>${r.movs.map((m) => `<tr><td>${esc(m.motivo)}<div class="faint">${esc(m.responsable)}</div></td><td>${badge(m.tipo, m.tipo === 'Ingreso' ? 'ok' : 'warn')}</td><td class="right num">${m.tipo === 'Salida' ? '−' : ''}${money(m.monto)}</td></tr>`).join('')}</tbody></table>`
              : '<p class="muted">Todavía no hay ingresos ni salidas menores de efectivo</p>'
          }
        </section>
      </div>
      <div class="form-actions"><ion-button id="close">Cerrar caja y hacer arqueo</ion-button></div>`;
  }

  root.innerHTML = `${top}
    <section class="panel flush hist"><div class="panel-head"><h2>Cierres anteriores</h2></div><div class="table-wrap">${
      cerradas.length
        ? `<table class="table"><thead><tr><th>Fecha</th><th>Responsable</th><th class="right">Efectivo esperado</th><th class="right">Efectivo contado</th><th class="right">Diferencia</th><th class="right">Digital esperado</th><th class="right">Digital contado</th><th class="right">Diferencia</th></tr></thead><tbody>
        ${cerradas
          .map((c) => {
            const d1 = round2(c.conteoEfectivo - c.esperadoEfectivo);
            const d2 = round2(c.conteoDigital - c.esperadoDigital);
            const b = (d) => badge(d === 0 ? 'Cuadra' : `${d > 0 ? '+' : '−'}${money(Math.abs(d))}`, d === 0 ? 'ok' : 'bad');
            return `<tr><td class="nowrap">${fmtDate(c.fechaApertura)}</td><td>${esc(c.responsable)}</td>
              <td class="right num">${money(c.esperadoEfectivo)}</td><td class="right num">${money(c.conteoEfectivo)}</td><td class="right">${b(d1)}</td>
              <td class="right num">${money(c.esperadoDigital)}</td><td class="right num">${money(c.conteoDigital)}</td><td class="right">${b(d2)}</td></tr>`;
          })
          .join('')}</tbody></table>`
        : emptyState('Aún no hay cierres', 'Al cerrar la caja del día, el arqueo queda guardado aquí')
    }</div></section>`;

  root.querySelector('#open')?.addEventListener('click', async () => {
    const form = root.querySelector('#of');
    if (!validateRequired(form)) return;
    const v = readForm(form);
    if (num(v.monto) < 0) return setError(form, 'monto', 'El monto no puede ser negativo');
    if (await openCaja()) return again();
    await db.insert('cajas', { fechaApertura: todayISO(), hora: horaLocal(), montoInicial: round2(num(v.monto)), responsable: String(v.responsable).trim(), estado: 'Abierta' });
    toast('Caja abierta. Ya puedes cobrar.', 'success');
    again();
  });

  root.querySelector('#mov')?.addEventListener('click', () => {
    const m = openModal({
      title: 'Movimiento de caja chica',
      size: 'sm',
      html: `<form class="stack" id="mf" novalidate>
        ${fSel('tipo', 'Tipo', ['Salida', 'Ingreso'], 'Salida', { req: true })}
        ${fIn('monto', 'Monto (S/)', '', { mask: 'money', req: true })}
        ${fIn('motivo', 'Motivo (por ejemplo, compra de agua o movilidad)', '', { req: true, mask: 'text', len: 60, minLen: 3 })}
        ${fIn('responsable', 'Responsable', caja.responsable, { req: true, mask: 'name', len: 60, minLen: 2 })}
      </form>`,
      footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="ms">Guardar movimiento</ion-button>`,
    });
    m.foot.querySelector('#ms').addEventListener('click', async () => {
      const form = m.body.querySelector('#mf');
      if (!validateRequired(form)) return;
      const v = readForm(form);
      if (num(v.monto) <= 0) return setError(form, 'monto', 'Ingresa un monto mayor que cero');
      await db.insert('cajaMovs', { cajaId: caja.id, tipo: v.tipo, monto: round2(num(v.monto)), motivo: String(v.motivo).trim(), responsable: String(v.responsable).trim(), fecha: todayISO() });
      m.close();
      toast('Movimiento registrado', 'success');
      again();
    });
  });

  root.querySelector('#close')?.addEventListener('click', () => {
    const r = resumenCaja(caja, data.sales, data.cajaMovs);
    const m = openModal({
      title: 'Cierre de caja y arqueo',
      size: 'sm',
      html: `<p class="muted cal-help">Cuenta el dinero físico y revisa vouchers y transferencias, el sistema compara lo contado con lo registrado</p>
        <dl class="dl dl-wide"><dt>Efectivo esperado</dt><dd class="num">${money(r.esperadoEfectivo)}</dd>
          <dt>Digital esperado</dt><dd class="num">${money(r.esperadoDigital)}</dd></dl>
        <form class="stack" id="cf" novalidate>
          ${fIn('efectivo', 'Efectivo contado (S/)', '', { mask: 'money', req: true })}
          ${fIn('digital', `Total digital contado (${DIGITALES.join(', ')}) (S/)`, '', { mask: 'money', req: true })}
          ${fArea('obs', 'Observaciones del cierre', '')}
        </form>
        <div id="dif" class="dif-box"></div>`,
      footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="cs">Cerrar caja</ion-button>`,
    });
    const form = m.body.querySelector('#cf');
    const dif = m.body.querySelector('#dif');
    const calc = () => {
      const e = form.querySelector('[name=efectivo]').value;
      const d = form.querySelector('[name=digital]').value;
      const fmt = (x, esp) => {
        const v = round2(num(x) - esp);
        return v === 0 ? badge('Cuadra', 'ok') : badge(`${v > 0 ? 'Sobra' : 'Falta'} ${money(Math.abs(v))}`, 'bad');
      };
      dif.innerHTML = e === '' && d === '' ? '' : `<div class="row">Efectivo: ${e === '' ? '—' : fmt(e, r.esperadoEfectivo)} Digital: ${d === '' ? '—' : fmt(d, r.esperadoDigital)}</div>`;
    };
    form.addEventListener('ionInput', calc);
    m.foot.querySelector('#cs').addEventListener('click', async () => {
      if (!validateRequired(form)) return;
      const v = readForm(form);
      await db.update('cajas', caja.id, {
        estado: 'Cerrada',
        fechaCierre: todayISO(),
        esperadoEfectivo: round2(r.esperadoEfectivo),
        esperadoDigital: round2(r.esperadoDigital),
        conteoEfectivo: round2(num(v.efectivo)),
        conteoDigital: round2(num(v.digital)),
        observaciones: String(v.obs || '').trim(),
      });
      m.close();
      toast('Caja cerrada. El arqueo quedó guardado.', 'success');
      again();
    });
  });
}
