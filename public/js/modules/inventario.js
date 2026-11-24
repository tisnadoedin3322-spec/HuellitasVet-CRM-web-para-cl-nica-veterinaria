import { db, loadAll, byId } from '../core/store.js';
import { esc, norm, money, fmtDate, filterSimilar, debounce, num } from '../core/utils.js';
import { fIn, fSel, readForm, validateRequired, setError, toast, openModal, badge, emptyState, pageHead } from '../core/ui.js';
import { CATEGORIAS_PRODUCTO } from '../core/domain.js';

export async function render(view) {
  const { products, suppliers, purchases } = await loadAll('products', 'suppliers', 'purchases');
  const supMap = byId(suppliers);
  let selected = products[0]?.id || null;
  let q = '';
  let filtro = 'todos';
  let cat = '';

  view.innerHTML = `
    ${pageHead('Inventario', 'Los productos que compras a tus proveedores, elige uno para ver cuántas unidades quedan y quién te lo vende', `<ion-button id="new">Nuevo producto</ion-button>`)}
    <div class="toolbar">
      <ion-searchbar class="grow" id="q" placeholder="Buscar por nombre del producto" debounce="0" autocomplete="off"></ion-searchbar>
      <ion-select id="cat" interface="popover" placeholder="Todas las categorías" aria-label="Categoría" fill="outline" value="">
        <ion-select-option value="">Todas las categorías</ion-select-option>
        ${CATEGORIAS_PRODUCTO.map((c) => `<ion-select-option value="${c}">${c}</ion-select-option>`).join('')}
      </ion-select>
      <ion-segment id="flt" value="todos" style="max-width:280px">
        <ion-segment-button value="todos"><ion-label>Todos</ion-label></ion-segment-button>
        <ion-segment-button value="bajo"><ion-label>Stock bajo</ion-label></ion-segment-button>
      </ion-segment>
    </div>
    <div class="grid grid-side">
      <div class="panel flush"><div class="table-wrap" id="tbl"></div></div>
      <aside class="panel detail" id="detail"></aside>
    </div>`;

  const tbl = view.querySelector('#tbl');
  const detail = view.querySelector('#detail');

  const stockBadge = (p) =>
    p.stock <= 0 ? badge('Agotado', 'bad') : p.stock <= p.stockMinimo ? badge('Stock bajo', 'warn') : '';

  const paintDetail = () => {
    const p = products.find((x) => x.id === selected);
    if (!p) {
      detail.innerHTML = emptyState('Selecciona un producto', 'Verás la cantidad disponible y el proveedor');
      return;
    }
    const sup = supMap.get(p.proveedorId);
    const ingresos = purchases
      .flatMap((c) => c.items.filter((it) => it.productoId === p.id).map((it) => ({ fecha: c.fecha, ...it })))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 4);
    detail.innerHTML = `
      <h2>${esc(p.nombre)}</h2>
      <p class="muted">${esc(p.categoria)}</p>
      <div class="stock-big ${p.stock <= p.stockMinimo ? 'low' : ''}">
        <div class="label">Cantidad disponible</div>
        <div class="value num">${p.stock}<span> ${esc(p.unidad || '')}</span></div>
        <div>${stockBadge(p) || badge('Stock suficiente', 'ok')}</div>
      </div>
      <dl class="dl dl-tight">
        <dt>Proveedor</dt><dd>${sup ? `<a href="#/proveedores/${sup.id}">${esc(sup.nombre)}</a>` : '—'}</dd>
        <dt>Precio de compra</dt><dd class="num">${money(p.precioCompra)}</dd>
        <dt>Precio de venta</dt><dd class="num">${p.precioVenta ? money(p.precioVenta) : 'No se vende'}</dd>
        <dt>Stock mínimo</dt><dd class="num">${p.stockMinimo}</dd>
      </dl>
      <h3 class="detail-sub">Últimos ingresos</h3>
      ${
        ingresos.length
          ? `<table class="table compact"><tbody>${ingresos.map((i) => `<tr><td>${fmtDate(i.fecha)}</td><td class="right num">${i.cantidad} u.</td><td class="right num">${money(i.precioUnit)}</td></tr>`).join('')}</tbody></table>`
          : '<p class="muted">Todavía no hay compras de este producto</p>'
      }
      <div class="row detail-actions">
        <ion-button fill="outline" class="sm" id="edit">Editar</ion-button>
        <ion-button fill="outline" class="sm" id="adjust">Ajustar stock</ion-button>
      </div>`;
    detail.querySelector('#edit').addEventListener('click', () => productModal({ current: p, suppliers, products, onSaved: () => render(view) }));
    detail.querySelector('#adjust').addEventListener('click', () => adjustModal({ p, onSaved: () => render(view) }));
  };

  const paint = () => {
    let list = products.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (cat) list = list.filter((p) => p.categoria === cat);
    if (filtro === 'bajo') list = list.filter((p) => p.stock <= p.stockMinimo);
    list = filterSimilar(list, q, (p) => p.nombre);
    if (!list.length) {
      tbl.innerHTML = emptyState('No hay productos', q ? `Ningún producto se parece a “${q}”` : 'Prueba con otro filtro');
      return;
    }
    tbl.innerHTML = `<table class="table"><thead><tr><th>Producto</th><th>Proveedor</th><th class="right">Disponible</th><th class="right">Precio de venta</th></tr></thead><tbody>
      ${list
        .map(
          (p) => `<tr class="row-link ${p.id === selected ? 'row-active' : ''}" data-id="${p.id}" tabindex="0">
        <td><strong>${esc(p.nombre)}</strong><div class="faint">${esc(p.categoria)}</div></td>
        <td>${esc(supMap.get(p.proveedorId)?.nombre || '—')}</td>
        <td class="right num">${p.stock} ${stockBadge(p)}</td>
        <td class="right num">${p.precioVenta ? money(p.precioVenta) : '<span class="faint">—</span>'}</td></tr>`,
        )
        .join('')}</tbody></table>`;
    tbl.querySelectorAll('tr.row-link').forEach((tr) => {
      const pick = () => {
        selected = tr.dataset.id;
        paint();
        paintDetail();
      };
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', (e) => e.key === 'Enter' && pick());
    });
  };

  view.querySelector('#q').addEventListener('ionInput', debounce((e) => { q = e.target.value || ''; paint(); }, 120));
  view.querySelector('#cat').addEventListener('ionChange', (e) => { cat = e.detail.value || ''; paint(); });
  view.querySelector('#flt').addEventListener('ionChange', (e) => { filtro = e.detail.value; paint(); });
  view.querySelector('#new').addEventListener('click', () => productModal({ suppliers, products, onSaved: () => render(view) }));
  paint();
  paintDetail();
}

function productModal({ current = null, suppliers, products, onSaved }) {
  if (!suppliers.length) return toast('Primero registra un proveedor.', 'danger');
  const m = openModal({
    title: current ? 'Editar producto' : 'Nuevo producto',
    size: 'sm',
    html: `<form class="form-grid" id="pf" novalidate>
      <div class="full">${fIn('nombre', 'Nombre del producto', current?.nombre, { req: true, mask: 'text', len: 60, minLen: 2 })}</div>
      ${fSel('categoria', 'Categoría', CATEGORIAS_PRODUCTO, current?.categoria || CATEGORIAS_PRODUCTO[0], { req: true })}
      ${fIn('unidad', 'Unidad', current?.unidad || 'unidad', { req: true, mask: 'text', len: 20 })}
      <div class="full">${fSel('proveedorId', 'Proveedor', suppliers.map((s) => [s.id, s.nombre]), current?.proveedorId || suppliers[0].id, { req: true })}</div>
      ${fIn('precioCompra', 'Precio de compra (S/)', current?.precioCompra ?? '', { mask: 'money', req: true })}
      ${fIn('precioVenta', 'Precio de venta (S/)', current?.precioVenta ?? 0, { mask: 'money' })}
      ${current ? '' : fIn('stock', 'Stock inicial', 0, { mask: 'int' })}
      ${fIn('stockMinimo', 'Stock mínimo', current?.stockMinimo ?? 5, { mask: 'int' })}
    </form>`,
    footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="ps">${current ? 'Guardar cambios' : 'Guardar producto'}</ion-button>`,
  });
  const form = m.body.querySelector('#pf');
  m.foot.querySelector('#ps').addEventListener('click', async () => {
    if (!validateRequired(form)) return;
    const v = readForm(form);
    if (products.some((p) => p.id !== current?.id && p.proveedorId === v.proveedorId && norm(p.nombre) === norm(v.nombre))) {
      return setError(form, 'nombre', 'Ese proveedor ya tiene un producto con este nombre');
    }
    const data = {
      nombre: String(v.nombre).trim(),
      categoria: v.categoria,
      unidad: String(v.unidad).trim(),
      proveedorId: v.proveedorId,
      precioCompra: num(v.precioCompra),
      precioVenta: num(v.precioVenta),
      stockMinimo: num(v.stockMinimo),
    };
    if (current) await db.update('products', current.id, data);
    else await db.insert('products', { ...data, stock: num(v.stock) });
    m.close();
    toast(current ? 'Producto actualizado' : 'Producto agregado', 'success');
    onSaved();
  });
}

function adjustModal({ p, onSaved }) {
  const m = openModal({
    title: `Ajustar stock de ${p.nombre}`,
    size: 'sm',
    html: `<p class="muted adjust-help">Escribe la cantidad real que contaste en almacén, hoy el sistema indica ${p.stock}</p>
      <form id="af" novalidate>${fIn('stock', 'Cantidad real', p.stock, { mask: 'int', req: true })}</form>`,
    footer: `<ion-button fill="outline" data-close>Cancelar</ion-button><ion-button id="as">Guardar cantidad</ion-button>`,
  });
  const form = m.body.querySelector('#af');
  m.foot.querySelector('#as').addEventListener('click', async () => {
    if (!validateRequired(form)) return;
    const n = num(readForm(form).stock);
    if (n < 0) return setError(form, 'stock', 'La cantidad no puede ser negativa');
    await db.update('products', p.id, { stock: n });
    m.close();
    toast('Stock actualizado', 'success');
    onSaved();
  });
}
