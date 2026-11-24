import { loadAll } from '../../core/store.js';
import { esc, money, todayISO, addDays, addMonths, parseISO, monthName, sum, groupBy, round2 } from '../../core/utils.js';
import { badge, emptyState } from '../../core/ui.js';

const mondayOf = (iso) => addDays(iso, -((parseISO(iso).getDay() + 6) % 7));
const short = (iso) => parseISO(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });

function periodos(modo, today) {
  if (modo === 'dia') return Array.from({ length: 14 }, (_, i) => addDays(today, -(13 - i))).map((k) => ({ key: k, label: short(k) }));
  if (modo === 'semana') {
    const m0 = mondayOf(today);
    return Array.from({ length: 8 }, (_, i) => addDays(m0, -7 * (7 - i))).map((k) => ({ key: k, label: `Sem. ${short(k)}` }));
  }
  const first = today.slice(0, 8) + '01';
  return Array.from({ length: 6 }, (_, i) => addMonths(first, -(5 - i))).map((k) => ({ key: k.slice(0, 7), label: monthName(k) }));
}
const keyOf = (modo, iso) => (modo === 'dia' ? iso : modo === 'semana' ? mondayOf(iso) : iso.slice(0, 7));

function chart(rows) {
  const W = 820, H = 280, L = 56, R = 12, T = 12, B = 34;
  const max = Math.max(1, ...rows.flatMap((r) => [r.ingresos, r.egresos]));
  const step = 10 ** Math.floor(Math.log10(max));
  const top = Math.ceil(max / step) * step;
  const iw = W - L - R, ih = H - T - B;
  const gw = iw / rows.length;
  const bw = Math.min(26, gw / 2.6);
  const y = (v) => T + ih - (v / top) * ih;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * top);
  return `<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Ingresos y egresos por período">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#e5eaee"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" font-size="12" fill="#4a5a68">${t >= 1000 ? Math.round(t / 100) / 10 + 'k' : Math.round(t)}</text>`).join('')}
    ${rows.map((r, i) => {
      const cx = L + gw * i + gw / 2;
      return `<g class="col" data-i="${i}"><rect class="hit" x="${L + gw * i}" y="${T}" width="${gw}" height="${H - T}" rx="6"/>
        <rect x="${cx - bw - 1}" y="${y(r.ingresos)}" width="${bw}" height="${T + ih - y(r.ingresos)}" rx="3" fill="#0f3f4c"/>
        <rect x="${cx + 1}" y="${y(r.egresos)}" width="${bw}" height="${T + ih - y(r.egresos)}" rx="3" fill="#e3a72f"/>
        <text x="${cx}" y="${H - 12}" text-anchor="middle" font-size="12" fill="#4a5a68">${esc(r.label)}</text></g>`;
    }).join('')}
  </svg><div class="chart-tip" hidden></div></div>`;
}

// Un solo tooltip que sigue al mouse y muestra los montos de la columna (período) sobre la que está
function hoverMontos(wrap, rows) {
  const tip = wrap.querySelector('.chart-tip');
  const show = (e) => {
    const r = rows[e.target.closest('.col')?.dataset.i];
    tip.hidden = !r;
    if (!r) return;
    tip.innerHTML = `<strong>${esc(r.label)}</strong>
      <span><i style="background:#0f3f4c"></i>Ingresos ${money(r.ingresos)}</span>
      <span><i style="background:#e3a72f"></i>Egresos ${money(r.egresos)}</span>
      <span class="tip-res">Resultado ${money(r.ingresos - r.egresos)}</span>`;
    const b = wrap.getBoundingClientRect();
    tip.style.left = Math.max(0, Math.min(e.clientX - b.left + 14, b.width - tip.offsetWidth)) + 'px';
    tip.style.top = Math.max(0, e.clientY - b.top - tip.offsetHeight - 10) + 'px';
  };
  ['pointermove', 'pointerdown'].forEach((t) => wrap.addEventListener(t, show));
  wrap.addEventListener('pointerleave', () => (tip.hidden = true));
}

export async function render(root) {
  const data = await loadAll('sales', 'expenses', 'purchases', 'cajaMovs');
  const today = todayISO();
  let modo = 'dia';
  let dias = '90';

  const pagos = data.sales.flatMap((s) => (s.pagos || []).map((p) => ({ fecha: p.fecha, monto: p.monto })));
  const egresos = [
    ...data.expenses.filter((e) => e.estado === 'Pagado').map((e) => ({ fecha: e.fechaPago || e.fecha, monto: e.monto })),
    ...data.purchases.filter((c) => c.estado === 'Pagada').map((c) => ({ fecha: c.fechaPago || c.fecha, monto: c.total })),
    ...data.cajaMovs.filter((m) => m.tipo === 'Salida').map((m) => ({ fecha: m.fecha, monto: m.monto })),
  ];

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><div><h2>Flujo de caja</h2><p class="muted">Lo que entró por cobros frente a lo que salió por gastos, compras pagadas y caja chica</p></div>
        <ion-segment id="modo" value="dia" style="min-width:300px"><ion-segment-button value="dia"><ion-label>Por día</ion-label></ion-segment-button>
        <ion-segment-button value="semana"><ion-label>Por semana</ion-label></ion-segment-button><ion-segment-button value="mes"><ion-label>Por mes</ion-label></ion-segment-button></ion-segment></div>
      <div id="flujo"></div>
    </section>
    <section class="panel flush">
      <div class="panel-head"><div><h2>Rentabilidad por categoría</h2><p class="muted">Ingresos menos el costo de productos y las comisiones del personal</p></div>
        <ion-select id="per" interface="popover" aria-label="Período" fill="outline" value="90" style="max-width:220px">
          <ion-select-option value="30">Últimos 30 días</ion-select-option><ion-select-option value="90">Últimos 90 días</ion-select-option><ion-select-option value="365">Último año</ion-select-option></ion-select></div>
      <div class="table-wrap" id="rent"></div>
    </section>`;

  const paintFlujo = () => {
    const per = periodos(modo, today);
    const rows = per.map((p) => ({
      ...p,
      ingresos: round2(sum(pagos.filter((x) => keyOf(modo, x.fecha) === p.key), (x) => x.monto)),
      egresos: round2(sum(egresos.filter((x) => keyOf(modo, x.fecha) === p.key), (x) => x.monto)),
    }));
    const ti = sum(rows, (r) => r.ingresos), te = sum(rows, (r) => r.egresos);
    root.querySelector('#flujo').innerHTML = `
      <div class="kpis kpis-tight">
        <div class="kpi good"><div class="label">Ingresos del período</div><div class="value">${money(ti)}</div></div>
        <div class="kpi warn"><div class="label">Egresos del período</div><div class="value">${money(te)}</div></div>
        <div class="kpi ${ti - te < 0 ? 'bad' : ''}"><div class="label">Resultado</div><div class="value">${money(ti - te)}</div></div>
      </div>
      <div class="legend"><span><i style="background:#0f3f4c"></i>Ingresos</span><span><i style="background:#e3a72f"></i>Egresos</span></div>
      ${chart(rows)}
      <div class="table-wrap"><table class="table compact"><thead><tr><th>Período</th><th class="right">Ingresos</th><th class="right">Egresos</th><th class="right">Resultado</th></tr></thead><tbody>
      ${rows.slice().reverse().map((r) => `<tr><td>${esc(r.label)}</td><td class="right num">${money(r.ingresos)}</td><td class="right num">${money(r.egresos)}</td><td class="right num">${money(r.ingresos - r.egresos)}</td></tr>`).join('')}</tbody></table></div>`;
    hoverMontos(root.querySelector('.chart-wrap'), rows);
  };

  const paintRent = () => {
    const desde = addDays(today, -Number(dias));
    const items = data.sales.filter((s) => s.fecha >= desde).flatMap((s) => s.items);
    const grupos = [...groupBy(items, (i) => i.categoria || 'Otros')].map(([cat, list]) => {
      const ing = sum(list, (i) => i.subtotal), cos = sum(list, (i) => i.costo);
      return { cat, ing, cos, mar: ing - cos, pct: ing ? ((ing - cos) / ing) * 100 : 0 };
    }).sort((a, b) => b.mar - a.mar);
    root.querySelector('#rent').innerHTML = grupos.length
      ? `<table class="table"><thead><tr><th>Categoría</th><th class="right">Ingresos</th><th class="right">Costos</th><th class="right">Margen</th><th class="right">% de margen</th></tr></thead><tbody>
        ${grupos.map((g, i) => `<tr><td><strong>${esc(g.cat)}</strong> ${i === 0 ? badge('Mayor margen', 'ok') : ''}</td><td class="right num">${money(g.ing)}</td><td class="right num">${money(g.cos)}</td>
          <td class="right num"><strong>${money(g.mar)}</strong></td><td class="right num">${g.pct.toFixed(1)}%</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="right num">${money(sum(grupos, (g) => g.ing))}</td><td class="right num">${money(sum(grupos, (g) => g.cos))}</td><td class="right num">${money(sum(grupos, (g) => g.mar))}</td><td></td></tr></tfoot></table>`
      : emptyState('Sin ventas en este período');
  };

  root.querySelector('#modo').addEventListener('ionChange', (e) => { modo = e.detail.value; paintFlujo(); });
  root.querySelector('#per').addEventListener('ionChange', (e) => { dias = e.detail.value; paintRent(); });
  paintFlujo();
  paintRent();
}
