
import { uid } from './utils.js';

const snake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const q = (v) => encodeURIComponent(v);


const SIN_UPDATED = new Set(['staff', 'services', 'suppliers', 'cajaMovs', 'interacciones']);
const SIN_CREATED = new Set(['settings']);
const BOOLEANOS = new Set(['agresiva', 'conflictivo', 'cobrado']); // columnas verdadero/falso


const ORDEN = ['owners', 'staff', 'suppliers', 'settings', 'pets', 'products', 'purchases', 'sales', 'cajas', 'cajaMovs', 'services', 'expenses', 'interacciones', 'oportunidades', 'encuestas', 'reclamos'];


function aFila(col, rec) {
  const fila = {};
  for (const [k, v] of Object.entries(rec)) {
    if (v === undefined) continue;
    const c = snake(k);
    if (c === 'updated_at' && SIN_UPDATED.has(col)) continue;
    if (c === 'created_at' && SIN_CREATED.has(col)) continue;
    fila[c] = c === 'ruc' && v === '' ? null : v; // el RUC es único: varios vacíos chocarían
    if (BOOLEANOS.has(c)) fila[c] = v === true || v === 'on'; // datos viejos guardaron "" u "on" en las casillas
  }
  return fila;
}
const aRec = (fila) => Object.fromEntries(Object.entries(fila).map(([k, v]) => [camel(k), v]));

export function createSupabaseAdapter(url, key) {
  // Acepta la Project URL (https://xxxx.supabase.co) y también la de la sección Data API (que termina en /rest/v1)
  const base = String(url).trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '') + '/rest/v1/';
  const memo = new Map(); // guarda unos segundos cada lista para no pedirla a la nube en cada pantalla
  const TTL = 2500;

  async function fail(res) {
    let b = {};
    try {
      b = await res.json();
    } catch {}
    const code = b.code || '';
    let msg;
    if (res.status === 401 || res.status === 403 || code === '42501') msg = 'Supabase no deja entrar: revisa la clave en config.js y que ejecutaste el SQL que da acceso a las tablas (supabase/acceso-abierto.sql)';
    else if (res.status === 404 || code === 'PGRST205' || code === '42P01') msg = 'Falta una tabla en Supabase: ejecuta supabase/schema.sql en el SQL Editor';
    else if (code === '23505') msg = 'Ya existe un registro con ese dato (duplicado)';
    else if (code === '23503') msg = 'Este registro está relacionado con otros y no se puede guardar ni borrar';
    else msg = b.message || `Supabase respondió con error ${res.status}`;
    return Object.assign(new Error(msg), { code, status: res.status });
  }

  async function http(method, path, { body, prefer } = {}) {
    const headers = { apikey: key, 'Content-Type': 'application/json' };
    if (!String(key).startsWith('sb_')) headers.Authorization = `Bearer ${key}`; 
    if (prefer) headers.Prefer = prefer;
    let res;
    try {
      res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new Error('No hay conexión con Supabase: revisa tu internet y la URL de config.js');
    }
    if (!res.ok) throw await fail(res);
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }

  const vaciar = async () => {
    for (const col of [...ORDEN].reverse()) await http('DELETE', `${snake(col)}?id=not.is.null`);
    memo.clear();
  };

  const adapter = {
    async list(col) {
      const hit = memo.get(col);
      if (hit && Date.now() - hit.t < TTL) return structuredClone(hit.rows);
      const rows = (await http('GET', `${snake(col)}?select=*`)).map(aRec);
      memo.set(col, { t: Date.now(), rows });
      return structuredClone(rows);
    },
    async get(col, id) {
      const r = await http('GET', `${snake(col)}?id=eq.${q(id)}&select=*`);
      return r[0] ? aRec(r[0]) : null;
    },
    // Filas que cumplen todos los filtros (campo = valor), trayendo solo los campos pedidos
    async buscar(col, filtros = {}, campos = '*') {
      const cols = campos === '*' ? '*' : campos.split(',').map((c) => snake(c.trim())).join(',');
      const f = Object.entries(filtros).map(([k, v]) => `&${snake(k)}=eq.${q(v)}`).join('');
      return (await http('GET', `${snake(col)}?select=${cols}${f}`)).map(aRec);
    },
    async insert(col, rec) {
      const fila = aFila(col, { id: uid(), createdAt: new Date().toISOString(), ...rec });
      const r = await http('POST', snake(col), { body: fila, prefer: 'return=representation,missing=default' });
      memo.delete(col);
      return aRec(r[0]);
    },
    async update(col, id, patch) {
      const r = await http('PATCH', `${snake(col)}?id=eq.${q(id)}`, {
        body: aFila(col, { ...patch, updatedAt: new Date().toISOString() }),
        prefer: 'return=representation',
      });
      memo.delete(col);
      if (!r.length) throw new Error(`No existe el registro ${id} en ${col}`);
      return aRec(r[0]);
    },
    async remove(col, id) {
      await http('DELETE', `${snake(col)}?id=eq.${q(id)}`);
      memo.clear(); 
    },
    clearAll: vaciar,
    async exportAll() {
      memo.clear();
      return Object.fromEntries(await Promise.all(ORDEN.map(async (c) => [c, await adapter.list(c)])));
    },

    async importAll(datos) {
      const antes = await adapter.exportAll();
      const escribir = async (d) => {
        await vaciar();
        for (const col of ORDEN) {
          const filas = (Array.isArray(d[col]) ? d[col] : []).map((r) => aFila(col, r));
          for (let i = 0; i < filas.length; i += 100) {
            await http('POST', snake(col), { body: filas.slice(i, i + 100), prefer: 'return=minimal,missing=default' });
          }
        }
        memo.clear();
      };
      try {
        await escribir(datos);
      } catch (err) {
        await escribir(antes).catch(() => {}); 
        throw err;
      }
    },

    async isSeeded() {
      return (await http('GET', 'owners?select=id&limit=1')).length > 0;
    },
    markSeeded() {},
  };
  return adapter;
}
