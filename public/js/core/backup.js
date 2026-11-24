import { db, COLLECTIONS } from './store.js';
import { fmtDate, todayISO } from './utils.js';
import { openModal, confirmDialog, toast, icon } from './ui.js';

// Un archivo vale si lo creó esta app y trae colecciones conocidas en forma de lista.
// La marca interna sigue siendo 'vetara' (el nombre anterior) para que los respaldos ya descargados sigan sirviendo.
function leer(texto) {
  const d = JSON.parse(texto);
  const cols = COLLECTIONS.filter((c) => d?.datos?.[c] !== undefined);
  if (d?.app !== 'vetara' || !cols.length || cols.some((c) => !Array.isArray(d.datos[c]))) throw new Error('formato');
  return d;
}

export function openBackupModal() {
  const m = openModal({
    title: 'Respaldo de datos',
    size: 'sm',
    html: `<p class="muted">Guarda una copia de todos los datos de la clínica en un archivo, úsala antes de borrar el historial del navegador o para pasar todo a otra computadora</p>
      <input type="file" id="bk-file" accept=".json,application/json" hidden>`,
    footer: `<ion-button fill="outline" id="bk-up">${icon('upload')}Restaurar desde un archivo</ion-button>
      <ion-button id="bk-down">${icon('download')}Descargar respaldo</ion-button>`,
  });

  m.foot.querySelector('#bk-down').addEventListener('click', async () => {
    const contenido = { app: 'vetara', version: 1, fecha: new Date().toISOString(), datos: await db.exportAll() };
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([JSON.stringify(contenido)], { type: 'application/json' })),
      download: `huellitasvet-respaldo-${todayISO()}.json`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Respaldo descargado', 'success');
  });

  const file = m.body.querySelector('#bk-file');
  m.foot.querySelector('#bk-up').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    let d;
    try {
      d = leer(await f.text());
    } catch {
      return toast('Ese archivo no es un respaldo de HuellitasVet.', 'danger');
    }
    const ok = await confirmDialog({
      header: 'Restaurar respaldo',
      message: `Se reemplazarán TODOS los datos actuales por los del respaldo${d.fecha ? ' del ' + fmtDate(d.fecha.slice(0, 10)) : ''}. Esta acción no se puede deshacer.`,
      confirmText: 'Restaurar',
    });
    if (!ok) return;
    try {
      await db.importAll(d.datos);
    } catch {
      return toast('No se pudo restaurar: el archivo es demasiado grande para este navegador.', 'danger');
    }
    m.close();
    toast('Datos restaurados', 'success');
    setTimeout(() => location.reload(), 900);
  });
}
