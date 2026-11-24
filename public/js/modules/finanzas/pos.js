import { db, loadAll, byId } from '../../core/store.js';
import { esc, money, fmtDate, todayISO, addDays, num, round2, sum, digits } from '../../core/utils.js';
import { fIn, fSel, toast, openModal, badge, emptyState, picker, printNode, icon } from '../../core/ui.js';
import {
  METODOS, COMPROBANTES, servicioDe, categoriaVentaProducto, nextCorrelativo, debtByOwner, getSettings,
} from '../../core/domain.js';
import { openCaja } from './shared.js';

export async function render(root, { query }) {
  const data = await loadAll('owners', 'pets', 'services', 'products', 'sales', 'staff');
  const cfg = await getSettings();
  const caja = await openCaja();
  const petMap = byId(data.pets);
  const staffMap = byId(data.staff);
  const debts = debtByOwner(data.sales);
  const vendibles = data.products.filter((p) => p.precioVenta > 0 && p.stock > 0).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const state = { owner: null, checked: new Set(), cart: [] };

  root.innerHTML = `
    ${caja ? '' : `<div class="banner warn"><strong>La caja está cerrada.</strong> Ábrela para poder cobrar. <a href="#/finanzas/caja">Ir a Caja diaria</a></div>`}
    <div class="grid grid-side">
      <div class="stack">
        <section class="panel">
          <h2>Cliente</h2>
          <p class="muted cal-help">Elige al propietario para traer sus servicios de las fichas médicas, para vender solo productos puedes dejarlo vacío</p>
          <div id="pk"></div><div id="debt"></div>
        </section>
        <section class="panel">
          <h2>Servicios pendientes de cobro</h2>
          <div id="svc"></div>
        </section>
        <section class="panel">
          <h2>Productos</h2>
          ${
            vendibles.length
              ? `<div class="add-prod">
              <ion-select id="p-sel" label="Producto" label-placement="stacked" fill="outline" interface="popover" value="${vendibles[0].id}">
                ${vendibles.map((p) => `<ion-select-option value="${p.id}">${esc(p.nombre)} — ${money(p.precioVenta)} (${p.stock} disp.)</ion-select-option>`).join('')}
              </ion-select>
              <ion-input id="p-qty" label="Cantidad" label-placement="stacked" fill="outline" type="text" inputmode="numeric" data-mask="int" maxlength="4" value="1"></ion-input>
              <ion-button id="p-add" fill="outline">Agregar</ion-button></div>`
              : '<p class="muted">No hay productos con stock para vender</p>'
          }
          <div id="cart"></div>
        </section>
      </div>

      <aside class="panel sticky" id="pay">
        <h2>Cobro</h2>
        <div class="total-box"><span>Total a cobrar</span><strong class="num" id="total">${money(0)}</strong></div>
        <div class="stack">
          <ion-select id="comp" label="Comprobante" label-placement="stacked" fill="outline" interface="popover" value="Ticket interno">
            ${Object.keys(COMPROBANTES).map((c) => `<ion-select-option value="${c}">${c}</ion-select-option>`).join('')}
          </ion-select>
          <div id="fact" class="stack" hidden>
            ${fIn('ruc', 'RUC del cliente', '', { mask: 'ruc' })}
            ${fIn('razon', 'Razón social', '', { mask: 'text', len: 80 })}
          </div>
          <div class="pay-title">Medios de pago <span class="faint">(puedes combinarlos)</span></div>
          ${METODOS.map(
            (m) => `<div class="pay-row">
              <ion-input data-m="${m}" label="${m}" label-placement="stacked" fill="outline" type="text" inputmode="decimal" data-mask="money" maxlength="10" placeholder="0.00"></ion-input>
              <ion-button fill="outline" class="sm" data-fill="${m}" title="Completar con lo que falta cobrar">Completar</ion-button></div>`,
          ).join('')}
          <dl class="dl dl-tight sum">
            <dt>Pagado</dt><dd class="num" id="pagado">${money(0)}</dd>
            <dt>Saldo</dt><dd class="num" id="saldo">${money(0)}</dd>
          </dl>
          <div id="credito" hidden>
            <div class="banner warn">Queda saldo pendiente. Se registrará como cuenta por cobrar del propietario.</div>
            ${fIn('vence', 'Fecha límite de pago', addDays(todayISO(), 15), { type: 'date', stacked: true })}
          </div>
          <ion-button expand="block" id="cobrar" ${caja ? '' : 'disabled'}>Cobrar</ion-button>
        </div>
      </aside>
    </div>`;

  const $ = (s) => root.querySelector(s);
  const svcBox = $('#svc');
  const cartBox = $('#cart');

  const pendientes = () =>
    state.owner
      ? data.services.filter((s) => !s.cobrado && petMap.get(s.petId)?.ownerId === state.owner.id).sort((a, b) => a.fecha.localeCompare(b.fecha))
      : [];

  const totals = () => {
    const sv = sum(pendientes().filter((s) => state.checked.has(s.id)), (s) => s.monto);
    const pr = sum(state.cart, (l) => l.cantidad * l.precioUnit);
    const total = round2(sv + pr);
    const pagado = round2(sum(METODOS, (m) => num($(`[data-m="${m}"]`).value)));
    return { total, pagado, saldo: round2(total - pagado) };
  };

  const drawTotals = () => {
    const t = totals();
    $('#total').textContent = money(t.total);
    $('#pagado').textContent = money(t.pagado);
    $('#saldo').textContent = money(Math.max(0, t.saldo));
    $('#credito').hidden = !(t.total > 0 && t.saldo > 0.009);
  };

  const drawServices = () => {
    const list = pendientes();
    if (!state.owner) svcBox.innerHTML = '<p class="muted">Elige un propietario para ver sus servicios pendientes</p>';
    else if (!list.length) svcBox.innerHTML = emptyState('Sin servicios pendientes', 'Registra servicios desde la ficha de la mascota, también puedes vender productos');
    else {
      svcBox.innerHTML = `<table class="table"><tbody>${list
        .map((s) => {
          const p = petMap.get(s.petId);
          return `<tr><td class="chk"><ion-checkbox data-svc="${s.id}" ${state.checked.has(s.id) ? 'checked' : ''} aria-label="Cobrar ${esc(s.tipo)}"></ion-checkbox></td>
            <td><strong>${esc(s.tipo)}</strong> — ${esc(p?.nombre)}<div class="faint">${fmtDate(s.fecha)}${s.detalle ? ' · ' + esc(s.detalle) : ''}</div></td>
            <td class="right num">${money(s.monto)}</td></tr>`;
        })
        .join('')}</tbody></table>`;
      svcBox.querySelectorAll('[data-svc]').forEach((c) =>
        c.addEventListener('ionChange', (e) => {
          e.detail.checked ? state.checked.add(c.dataset.svc) : state.checked.delete(c.dataset.svc);
          drawTotals();
        }),
      );
    }
  };

  const drawCart = () => {
    if (!state.cart.length) {
      cartBox.innerHTML = '';
      return;
    }
    cartBox.innerHTML = `<table class="table"><thead><tr><th>Producto</th><th class="right">Cant.</th><th class="right">P. unit.</th><th class="right">Subtotal</th><th></th></tr></thead><tbody>
      ${state.cart
        .map(
          (l, i) => `<tr><td>${esc(l.nombre)}</td><td class="right num">${l.cantidad}</td><td class="right num">${money(l.precioUnit)}</td>
          <td class="right num">${money(l.cantidad * l.precioUnit)}</td><td class="right"><ion-button fill="clear" class="sm danger" data-rm="${i}">${icon('trash')}Quitar</ion-button></td></tr>`,
        )
        .join('')}</tbody></table>`;
    cartBox.querySelectorAll('[data-rm]').forEach((b) =>
      b.addEventListener('click', () => {
        state.cart.splice(Number(b.dataset.rm), 1);
        drawCart();
        drawTotals();
      }),
    );
  };

  const setOwner = (o) => {
    state.owner = o;
    state.checked = new Set(pendientes().map((s) => s.id));
    const d = o && debts.get(o.id);
    $('#debt').innerHTML = d
      ? `<div class="banner ${d.vencida ? 'bad' : 'info'} debt-note"><strong>${d.vencida ? 'Deuda vencida' : 'Saldo pendiente'}:</strong> ${esc(o.nombre)} debe ${money(d.total)}${d.vencida ? ` (${money(d.vencida)} vencidos)` : ''}. <a href="#/finanzas/cobrar">Ver cuentas por cobrar</a></div>`
      : '';
    drawServices();
    drawTotals();
  };

  const initial = (query?.owner && data.owners.find((o) => o.id === query.owner)) || null;
  picker($('#pk'), {
    items: data.owners,
    textOf: (o) => o.nombre,
    subOf: (o) => data.pets.filter((p) => p.ownerId === o.id).map((p) => p.nombre).join(', '),
    placeholder: 'Buscar propietario o mascota',
    selected: initial,
    onSelect: setOwner,
  });
  if (initial) setOwner(initial);
  else drawServices();
  drawCart();

  $('#p-add')?.addEventListener('click', () => {
    const p = data.products.find((x) => x.id === $('#p-sel').value);
    const q = Math.floor(num($('#p-qty').value));
    if (!p || q <= 0) return toast('Ingresa una cantidad válida.', 'danger');
    const ya = state.cart.find((l) => l.productoId === p.id);
    const nuevo = (ya?.cantidad || 0) + q;
    if (nuevo > p.stock) return toast(`Solo quedan ${p.stock} unidades de ${p.nombre}.`, 'danger');
    if (ya) ya.cantidad = nuevo;
    else state.cart.push({ productoId: p.id, nombre: p.nombre, cantidad: q, precioUnit: p.precioVenta, costo: p.precioCompra, categoria: categoriaVentaProducto(p.categoria) });
    $('#p-qty').value = 1;
    drawCart();
    drawTotals();
  });

  $('#comp').addEventListener('ionChange', (e) => ($('#fact').hidden = e.detail.value !== 'Factura'));
  root.querySelectorAll('[data-m]').forEach((i) => i.addEventListener('ionInput', drawTotals));
  root.querySelectorAll('[data-fill]').forEach((b) =>
    b.addEventListener('click', () => {
      const m = b.dataset.fill;
      const otros = sum(METODOS.filter((x) => x !== m), (x) => num($(`[data-m="${x}"]`).value));
      const resto = Math.max(0, round2(totals().total - otros));
      $(`[data-m="${m}"]`).value = resto ? String(resto) : '';
      drawTotals();
    }),
  );

  $('#cobrar').addEventListener('click', async () => {
    const cajaActual = await openCaja();
    if (!cajaActual) return toast('Abre la caja antes de cobrar.', 'danger');
    const t = totals();
    const servicios = pendientes().filter((s) => state.checked.has(s.id));
    if (!servicios.length && !state.cart.length) return toast('Agrega al menos un servicio o un producto.', 'danger');
    if (t.pagado > t.total + 0.009) return toast('Los pagos superan el total. Ajusta los montos.', 'danger');
    if (t.saldo > 0.009 && !state.owner) return toast('Para dejar saldo pendiente debes elegir al propietario.', 'danger');
    const tipo = $('#comp').value;
    const ruc = digits($('[name=ruc]').value);
    const razon = String($('[name=razon]').value || '').trim();
    if (tipo === 'Factura' && (ruc.length !== 11 || !razon)) return toast('Para la factura ingresa el RUC (11 dígitos) y la razón social.', 'danger');
    const vence = t.saldo > 0.009 ? $('[name=vence]').value : null;
    if (t.saldo > 0.009 && !vence) return toast('Indica la fecha límite de pago del saldo.', 'danger');
    if (t.saldo > 0.009 && vence < todayISO()) return toast('La fecha límite de pago no puede ser anterior a hoy.', 'danger');

    const items = [
      ...servicios.map((s) => {
        const pet = petMap.get(s.petId);
        const pct = staffMap.get(s.staffId)?.comision || 0;
        return {
          tipo: 'servicio', refId: s.id, desc: `${s.tipo} — ${pet?.nombre}`, cantidad: 1, precioUnit: s.monto, subtotal: s.monto,
          categoria: servicioDe(s.tipo)?.categoria || 'Servicios', costo: round2((s.monto * pct) / 100),
        };
      }),
      ...state.cart.map((l) => ({
        tipo: 'producto', refId: l.productoId, desc: l.nombre, cantidad: l.cantidad, precioUnit: l.precioUnit,
        subtotal: round2(l.cantidad * l.precioUnit), categoria: l.categoria, costo: round2(l.costo * l.cantidad),
      })),
    ];
    const hoy = todayISO();
    const pagos = METODOS.filter((m) => num($(`[data-m="${m}"]`).value) > 0).map((m) => ({ fecha: hoy, metodo: m, monto: round2(num($(`[data-m="${m}"]`).value)), cajaId: cajaActual.id }));
    const allSales = await db.list('sales');
    const sale = await db.insert('sales', {
      fecha: hoy,
      hora: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }),
      ownerId: state.owner?.id || null,
      petId: null,
      items,
      total: t.total,
      pagos,
      comprobanteTipo: tipo,
      comprobante: nextCorrelativo(allSales, tipo),
      cliente: tipo === 'Factura' ? { ruc, razon } : null,
      fechaVence: vence,
    });
    for (const s of servicios) await db.update('services', s.id, { cobrado: true, saleId: sale.id });
    for (const l of state.cart) {
      const cur = await db.get('products', l.productoId);
      await db.update('products', l.productoId, { stock: Math.max(0, (cur?.stock || 0) - l.cantidad) });
    }
    toast('Cobro registrado', 'success');
    showTicket(sale, state.owner, cfg, () => render(root, { query: {} }));
  });
}

function showTicket(sale, owner, cfg, onClose) {
  const pagado = sum(sale.pagos, (p) => p.monto);
  const saldo = round2(sale.total - pagado);
  const m = openModal({
    title: sale.comprobanteTipo,
    size: 'sm',
    html: `<div class="ticket" id="ticket">
      <div class="ticket-head"><strong>${esc(cfg.clinica)}</strong><div>${esc(sale.comprobanteTipo)} ${esc(sale.comprobante)}</div>
        <div class="faint">${fmtDate(sale.fecha)} ${esc(sale.hora || '')}</div></div>
      <div class="ticket-client">Cliente: ${esc(owner?.nombre || 'Venta de mostrador')}${sale.cliente ? `<br>RUC ${esc(sale.cliente.ruc)} · ${esc(sale.cliente.razon)}` : ''}</div>
      <table class="table compact"><tbody>${sale.items
        .map((i) => `<tr><td>${esc(i.desc)}${i.cantidad > 1 ? ` <span class="faint">x${i.cantidad}</span>` : ''}</td><td class="right num">${money(i.subtotal)}</td></tr>`)
        .join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="right num">${money(sale.total)}</td></tr></tfoot></table>
      <dl class="dl dl-tight">${sale.pagos.map((p) => `<dt>${esc(p.metodo)}</dt><dd class="num">${money(p.monto)}</dd>`).join('')}
        ${saldo > 0 ? `<dt>Saldo pendiente</dt><dd class="num">${money(saldo)}</dd><dt>Vence</dt><dd>${fmtDate(sale.fechaVence)}</dd>` : ''}</dl>
      <p class="faint ticket-foot">Comprobante interno de la clínica. No reemplaza una boleta o factura electrónica de SUNAT.</p></div>`,
    footer: `<ion-button fill="outline" id="print">Imprimir</ion-button><ion-button data-close>Listo</ion-button>`,
  });
  m.foot.querySelector('#print').addEventListener('click', () => printNode(m.body.querySelector('#ticket')));
  m.el.addEventListener('didDismiss', onClose);
}
