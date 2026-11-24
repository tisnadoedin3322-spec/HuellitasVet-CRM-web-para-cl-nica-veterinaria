import { db, loadAll, byId } from '../../core/store.js';
import { esc, money, fmtDate, todayISO, num, round2, sum, diffDays } from '../../core/utils.js';
import { fIn, fSel, readForm, validateRequired, setError, toast, confirmDialog, openModal, badge, emptyState } from '../../core/ui.js';
import { CATEGORIAS_EGRESO } from '../../core/domain.js';

export async function render(root) {
  const data = await loadAll('expenses', 'purchases', 'suppliers');
  const supMap = byId(data.suppliers);
  const today = todayISO();
  const again = () => render(root);
  const mesActual = today.slice(0, 7);

  const porPagar = [
    ...data.expenses.filter((e) => e.estado === 'Pendiente').map((e) => ({ kind: 'gasto', id: e.id, concepto: e.descripcion, origen: e.categoria, monto: e.monto, vence: e.vence })),
    ...data.purchases.filter((c) => c.estado === 'Pendiente').map((c) => ({ kind: 'compra', id: c.id, concepto: `Compra ${c.comprobante || ''}`.trim(), origen: supMap.get(c.proveedorId)?.nombre || 'Proveedor', monto: c.total, vence: c.vence })),
  ].sort((a, b) => (a.vence || '9999').localeCompare(b.vence || '9999'));

  const pagadosMes = data.expenses.filter((e) => e.estado === 'Pagado' && (e.fechaPago || e.fecha).startsWith(mesActual));
  const vencidos = porPagar.filter((x) => x.vence && x.vence < today);
  let filtro = 'todos';

  root.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="label">Gastos pagados este mes</div><div class="value">${money(sum(pagadosMes, (e) => e.monto))}</div></div>
      <div class="kpi"><div class="label">Total por pagar</div><div class="value">${money(sum(porPagar, (x) => x.monto))}</div></div>
      <div class="kpi ${vencidos.length ? 'bad' : ''}"><div class="label">Pagos vencidos</div><div class="value">${vencidos.length}</div></div>
    </div>
    <section class="panel flush">
      <div class="panel-head"><h2>Cuentas por pagar</h2><span class="muted">Gastos y compras a proveedores con pago pendiente</span></div>
      <div class="table-wrap">${
        porPagar.length
          ? `<table class="table"><thead><tr><th>Concepto</th><th>Origen</th><th class="right">Monto</th><th>Vencimiento</th><th></th></tr></thead><tbody>
          ${porPagar
            .map((x) => {
              const d = x.vence ? diffDays(x.vence, today) : null;
              const tag = d == null ? '' : d < 0 ? badge(`Vencido hace ${-d} d`, 'bad') : d <= 5 ? badge(d === 0 ? 'Vence hoy' : `Vence en ${d} d`, 'warn') : badge(`En ${d} d`, 'neutral');
              return `<tr><td><strong>${esc(x.concepto)}</strong></td><td>${esc(x.origen)}</td><td class="right num">${money(x.monto)}</td>
              <td class="nowrap">${fmtDate(x.vence)} ${tag}</td><td class="right"><ion-button class="sm" data-pay="${x.kind}:${x.id}">Marcar como pagado</ion-button></td></tr>`;
            })
            .join('')}</tbody></table>`
          : emptyState('No hay pagos pendientes', 'Los gastos y compras pendientes de pago aparecerán aquí con su fecha de vencimiento')
      }</div>
    </section>
    <section class="panel flush">
      <div class="panel-head"><h2>Gastos registrados</h2>
        <div class="row"><ion-segment id="flt" value="todos" style="min-width:300px"><ion-segment-button value="todos"><ion-label>Todos</ion-label></ion-segment-button>
          <ion-segment-button value="Fijo"><ion-label>Fijos</ion-label></ion-segment-button><ion-segment-button value="Variable"><ion-label>Variables</ion-label></ion-segment-button></ion-segment>
        <ion-button id="new">Registrar gasto</ion-button></div></div>
      <div class="table-wrap" id="tbl"></div>
    </section>`;

  const tbl = root.querySelector('#tbl');
  const paint = () => {
    const list = data.expenses.filter((e) => filtro === 'todos' || e.tipo === filtro).sort((a, b) => b.fecha.localeCompare(a.fecha));
    tbl.innerHTML = list.length
      ? `<table class="table"><thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Tipo</th><th class="right">Monto</th><th>Estado</th></tr></thead><tbody>
        ${list.map((e) => `<tr><td class="nowrap">${fmtDate(e.fecha)}</td><td>${esc(e.descripcion)}</td><td>${esc(e.categoria)}</td><td>${esc(e.tipo)}</td>
          <td class="right num">${money(e.monto)}</td><td>${e.estado === 'Pagado' ? badge('Pagado', 'ok') : badge('Pendiente', 'warn')}</td></tr>`).join('')}</tbody></table>`
      : emptyState('No hay gastos con este filtro');
  };
  paint();
  root.querySelector('#flt').addEventListener('ionChange', (e) => { filtro = e.detail.value; paint(); });

  root.querySelectorAll('[data-pay]').forEach((b) =>
    b.addEventListener('click', async () => {
      const [kind, id] = b.dataset.pay.split(':');
      const item = porPagar.find((x) => x.kind === kind && x.id === id);
      if (!(await confirmDialog({ header: 'Marcar como pagado', message: `${item.concepto} por ${money(item.monto)} (${item.origen}).`, confirmText: 'Marcar pagado' }))) return;
      if (kind === 'gasto') await db.update('expenses', id, { estado: 'Pagado', fechaPago: todayISO() });
      else await db.update('purchases', id, { estado: 'Pagada', fechaPago: todayISO() });
      toast('Pago registrado', 'success');
      again();
    }),
  );

  root.querySelector('#new').addEventListener('click', () => {
    const m = openModal({
      title: 'Registrar gasto',
      size: 'sm',
      html: `<form class="form-grid" id="ef" novalidate>
        <div class="full">${fIn('descripcion', 'Descripción', '', { req: true, mask: 'text', len: 80, minLen: 3 })}</div>
        ${fSel('categoria', 'Categoría', CATEGORIAS_EGRESO, CATEGORIAS_EGRESO[0], { req: true })}
        ${fSel('tipo', 'Tipo', ['Fijo', 'Variable'], 'Fijo', { req: true })}
        ${fIn('monto', 'Monto (S/)', '', { mask: 'money', req: true })}
        ${fIn('fecha', 'Fecha del gasto', todayISO(), { type: 'date', stacked: true, req: true, max: todayISO() })}
        ${fSel('estado', 'Estado', ['Pagado', 'Pendiente'], 'Pagado', { req: true })}
        <div id="vbox" hidden>${fIn('vence', 'Vence el pago', '', { type: 'date', stacked: true })}</div>
      </form>`,
      footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="es">Guardar gasto</ion-button>`,
    });
    const form = m.body.querySelector('#ef');
    form.querySelector('[name=estado]').addEventListener('ionChange', (e) => (m.body.querySelector('#vbox').hidden = e.detail.value !== 'Pendiente'));
    m.foot.querySelector('#es').addEventListener('click', async () => {
      if (!validateRequired(form)) return;
      const v = readForm(form);
      if (num(v.monto) <= 0) return setError(form, 'monto', 'Ingresa un monto mayor que cero');
      if (v.estado === 'Pendiente' && !v.vence) return setError(form, 'vence', 'Indica la fecha de vencimiento para no pagar recargos');
      await db.insert('expenses', {
        descripcion: String(v.descripcion).trim(), categoria: v.categoria, tipo: v.tipo, monto: round2(num(v.monto)),
        fecha: v.fecha, estado: v.estado, vence: v.estado === 'Pendiente' ? v.vence : null, fechaPago: v.estado === 'Pagado' ? v.fecha : null,
      });
      m.close();
      toast('Gasto registrado', 'success');
      again();
    });
  });
}

