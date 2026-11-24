import './core/ui.js'; // activa el filtro de caracteres (data-mask), igual que en el resto de la app
import { db, enNube } from './core/store.js';
import { CANAL_QR } from './core/domain.js';

const form = document.getElementById('form');
const listo = document.getElementById('listo');
const intro = document.querySelector('.rc-sub');
const boton = document.getElementById('enviar');
const errorGeneral = document.getElementById('error');
const campo = (n) => form.elements[n];

// Sin la nube no hay dónde guardar lo que llene el celular
if (!enNube) {
  form.hidden = true;
  document.getElementById('sin-nube').hidden = false;
}

// "luna  PEREZ" -> "Luna Perez": sin esto, "luna" y "Luna" se guardarían como mascotas distintas
const capitalizar = (s) =>
  s.trim().toLocaleLowerCase('es').replace(/(^|[\s'’.\-])(\p{L})/gu, (_, antes, letra) => antes + letra.toLocaleUpperCase('es'));
const entre = (v, min, max) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max;

// Cada regla devuelve el mensaje de error, o '' si el campo está bien
const REGLAS = {
  ownerNombre: (v) => (/\p{L}.*\p{L}/u.test(v) ? '' : 'Escribe tu nombre completo'),
  celular: (v) => (/^9\d{8}$/.test(v) ? '' : 'Ingresa un celular de 9 dígitos que empiece con 9'),
  correo: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Revisa el formato del correo'),
  mascota: (v) => (/\p{L}.*\p{L}/u.test(v) ? '' : 'Escribe el nombre de tu mascota'),
  especie: (v) => (v ? '' : 'Elige la especie'),
  sexo: (v) => (v ? '' : 'Elige el sexo'),
  raza: (v) => (/\p{L}.*\p{L}/u.test(v) ? '' : 'Escribe la raza, si no la sabes pon Mestizo'),
  edadAnios: (v) => (entre(v, 0, 30) ? '' : 'Ingresa la edad en años, de 0 a 30'),
  edadMeses: (v) => (!v || entre(v, 0, 11) ? '' : 'Los meses van de 0 a 11'),
};

function marcar(nombre, mensaje) {
  const p = form.querySelector(`[data-err="${nombre}"]`);
  if (p) p.textContent = mensaje;
  const el = campo(nombre);
  if (!el || el.type === 'checkbox') return;
  if (mensaje) el.setAttribute('aria-invalid', 'true');
  else el.removeAttribute('aria-invalid');
}

function revisar() {
  let primero = null;
  for (const [n, regla] of Object.entries(REGLAS)) {
    const msg = regla(campo(n).value.trim());
    marcar(n, msg);
    if (msg && !primero) primero = campo(n);
  }
  const sinAceptar = !campo('acepto').checked;
  marcar('acepto', sinAceptar ? 'Necesitamos tu autorización para guardar tus datos' : '');
  if (sinAceptar && !primero) primero = campo('acepto');
  primero?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  primero?.focus({ preventScroll: true });
  return !primero;
}

// Al escribir o cambiar un campo se le quita el error que tenía
form.addEventListener('input', (e) => e.target.name && marcar(e.target.name, ''));
form.addEventListener('change', (e) => e.target.name && marcar(e.target.name, ''));

async function registrar(d) {
  // Si el celular ya está en la clínica se usa ese propietario, sin tocar sus datos
  let [dueno] = await db.buscar('owners', { celular: d.celular }, 'id');
  if (dueno) {
    const repetida = await db.buscar('pets', { ownerId: dueno.id, nombre: d.mascota }, 'id');
    if (repetida.length) throw Object.assign(new Error('Esa mascota ya está registrada con este celular, si algo cambió avísale a recepción'), { amable: true });
  } else {
    try {
      dueno = await db.insert('owners', { nombre: d.ownerNombre, celular: d.celular, correo: d.correo, direccion: '', observaciones: '', conflictivo: false });
    } catch (err) {
      if (err.code !== '23505') throw err;
      [dueno] = await db.buscar('owners', { celular: d.celular }, 'id'); // alguien lo registró justo antes
    }
  }
  const mascota = await db.insert('pets', {
    ownerId: dueno.id,
    nombre: d.mascota,
    especie: d.especie,
    raza: d.raza,
    sexo: d.sexo,
    edadAnios: d.edadAnios,
    edadMeses: d.edadMeses,
    foto: '',
    antecedentes: {},
    observaciones: '',
    agresiva: false,
    calificacion: null,
  });
  // La nota deja rastro en la bitácora y marca la mascota como "Nuevo por QR"; si falla, el registro ya quedó guardado
  await db
    .insert('interacciones', { ownerId: dueno.id, petId: mascota.id, canal: CANAL_QR, nota: 'Se registró desde el formulario del código QR', fecha: new Date().toISOString() })
    .catch(() => {});
  return mascota;
}

function mostrarListo(nombre, celular) {
  const b = document.createElement('strong');
  b.textContent = nombre; // textContent: lo que escribió la persona nunca se interpreta como HTML
  document.getElementById('listo-texto').replaceChildren('Registramos a ', b, ` en HuellitasVet, te escribiremos al ${celular} cuando haga falta`);
  form.hidden = true;
  intro.hidden = true;
  listo.hidden = false;
  scrollTo({ top: 0, behavior: 'smooth' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorGeneral.textContent = '';
  if (campo('web').value) return mostrarListo('tu mascota', campo('celular').value); // un robot llenó la trampa: parece que funcionó, no se guarda nada
  if (!revisar()) return;

  const d = {
    ownerNombre: capitalizar(campo('ownerNombre').value),
    celular: campo('celular').value.trim(),
    correo: campo('correo').value.trim(),
    mascota: capitalizar(campo('mascota').value),
    especie: campo('especie').value,
    sexo: campo('sexo').value,
    raza: capitalizar(campo('raza').value),
    edadAnios: Number(campo('edadAnios').value),
    edadMeses: Number(campo('edadMeses').value || 0),
  };
  boton.disabled = true;
  boton.textContent = 'Guardando…';
  try {
    const mascota = await registrar(d);
    mostrarListo(mascota.nombre, d.celular);
  } catch (err) {
    console.error(err);
    // Los avisos técnicos (clave, tablas, conexión) son para quien administra la app, no para el cliente
    errorGeneral.textContent = err.amable ? err.message : 'No pudimos guardar tu registro, revisa tu internet e intenta de nuevo en un momento';
  } finally {
    boton.disabled = false;
    boton.textContent = 'Registrar';
  }
});

// Para registrar a otra mascota se conservan los datos del propietario y se limpia lo de la mascota
document.getElementById('otra').addEventListener('click', () => {
  for (const n of ['mascota', 'especie', 'sexo', 'raza', 'edadAnios', 'edadMeses']) {
    campo(n).value = '';
    marcar(n, '');
  }
  errorGeneral.textContent = '';
  listo.hidden = true;
  intro.hidden = false;
  form.hidden = false;
  campo('mascota').focus();
});
