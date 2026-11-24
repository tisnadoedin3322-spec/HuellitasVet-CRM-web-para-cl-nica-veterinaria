import { db, loadAll, byId } from '../core/store.js';
import { esc, norm, money, fmtDate, filterSimilar, debounce, sum, num, round2, todayISO, digits } from '../core/utils.js';
import {
  fIn, fSel, readForm, validateRequired, setError, toast, confirmDialog, openModal,
  badge, emptyState, pageHead, icon,
} from '../core/ui.js';
import { CATEGORIAS_PRODUCTO } from '../core/domain.js';

export async function render(view, { parts }) {
  if (parts[0]) return renderFicha(view, parts[0]);
  return renderLista(view);
}

async function renderLista(view) {
  const { suppliers, products, purchases } = await loadAll('suppliers', 'products', 'purchases');
  const seen = new Set();
  const rows = suppliers
    .filter((s) => {
      const k = s.ruc ? 'r' + s.ruc : 'n' + norm(s.nombre);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  view.innerHTML = `
    ${pageHead('Proveedores', 'Todos tus proveedores en un solo lugar, abre uno para ver su ficha, sus productos y lo que le has comprado', `<ion-button id="new">Nuevo proveedor</ion-button>`)}
    <div class="toolbar">
      <ion-searchbar class="grow" id="q" placeholder="Buscar por nombre del proveedor" debounce="0" autocomplete="off"></ion-searchbar>
      <span class="muted" id="count"></span>
    </div>
    <div class="panel flush"><div class="table-wrap" id="tbl"></div></div>`;

  const tbl = view.querySelector('#tbl');
  const paint = (q) => {
    const list = filterSimilar(rows, q, (s) => s.nombre + ' ' + (s.contacto || '') + ' ' + (s.ruc || ''));
    view.querySelector('#count').textContent = `${list.length} ${list.length === 1 ? 'proveedor' : 'proveedores'}`;
    if (!list.length) {
      tbl.innerHTML = emptyState('No hay coincidencias', q ? `Ningún proveedor se parece a “${q}”` : 'Registra tu primer proveedor');
      return;
    }
    tbl.innerHTML = `<table class="table"><thead><tr>
      <th>Proveedor</th><th>RUC</th><th>Contacto</th><th class="right">Productos</th><th class="right">Total comprado</th>
      </tr></thead><tbody>${list
        .map((s) => {
          const prods = products.filter((p) => p.proveedorId === s.id).length;
          const total = sum(purchases.filter((c) => c.proveedorId === s.id), (c) => c.total);
          return `<tr class="row-link" data-id="${s.id}">
            <td><a href="#/proveedores/${s.id}"><strong>${esc(s.nombre)}</strong></a></td>
            <td class="num">${esc(s.ruc || '—')}</td>
            <td>${esc(s.contacto || '—')}<div class="faint">${esc(s.celular || '')}</div></td>
            <td class="right num">${prods}</td>
            <td class="right num">${money(total)}</td></tr>`;
        })
        .join('')}</tbody></table>`;
    tbl.querySelectorAll('tr.row-link').forEach((tr) =>
      tr.addEventListener('click', (e) => {
        if (!e.target.closest('a')) location.hash = `#/proveedores/${tr.dataset.id}`;
      }),
    );
  };
  paint('');
  view.querySelector('#q').addEventListener('ionInput', debounce((e) => paint(e.target.value || ''), 120));
  view.querySelector('#new').addEventListener('click', () => supplierModal({ suppliers, onSaved: () => renderLista(view) }));
}

function supplierModal({ suppliers, current = null, onSaved }) {
  const m = openModal({
    title: current ? 'Editar proveedor' : 'Nuevo proveedor',
    html: `<form class="form-grid" id="sf" novalidate>
      <div class="full">${fIn('nombre', 'Razón social o nombre', current?.nombre, { req: true, mask: 'text', len: 80, minLen: 2 })}</div>
      ${fIn('ruc', 'RUC', current?.ruc, { mask: 'ruc' })}
      ${fIn('contacto', 'Persona de contacto', current?.contacto, { mask: 'name', len: 60 })}
      ${fIn('celular', 'Celular', current?.celular, { mask: 'phone' })}
      ${fIn('correo', 'Correo electrónico', current?.correo, { mask: 'email' })}
      <div class="full">${fIn('direccion', 'Dirección', current?.direccion, { mask: 'text', len: 100 })}</div>
    </form>`,
    footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="ss">${current ? 'Guardar cambios' : 'Guardar proveedor'}</ion-button>`,
  });
  const form = m.body.querySelector('#sf');
  m.foot.querySelector('#ss').addEventListener('click', async () => {
    if (!validateRequired(form)) return;
    const v = readForm(form);
    const ruc = digits(v.ruc);
    if (ruc && ruc.length !== 11) return setError(form, 'ruc', 'El RUC tiene 11 dígitos');
    const others = suppliers.filter((s) => s.id !== current?.id);
    if (ruc && others.some((s) => s.ruc === ruc)) return setError(form, 'ruc', 'Ya existe un proveedor con este RUC');
    if (others.some((s) => norm(s.nombre) === norm(v.nombre))) return setError(form, 'nombre', 'Ya existe un proveedor con este nombre');
    const data = {
      nombre: String(v.nombre).trim(),
      ruc,
      contacto: String(v.contacto || '').trim(),
      celular: digits(v.celular),
      correo: String(v.correo || '').trim(),
      direccion: String(v.direccion || '').trim(),
    };
    if (current) await db.update('suppliers', current.id, data);
    else await db.insert('suppliers', data);
    m.close();
    toast(current ? 'Proveedor actualizado' : 'Proveedor registrado', 'success');
    onSaved();
  });
}

async function renderFicha(view, id) {
  const { suppliers, products, purchases } = await loadAll('suppliers', 'products', 'purchases');
  const sup = suppliers.find((s) => s.id === id);
  if (!sup) {
    view.innerHTML = `<div class="panel">${emptyState('No encontramos ese proveedor')}<div class="form-actions"><ion-button href="#/proveedores">Volver a proveedores</ion-button></div></div>`;
    return;
  }
  const prods = products.filter((p) => p.proveedorId === id).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const compras = purchases.filter((c) => c.proveedorId === id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const lines = compras.flatMap((c) => c.items.map((it) => ({ c, it })));
  const totalComprado = sum(compras, (c) => c.total);
  const pend = sum(compras.filter((c) => c.estado === 'Pendiente'), (c) => c.total);
  const again = () => renderFicha(view, id);

  view.innerHTML = `
    <p class="crumb"><a href="#/proveedores">Proveedores</a></p>
    ${pageHead(sup.nombre, 'Ficha técnica del proveedor', `<ion-button fill="outline" id="edit">Editar datos</ion-button><ion-button id="buy">Registrar compra</ion-button>`)}
    <div class="kpis">
      <div class="kpi"><div class="label">Productos que vende</div><div class="value">${prods.length}</div></div>
      <div class="kpi"><div class="label">Total comprado</div><div class="value">${money(totalComprado)}</div></div>
      <div class="kpi ${pend ? 'warn' : ''}"><div class="label">Pendiente de pago</div><div class="value">${money(pend)}</div></div>
    </div>
    <section class="panel">
      <h3>Datos del proveedor</h3>
      <dl class="dl dl-wide">
        <dt>RUC</dt><dd>${esc(sup.ruc || '—')}</dd>
        <dt>Contacto</dt><dd>${esc(sup.contacto || '—')}</dd>
        <dt>Celular</dt><dd>${esc(sup.celular || '—')}</dd>
        <dt>Correo</dt><dd>${esc(sup.correo || '—')}</dd>
        <dt>Dirección</dt><dd>${esc(sup.direccion || '—')}</dd>
      </dl>
    </section>
    <section class="panel flush">
      <div class="panel-head"><h2>Productos que vende y su precio</h2><ion-button fill="outline" class="sm" id="add-prod">Agregar producto</ion-button></div>
      <div class="table-wrap">${
        prods.length
          ? `<table class="table"><thead><tr><th>Producto</th><th>Categoría</th><th class="right">Precio de compra</th><th class="right">Stock actual</th></tr></thead><tbody>
          ${prods.map((p) => `<tr><td><strong>${esc(p.nombre)}</strong></td><td>${esc(p.categoria)}</td><td class="right num">${money(p.precioCompra)}</td><td class="right num">${p.stock} ${esc(p.unidad || '')}</td></tr>`).join('')}
          </tbody></table>`
          : emptyState('Sin productos', 'Agrega los productos que te vende para poder registrar compras')
      }</div>
    </section>
    <section class="panel flush">
      <div class="panel-head"><h2>Productos comprados</h2><span class="muted">Más recientes primero</span></div>
      <div class="table-wrap">${
        lines.length
          ? `<table class="table"><thead><tr><th>Fecha</th><th>Comprobante</th><th>Producto</th><th class="right">Cantidad</th><th class="right">Precio unitario</th><th class="right">Total</th><th>Pago</th></tr></thead><tbody>
          ${lines.map(({ c, it }) => `<tr><td class="nowrap">${fmtDate(c.fecha)}</td><td>${esc(c.comprobante || '—')}</td><td>${esc(it.desc)}</td>
            <td class="right num">${it.cantidad}</td><td class="right num">${money(it.precioUnit)}</td><td class="right num">${money(it.subtotal)}</td>
            <td>${c.estado === 'Pagada' ? badge('Pagada', 'ok') : badge('Pendiente', 'warn')}</td></tr>`).join('')}
          </tbody><tfoot><tr><td colspan="5">Total comprado</td><td class="right num">${money(totalComprado)}</td><td></td></tr></tfoot></table>`
          : emptyState('Todavía no hay compras', 'Cuando registres una compra aparecerá aquí con fecha, precio unitario y total')
      }</div>
    </section>
    <div class="row between"><span></span><ion-button fill="outline" class="danger" id="del">${icon('trash')}Eliminar proveedor</ion-button></div>`;

  view.querySelector('#edit').addEventListener('click', () => supplierModal({ suppliers, current: sup, onSaved: again }));
  view.querySelector('#add-prod').addEventListener('click', () => productModal({ sup, onSaved: again }));
  view.querySelector('#buy').addEventListener('click', () => {
    if (!prods.length) return toast('Primero agrega los productos que vende este proveedor.', 'danger');
    purchaseModal({ sup, prods, onSaved: again });
  });
  view.querySelector('#del').addEventListener('click', async () => {
    if (prods.length || compras.length) return toast('No se puede eliminar: tiene productos o compras registradas.', 'danger');
    if (!(await confirmDialog({ header: 'Eliminar proveedor', message: `¿Eliminar a ${sup.nombre}?`, confirmText: 'Eliminar' }))) return;
    await db.remove('suppliers', id);
    location.hash = '#/proveedores';
  });
}

function productModal({ sup, onSaved }) {
  const m = openModal({
    title: `Nuevo producto de ${sup.nombre}`,
    size: 'sm',
    html: `<form class="form-grid" id="pf" novalidate>
      <div class="full">${fIn('nombre', 'Nombre del producto', '', { req: true, mask: 'text', len: 60, minLen: 2 })}</div>
      ${fSel('categoria', 'Categoría', CATEGORIAS_PRODUCTO, CATEGORIAS_PRODUCTO[0], { req: true })}
      ${fIn('unidad', 'Unidad (caja, bolsa, unidad)', 'unidad', { req: true, mask: 'text', len: 20 })}
      ${fIn('precioCompra', 'Precio de compra (S/)', '', { mask: 'money', req: true })}
      ${fIn('precioVenta', 'Precio de venta (S/, 0 si no se vende)', '0', { mask: 'money' })}
    </form>`,
    footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="ps">Guardar producto</ion-button>`,
  });
  const form = m.body.querySelector('#pf');
  m.foot.querySelector('#ps').addEventListener('click', async () => {
    if (!validateRequired(form)) return;
    const v = readForm(form);
    const all = await db.list('products');
    if (all.some((p) => p.proveedorId === sup.id && norm(p.nombre) === norm(v.nombre))) return setError(form, 'nombre', 'Este proveedor ya tiene ese producto');
    await db.insert('products', {
      nombre: String(v.nombre).trim(),
      categoria: v.categoria,
      unidad: String(v.unidad).trim(),
      proveedorId: sup.id,
      precioCompra: num(v.precioCompra),
      precioVenta: num(v.precioVenta),
      stock: 0,
      stockMinimo: 5,
    });
    m.close();
    toast('Producto agregado al catálogo del proveedor', 'success');
    onSaved();
  });
}

function purchaseModal({ sup, prods, onSaved }) {
  const lineHTML = () => `<div class="line" data-line>
    <ion-select class="l-prod" label="Producto" label-placement="stacked" fill="outline" interface="popover" value="${prods[0].id}">
      ${prods.map((p) => `<ion-select-option value="${p.id}">${esc(p.nombre)}</ion-select-option>`).join('')}
    </ion-select>
    <ion-input class="l-qty" label="Cantidad" label-placement="stacked" fill="outline" type="text" inputmode="numeric" data-mask="int" maxlength="5" value="1"></ion-input>
    <ion-input class="l-price" label="Precio unitario" label-placement="stacked" fill="outline" type="text" inputmode="decimal" data-mask="money" maxlength="10" value="${prods[0].precioCompra}"></ion-input>
    <div class="l-total num">${money(prods[0].precioCompra)}</div>
    <ion-button fill="clear" class="sm danger" data-rm>Quitar</ion-button>
  </div>`;

  const m = openModal({
    title: `Registrar compra a ${sup.nombre}`,
    size: 'lg',
    html: `<form id="cf" novalidate>
      <div class="form-grid cols-4">
        ${fIn('fecha', 'Fecha de compra', todayISO(), { type: 'date', stacked: true, req: true, max: todayISO() })}
        ${fIn('comprobante', 'N.º de comprobante', '', { mask: 'text', len: 20 })}
        ${fSel('estado', 'Estado del pago', ['Pagada', 'Pendiente'], 'Pagada', { req: true })}
        <div id="vence-box" hidden>${fIn('vence', 'Vence el pago', '', { type: 'date', stacked: true })}</div>
      </div>
      <h3 class="lines-title">Productos</h3>
      <div id="lines" class="stack"></div>
      <div class="row between lines-foot"><ion-button fill="outline" class="sm" id="add-line">Agregar otra línea</ion-button>
      <div class="lines-sum">Total de la compra <strong class="num" id="grand">${money(0)}</strong></div></div>
    </form>`,
    footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="cs">Registrar compra</ion-button>`,
  });
  const form = m.body.querySelector('#cf');
  const box = m.body.querySelector('#lines');
  const pmap = byId(prods);

  const recalc = () => {
    let total = 0;
    box.querySelectorAll('[data-line]').forEach((ln) => {
      const t = round2(num(ln.querySelector('.l-qty').value) * num(ln.querySelector('.l-price').value));
      ln.querySelector('.l-total').textContent = money(t);
      total += t;
    });
    m.body.querySelector('#grand').textContent = money(total);
  };
  const wire = (ln) => {
    ln.querySelector('.l-prod').addEventListener('ionChange', (e) => {
      ln.querySelector('.l-price').value = pmap.get(e.target.value)?.precioCompra ?? 0;
      recalc();
    });
    ln.querySelector('.l-qty').addEventListener('ionInput', recalc);
    ln.querySelector('.l-price').addEventListener('ionInput', recalc);
    ln.querySelector('[data-rm]').addEventListener('click', () => {
      if (box.children.length > 1) {
        ln.remove();
        recalc();
      }
    });
  };
  const addLine = () => {
    box.insertAdjacentHTML('beforeend', lineHTML());
    wire(box.lastElementChild);
    recalc();
  };
  addLine();
  m.body.querySelector('#add-line').addEventListener('click', addLine);
  form.querySelector('[name=estado]').addEventListener('ionChange', (e) => {
    m.body.querySelector('#vence-box').hidden = e.target.value !== 'Pendiente';
  });

  m.foot.querySelector('#cs').addEventListener('click', async () => {
    if (!validateRequired(form)) return;
    const v = readForm(form);
    const items = [...box.querySelectorAll('[data-line]')].map((ln) => {
      const prod = pmap.get(ln.querySelector('.l-prod').value);
      const cantidad = num(ln.querySelector('.l-qty').value);
      const precioUnit = num(ln.querySelector('.l-price').value);
      return { productoId: prod.id, desc: prod.nombre, cantidad, precioUnit, subtotal: round2(cantidad * precioUnit) };
    });
    if (items.some((i) => i.cantidad <= 0 || i.precioUnit < 0)) return toast('Revisa las cantidades y los precios de cada línea.', 'danger');
    if (v.estado === 'Pendiente' && !v.vence) return setError(form, 'vence', 'Indica hasta cuándo puedes pagar');
    await db.insert('purchases', {
      proveedorId: sup.id,
      fecha: v.fecha,
      comprobante: String(v.comprobante || '').trim(),
      items,
      total: round2(sum(items, (i) => i.subtotal)),
      estado: v.estado,
      vence: v.estado === 'Pendiente' ? v.vence : null,
      fechaPago: v.estado === 'Pagada' ? v.fecha : null,
    });
    for (const it of items) {
      const p = pmap.get(it.productoId);
      const cur = (await db.get('products', p.id)) || p;
      await db.update('products', p.id, { stock: (cur.stock || 0) + it.cantidad, precioCompra: it.precioUnit });
    }
    m.close();
    toast('Compra registrada. El inventario se actualizó.', 'success');
    onSaved();
  });
}
