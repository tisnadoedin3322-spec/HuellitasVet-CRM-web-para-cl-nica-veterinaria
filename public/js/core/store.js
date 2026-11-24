import { uid } from './utils.js';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { createSupabaseAdapter } from './supabase.js';

export const COLLECTIONS = [
  'owners',
  'pets',
  'services',
  'suppliers',
  'products',
  'purchases',
  'sales',
  'cajas',
  'cajaMovs',
  'expenses',
  'staff',
  'interacciones',
  'oportunidades',
  'encuestas',
  'reclamos',
  'settings',
];

// El prefijo conserva el nombre anterior a propósito: cambiarlo dejaría sin datos a quien ya los tiene guardados
const PREFIX = 'vetara:v1:';
const cache = {};

function table(col) {
  if (!cache[col]) {
    try {
      cache[col] = JSON.parse(localStorage.getItem(PREFIX + col) || '[]');
    } catch {
      cache[col] = [];
    }
  }
  return cache[col];
}

function persist(col) {
  localStorage.setItem(PREFIX + col, JSON.stringify(cache[col]));
}

const copy = (x) => (x === undefined ? undefined : structuredClone(x));

const localAdapter = {
  async list(col) {
    return copy(table(col));
  },
  async get(col, id) {
    return copy(table(col).find((r) => r.id === id)) ?? null;
  },
  async buscar(col, filtros = {}) {
    return copy(table(col).filter((r) => Object.entries(filtros).every(([k, v]) => r[k] === v)));
  },
  async insert(col, rec) {
    const row = { id: uid(), createdAt: new Date().toISOString(), ...rec };
    table(col).push(row);
    persist(col);
    return copy(row);
  },
  async update(col, id, patch) {
    const row = table(col).find((r) => r.id === id);
    if (!row) throw new Error(`No existe el registro ${id} en ${col}`);
    Object.assign(row, patch, { updatedAt: new Date().toISOString() });
    persist(col);
    return copy(row);
  },
  async remove(col, id) {
    const rows = table(col);
    const i = rows.findIndex((r) => r.id === id);
    if (i >= 0) rows.splice(i, 1);
    persist(col);
  },
  async clearAll() {
    for (const col of COLLECTIONS) {
      localStorage.removeItem(PREFIX + col);
      delete cache[col];
    }
    localStorage.removeItem(PREFIX + 'seeded');
  },
  // Respaldo: todas las colecciones en un solo objeto, y la operación inversa
  async exportAll() {
    return Object.fromEntries(COLLECTIONS.map((col) => [col, copy(table(col))]));
  },
  async importAll(datos) {
    const antes = await localAdapter.exportAll();
    const escribir = (d) => {
      for (const col of COLLECTIONS) {
        cache[col] = Array.isArray(d[col]) ? d[col] : [];
        persist(col);
      }
    };
    try {
      escribir(datos);
    } catch (err) {
      escribir(antes); // si no cabe en el navegador, se deja todo como estaba
      throw err;
    }
    localStorage.setItem(PREFIX + 'seeded', '1');
  },
  isSeeded() {
    return localStorage.getItem(PREFIX + 'seeded') === '1';
  },
  markSeeded() {
    localStorage.setItem(PREFIX + 'seeded', '1');
  },
};

// Con la URL y la clave de config.js la app usa Supabase; sin ellas, guarda en este navegador
export const enNube = Boolean(SUPABASE_URL && SUPABASE_KEY);
export const db = enNube ? createSupabaseAdapter(SUPABASE_URL, SUPABASE_KEY) : localAdapter;

// Base en memoria: la carga de datos de ejemplo arma todo aquí y luego lo guarda de una sola vez (db.importAll)
export function memoriaDb() {
  const data = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
  return {
    data,
    async insert(col, rec) {
      const row = { id: uid(), createdAt: new Date().toISOString(), ...rec };
      data[col].push(row);
      return copy(row);
    },
    async update(col, id, patch) {
      const row = data[col].find((r) => r.id === id);
      Object.assign(row, patch, { updatedAt: new Date().toISOString() });
      return copy(row);
    },
  };
}

export async function loadAll(...cols) {
  const names = cols.length ? cols : COLLECTIONS;
  const data = await Promise.all(names.map((c) => db.list(c)));
  return Object.fromEntries(names.map((c, i) => [c, data[i]]));
}

export const byId = (rows) => new Map(rows.map((r) => [r.id, r]));
