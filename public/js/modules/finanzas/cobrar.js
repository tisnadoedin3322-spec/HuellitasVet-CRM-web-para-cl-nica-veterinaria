import { db, loadAll, byId } from '../../core/store.js';
import { esc, money, fmtDate, todayISO, num, round2, sum, diffDays } from '../../core/utils.js';
import { fIn, fSel, readForm, validateRequired, setError, toast, openModal, badge, emptyState } from '../../core/ui.js';
import { METODOS, saldoVenta, pagadoVenta, getSettings } from '../../core/domain.js';
import { openCaja } from './shared.js';
import { openContactModal, primerNombre } from '../crm/contacto.js';

export async function render(root) {
  const data = await loadAll('sales', 'owners', 'pets');
  const cfg = await getSettings();
  const ownerMap = byId(data.owners);
  const today = todayISO();
  const again = () => render(root);
  const abiertas = data.sales
    .filter((s) => saldoVenta(s) > 0)
    .sort((a, b) => (a.fechaVence || '9999').localeCompare(b.fechaVence || '9999'));
  const totalSaldo = sum(abiertas, saldoVenta);
  const vencido = sum(abiertas.filter((s) => s.fechaVence && s.fechaVence < today), saldoVenta);
  const deudores = new Set(abiertas.map((s) => s.ownerId)).size;

  root.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="label">Total por cobrar</div><div class="value">${money(totalSaldo)}</div></div>
      <div class="kpi ${vencido ? 'bad' : ''}"><div class="label">Deuda vencida</div><div class="value">${money(vencido)}</div></div>
      <div class="kpi"><div class="label">Propietarios con saldo</div><div class="value">${deudores}</div></div>
    </div>
    <div class="panel flush"><div class="panel-head"><h2>Saldos pendientes</h2><span class="muted">Los más urgentes primero</span></div>
    <div class="table-wrap">${
      abiertas.length
        ? `<table class="table"><thead><tr><th>Propietario</th><th>Comprobante</th><th>Fecha</th><th class="right">Total</th><th class="right">Pagado</th><th class="right">Saldo</th><th>Vencimiento</th><th></th></tr></thead><tbody>
        ${abiertas
          .map((s) => {
            const o = ownerMap.get(s.ownerId);
            const venc = s.fechaVence && s.fechaVence < today;
            const dias = s.fechaVence ? diffDays(s.fechaVence, today) : null;
            return `<tr><td><strong>${esc(o?.nombre || '—')}</strong><div class="faint">${esc(o?.celular || '')}</div></td>
            <td>${esc(s.comprobante)}</td><td class="nowrap">${fmtDate(s.fecha)}</td>
            <td class="right num">${money(s.total)}</td><td class="right num">${money(pagadoVenta(s))}</td><td class="right num"><strong>${money(saldoVenta(s))}</strong></td>
            <td class="nowrap">${fmtDate(s.fechaVence)} ${venc ? badge(`Vencida hace ${-dias} d`, 'bad') : dias != null ? badge(`Vence en ${dias} d`, dias <= 5 ? 'warn' : 'neutral') : ''}</td>
            <td class="right nowrap"><ion-button class="sm" data-abono="${s.id}">Registrar abono</ion-button>
              <ion-button class="sm" fill="outline" data-cobranza="${s.id}">Recordar</ion-button></td></tr>`;
          })
          .join('')}</tbody></table>`
        : emptyState('No hay deudas pendientes', 'Cuando un cobro quede con saldo, aparecerá aquí hasta que se complete')
    }</div></div>`;

  root.querySelectorAll('[data-abono]').forEach((b) =>
    b.addEventListener('click', async () => {
      const caja = await openCaja();
      if (!caja) return toast('Abre la caja para registrar el abono.', 'danger');
      const s = abiertas.find((x) => x.id === b.dataset.abono);
      const saldo = saldoVenta(s);
      const m = openModal({
        title: `Abono de ${ownerMap.get(s.ownerId)?.nombre || ''}`,
        size: 'sm',
        html: `<p class="muted cal-help">Comprobante ${esc(s.comprobante)} · Saldo actual <strong>${money(saldo)}</strong></p>
          <form class="stack" id="af" novalidate>
            ${fIn('monto', 'Monto del abono (S/)', round2(saldo), { mask: 'money', req: true })}
            ${fSel('metodo', 'Medio de pago', METODOS, 'Efectivo', { req: true })}
          </form>`,
        footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="as">Registrar abono</ion-button>`,
      });
      m.foot.querySelector('#as').addEventListener('click', async () => {
        const form = m.body.querySelector('#af');
        if (!validateRequired(form)) return;
        const v = readForm(form);
        const monto = round2(num(v.monto));
        if (monto <= 0 || monto > saldo + 0.009) return setError(form, 'monto', `Ingresa un monto entre S/ 0.10 y ${money(saldo)}`);
        const fresh = await db.get('sales', s.id);
        fresh.pagos.push({ fecha: todayISO(), metodo: v.metodo, monto, cajaId: caja.id });
        await db.update('sales', s.id, { pagos: fresh.pagos });
        m.close();
        toast(monto >= saldo - 0.009 ? 'Deuda cancelada por completo' : 'Abono registrado', 'success');
        again();
      });
    }),
  );

  root.querySelectorAll('[data-cobranza]').forEach((b) =>
    b.addEventListener('click', () => {
      const s = abiertas.find((x) => x.id === b.dataset.cobranza);
      const o = ownerMap.get(s.ownerId);
      openContactModal({
        pet: null,
        owner: o,
        asunto: 'Saldo pendiente en ' + cfg.clinica,
        mensaje: `Hola ${primerNombre(o)}, te escribimos de ${cfg.clinica}. Tienes un saldo pendiente de ${money(saldoVenta(s))} del comprobante ${s.comprobante}${s.fechaVence ? ` con fecha límite ${fmtDate(s.fechaVence)}` : ''}. Puedes pagarlo por Yape, Plin o transferencia. ¡Gracias!`,
        nota: `Recordatorio de saldo pendiente (${money(saldoVenta(s))}).`,
      });
    }),
  );
}
