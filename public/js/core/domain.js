import { db } from './store.js';
import { diffDays, todayISO, ageYears, sum, groupBy } from './utils.js';

export const SERVICIOS = [
  { tipo: 'Consulta general', precio: 60, intervalo: null, categoria: 'Consultas y diagnóstico', seguimiento: true },
  { tipo: 'Control', precio: 45, intervalo: 30, categoria: 'Consultas y diagnóstico', seguimiento: true },
  { tipo: 'Análisis de laboratorio', precio: 120, intervalo: null, categoria: 'Consultas y diagnóstico' },
  { tipo: 'Ecografía', precio: 150, intervalo: null, categoria: 'Consultas y diagnóstico' },
  { tipo: 'Vacunación', precio: 85, intervalo: 365, categoria: 'Medicina preventiva' },
  { tipo: 'Desparasitación', precio: 40, intervalo: 90, categoria: 'Medicina preventiva' },
  { tipo: 'Baño y corte', precio: 70, intervalo: 30, categoria: 'Estética y baños' },
  { tipo: 'Cirugía', precio: 450, intervalo: null, categoria: 'Cirugía y hospitalización', seguimiento: true },
  { tipo: 'Hospitalización', precio: 180, intervalo: null, categoria: 'Cirugía y hospitalización', seguimiento: true },
  { tipo: 'Profilaxis dental', precio: 220, intervalo: 365, categoria: 'Cirugía y hospitalización', seguimiento: true },
];

export const servicioDe = (tipo) => SERVICIOS.find((s) => s.tipo === tipo);

export const CATEGORIAS_PRODUCTO = ['Medicamentos', 'Alimento', 'Higiene', 'Accesorios', 'Insumos'];
export const categoriaVentaProducto = (cat) => (cat === 'Medicamentos' ? 'Farmacia' : 'Pet shop');

export const METODOS = ['Efectivo', 'Tarjeta POS', 'Transferencia', 'Yape/Plin'];
export const DIGITALES = ['Tarjeta POS', 'Transferencia', 'Yape/Plin'];
export const ESTADOS_PIPELINE = ['Cotizado', 'En seguimiento', 'Agendado', 'Perdido'];
export const CATEGORIAS_EGRESO = ['Alquiler', 'Servicios básicos', 'Planilla', 'Insumos veterinarios', 'Otros'];

export const VIP_GASTO = 3000;
export const VIP_VISITAS = 16;

const DEFAULT_SETTINGS = {
  id: 'main',
  clinica: 'HuellitasVet',
  googleReviewUrl: 'https://g.page/r/huellitasvet/review',
};

// Valores del nombre anterior: si quedaron guardados en el navegador, se reemplazan por los nuevos
const ANTERIORES = { clinica: 'Vetara Veterinaria', googleReviewUrl: 'https://g.page/r/vetara-veterinaria/review' };

export async function getSettings() {
  const s = await db.get('settings', 'main');
  const cfg = { ...DEFAULT_SETTINGS, ...(s || {}) };
  for (const k of Object.keys(ANTERIORES)) if (cfg[k] === ANTERIORES[k]) cfg[k] = DEFAULT_SETTINGS[k];
  return cfg;
}

export async function saveSettings(patch) {
  const current = await db.get('settings', 'main');
  if (current) return db.update('settings', 'main', patch);
  return db.insert('settings', { ...DEFAULT_SETTINGS, ...patch });
}

export const criticalTags = (pet, owner) => {
  const tags = [];
  if (pet?.agresiva) tags.push('Mascota agresiva');
  if (owner?.conflictivo) tags.push('Propietario conflictivo');
  return tags;
};

export function ageGroup(pet) {
  const y = ageYears(pet);
  if (y < 1) return 'Cachorros';
  if (y >= 8) return 'Geriátricos';
  return 'Adultos';
}

export const whenText = (d) => {
  if (d < 0) return `venció hace ${-d} ${-d === 1 ? 'día' : 'días'}`;
  if (d === 0) return 'vence hoy';
  return `vence en ${d} ${d === 1 ? 'día' : 'días'}`;
};

export function computeAlerts({ pets, owners, services }, today = todayISO()) {
  const latest = new Map();
  for (const s of services) {
    const k = s.petId + '|' + s.tipo;
    const c = latest.get(k);
    if (!c || s.fecha > c.fecha || (s.fecha === c.fecha && (s.createdAt || '') > (c.createdAt || ''))) latest.set(k, s);
  }
  const petMap = new Map(pets.map((p) => [p.id, p]));
  const ownerMap = new Map(owners.map((o) => [o.id, o]));
  const out = [];
  for (const s of latest.values()) {
    if (!s.proximaFecha) continue;
    const pet = petMap.get(s.petId);
    if (!pet) continue;
    out.push({ service: s, pet, owner: ownerMap.get(pet.ownerId), dias: diffDays(s.proximaFecha, today) });
  }
  return out.sort((a, b) => a.dias - b.dias);
}

export function ownerStats({ owners, pets, services }) {
  const petOwner = new Map(pets.map((p) => [p.id, p.ownerId]));
  const stats = new Map(owners.map((o) => [o.id, { gasto: 0, visitas: 0, ultima: null, mascotas: 0 }]));
  for (const p of pets) stats.get(p.ownerId) && stats.get(p.ownerId).mascotas++;
  const visits = new Map();
  for (const s of services) {
    const oid = petOwner.get(s.petId);
    const st = stats.get(oid);
    if (!st) continue;
    st.gasto += Number(s.monto) || 0;
    if (!st.ultima || s.fecha > st.ultima) st.ultima = s.fecha;
    if (!visits.has(oid)) visits.set(oid, new Set());
    visits.get(oid).add(s.petId + s.fecha);
  }
  for (const [oid, set] of visits) stats.get(oid).visitas = set.size;
  return stats;
}

export function petStats({ pets, services }) {
  const g = groupBy(services, (s) => s.petId);
  return new Map(
    pets.map((p) => {
      const list = (g.get(p.id) || []).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
      return [
        p.id,
        {
          servicios: list,
          visitas: new Set(list.map((s) => s.fecha)).size,
          ultima: list[0]?.fecha || null,
          tipos: new Set(list.map((s) => s.tipo)),
        },
      ];
    }),
  );
}

export const pagadoVenta = (sale) => sum(sale.pagos || [], (p) => p.monto);
export const saldoVenta = (sale) => Math.max(0, Math.round((sale.total - pagadoVenta(sale)) * 100) / 100);

export function debtByOwner(sales, today = todayISO()) {
  const m = new Map();
  for (const s of sales) {
    const saldo = saldoVenta(s);
    if (saldo <= 0 || !s.ownerId) continue;
    const d = m.get(s.ownerId) || { total: 0, vencida: 0 };
    d.total += saldo;
    if (s.fechaVence && s.fechaVence < today) d.vencida += saldo;
    m.set(s.ownerId, d);
  }
  return m;
}

export const COMPROBANTES = {
  'Ticket interno': { prefijo: 'T001', ancho: 6 },
  Boleta: { prefijo: 'B001', ancho: 8 },
  Factura: { prefijo: 'F001', ancho: 8 },
};

export function nextCorrelativo(sales, tipo) {
  const cfg = COMPROBANTES[tipo];
  const n = sales.filter((s) => s.comprobanteTipo === tipo).length + 1;
  return `${cfg.prefijo}-${String(n).padStart(cfg.ancho, '0')}`;
}

export const fechaPago = (compraOGasto) => compraOGasto.fechaPago || compraOGasto.fecha;
