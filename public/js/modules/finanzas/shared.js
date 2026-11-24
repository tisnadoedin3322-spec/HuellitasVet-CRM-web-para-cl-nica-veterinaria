import { db } from '../../core/store.js';
import { sum } from '../../core/utils.js';
import { METODOS, DIGITALES } from '../../core/domain.js';

export async function openCaja() {
  const cajas = await db.list('cajas');
  return cajas.find((c) => c.estado === 'Abierta') || null;
}

export function resumenCaja(caja, sales, movs) {
  const pagos = sales.flatMap((s) => (s.pagos || []).filter((p) => p.cajaId === caja.id));
  const porMetodo = Object.fromEntries(METODOS.map((m) => [m, sum(pagos.filter((p) => p.metodo === m), (p) => p.monto)]));
  const propios = movs.filter((m) => m.cajaId === caja.id);
  const ingresos = sum(propios.filter((m) => m.tipo === 'Ingreso'), (m) => m.monto);
  const salidas = sum(propios.filter((m) => m.tipo === 'Salida'), (m) => m.monto);
  return {
    porMetodo,
    cobros: sum(pagos, (p) => p.monto),
    ingresos,
    salidas,
    movs: propios,
    esperadoEfectivo: caja.montoInicial + porMetodo['Efectivo'] + ingresos - salidas,
    esperadoDigital: sum(DIGITALES, (m) => porMetodo[m]),
  };
}

export const horaLocal = () => new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
