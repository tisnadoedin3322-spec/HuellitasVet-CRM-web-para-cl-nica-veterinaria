import { db, loadAll } from '../core/store.js';
import { esc, norm, digits, num, debounce, resizeImage } from '../core/utils.js';
import { fIn, fSel, fArea, fCheck, readForm, validateRequired, setError, toast, pageHead, avatar, revealOnScroll } from '../core/ui.js';

const ESPECIES = ['Perro', 'Gato', 'Conejo', 'Ave', 'Otro'];

const secHead = (n, title, sub) =>
  `<header class="reg-card-head"><span class="reg-step" aria-hidden="true">${n}</span>
    <div><h2>${title}</h2><p class="muted">${sub}</p></div></header>`;

export async function render(view, { parts }) {
  const editId = parts[0];
  const { pets, owners } = await loadAll('pets', 'owners');
  const pet = editId ? pets.find((p) => p.id === editId) : null;
  const owner = pet ? owners.find((o) => o.id === pet.ownerId) : null;
  const a = pet?.antecedentes || {};
  let foto = pet?.foto || '';
  const placeholder = `<span class="avatar lg avatar-empty" role="img" aria-label="Sin foto">
    <svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-4.5-4.5a1.5 1.5 0 0 0-2.1 0L6 20"/>
    </svg></span>`;

  view.innerHTML = `
    <div class="reg-wrap">
    ${pageHead(
      pet ? `Editar a ${pet.nombre}` : 'Registro de mascota',
      pet ? 'Actualiza los datos de la mascota y de su propietario' : 'Completa los datos de la mascota y de su propietario, si ya existe lo unimos a su ficha sin duplicarlo',
    )}
    <form id="form" class="reg-form" novalidate>
      <section class="panel form-section reg-card">
        ${secHead(1, 'Mascota', 'Datos básicos para identificarla en la clínica')}
        <div class="reg-foto">
          <div id="foto-prev">${foto ? avatar({ nombre: pet?.nombre, foto }, 'lg') : placeholder}</div>
          <div class="stack">
            <div class="muted">Foto de la mascota (opcional)</div>
            <div class="row">
              <ion-button fill="outline" id="foto-btn">Subir foto</ion-button>
              <ion-button fill="clear" id="foto-del" ${foto ? '' : 'hidden'}>Quitar</ion-button>
            </div>
            <input type="file" id="foto-file" accept="image/*" hidden>
          </div>
        </div>
        <div class="form-grid cols-3">
          ${fIn('nombre', 'Nombre de la mascota', pet?.nombre, { req: true, mask: 'name', len: 40, minLen: 2 })}
          ${fSel('especie', 'Especie', ESPECIES, pet?.especie || 'Perro', { req: true })}
          ${fIn('raza', 'Raza', pet?.raza, { req: true, mask: 'name', len: 40, minLen: 2 })}
          ${fSel('sexo', 'Sexo', ['Macho', 'Hembra'], pet?.sexo || '', { req: true })}
          ${fIn('edadAnios', 'Edad (años)', pet?.edadAnios ?? '', { mask: 'int', req: true, len: 2, min: 0, max: 30 })}
          ${fIn('edadMeses', 'Meses adicionales', pet?.edadMeses ?? '', { mask: 'int', len: 2, min: 0, max: 11 })}
        </div>
      </section>

      <section class="panel form-section reg-card">
        ${secHead(2, 'Propietario', 'Contacto para recordatorios, cobros y seguimiento')}
        <div id="owner-note"></div>
        <div class="form-grid">
          ${fIn('celular', 'Celular', owner?.celular, { req: true, mask: 'phone' })}
          ${fIn('ownerNombre', 'Nombre completo del propietario', owner?.nombre, { req: true, mask: 'name', len: 60, minLen: 2 })}
          ${fIn('correo', 'Correo electrónico', owner?.correo, { mask: 'email' })}
          ${fIn('direccion', 'Dirección', owner?.direccion, { mask: 'text', len: 100 })}
        </div>
      </section>

      <section class="panel form-section reg-card">
        ${secHead(3, 'Antecedentes', 'Enfermedades, tratamientos, vacunas y accidentes anteriores')}
        <div class="form-grid">
          ${fArea('enfermedades', 'Enfermedades anteriores', a.enfermedades)}
          ${fArea('tratamientos', 'Tratamientos recibidos', a.tratamientos)}
          ${fArea('vacunaciones', 'Vacunaciones', a.vacunaciones)}
          ${fArea('accidentes', 'Accidentes', a.accidentes)}
        </div>
      </section>

      <section class="panel form-section reg-card">
        ${secHead(4, 'Observaciones', 'Avisos para el personal, se muestran antes de cada contacto')}
        <div class="form-grid">
          <div class="stack reg-note">
            ${fArea('observaciones', 'Sobre la mascota (por ejemplo, si es agresiva)', pet?.observaciones)}
            ${fCheck('agresiva', 'Marcar como mascota agresiva', !!pet?.agresiva)}
          </div>
          <div class="stack reg-note">
            ${fArea('ownerObs', 'Sobre el propietario (por ejemplo, si es conflictivo)', owner?.observaciones)}
            ${fCheck('conflictivo', 'Marcar como propietario conflictivo', !!owner?.conflictivo)}
          </div>
        </div>
      </section>

      <div class="form-actions">
        <ion-button fill="outline" href="#/${pet ? 'clientes/' + pet.id : 'clientes'}">Cancelar</ion-button>
        <ion-button id="save">${pet ? 'Guardar cambios' : 'Registrar mascota'}</ion-button>
      </div>
    </form>
    </div>`;
  revealOnScroll(view, '.reg-wrap .page-head, .reg-card, .reg-form .form-actions');

  const form = view.querySelector('#form');
  const file = view.querySelector('#foto-file');
  const prev = view.querySelector('#foto-prev');
  const delBtn = view.querySelector('#foto-del');
  const paintFoto = () => {
    prev.innerHTML = foto ? avatar({ nombre: 'Mascota', foto }, 'lg') : placeholder;
    delBtn.hidden = !foto;
  };
  view.querySelector('#foto-btn').addEventListener('click', () => file.click());
  delBtn.addEventListener('click', () => {
    foto = '';
    paintFoto();
  });
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try {
      foto = await resizeImage(file.files[0]);
      paintFoto();
    } catch {
      toast('No se pudo leer la imagen. Prueba con otra.', 'danger');
    }
  });

  const note = view.querySelector('#owner-note');
  const celEl = form.querySelector('[name=celular]');
  const fillFrom = (o) => {
    form.querySelector('[name=ownerNombre]').value = o.nombre;
    form.querySelector('[name=correo]').value = o.correo || '';
    form.querySelector('[name=direccion]').value = o.direccion || '';
    form.querySelector('[name=ownerObs]').value = o.observaciones || '';
    form.querySelector('[name=conflictivo]').checked = !!o.conflictivo;
  };
  celEl.addEventListener(
    'ionInput',
    debounce(() => {
      const d = digits(celEl.value);
      if (d.length !== 9) return (note.innerHTML = '');
      const found = owners.find((o) => digits(o.celular) === d && o.id !== owner?.id);
      if (found) {
        fillFrom(found);
        const n = pets.filter((p) => p.ownerId === found.id).length;
        note.innerHTML = `<div class="banner info"><strong>${esc(found.nombre)}</strong> ya está registrado con este celular y tiene ${n} ${n === 1 ? 'mascota' : 'mascotas'}. Esta mascota se añadirá a su ficha.</div>`;
      } else note.innerHTML = '';
    }, 200),
  );

  view.querySelector('#save').addEventListener('click', async () => {
    if (!validateRequired(form)) return;
    const v = readForm(form);
    const cel = digits(v.celular);
    if (!/^9\d{8}$/.test(cel)) return setError(form, 'celular', 'Ingresa un celular de 9 dígitos que empiece con 9');
    if (v.correo && !/^\S+@\S+\.\S+$/.test(String(v.correo).trim())) return setError(form, 'correo', 'Revisa el formato del correo');
    const years = num(v.edadAnios);
    const months = num(v.edadMeses);
    if (years < 0 || years > 30) return setError(form, 'edadAnios', 'La edad debe estar entre 0 y 30 años');
    if (months < 0 || months > 11) return setError(form, 'edadMeses', 'Los meses deben estar entre 0 y 11');

    const sameCel = owners.find((o) => digits(o.celular) === cel);
    if (pet && sameCel && sameCel.id !== pet.ownerId) {
      return setError(form, 'celular', `Este celular ya pertenece a ${sameCel.nombre}`);
    }
    const ownerId = pet ? pet.ownerId : sameCel?.id;
    const duplicated = pets.some((p) => p.ownerId === ownerId && norm(p.nombre) === norm(v.nombre) && p.id !== pet?.id);
    if (ownerId && duplicated) return setError(form, 'nombre', 'Este propietario ya tiene una mascota con ese nombre');

    const ownerData = {
      nombre: String(v.ownerNombre).trim(),
      celular: cel,
      correo: String(v.correo || '').trim(),
      direccion: String(v.direccion || '').trim(),
      observaciones: String(v.ownerObs || '').trim(),
      conflictivo: v.conflictivo,
    };
    const petData = {
      nombre: String(v.nombre).trim(),
      especie: v.especie,
      raza: String(v.raza).trim(),
      sexo: v.sexo,
      edadAnios: years,
      edadMeses: months,
      foto,
      antecedentes: {
        enfermedades: String(v.enfermedades || '').trim(),
        tratamientos: String(v.tratamientos || '').trim(),
        vacunaciones: String(v.vacunaciones || '').trim(),
        accidentes: String(v.accidentes || '').trim(),
      },
      observaciones: String(v.observaciones || '').trim(),
      agresiva: v.agresiva,
    };

    try {
      let saved;
      if (pet) {
        await db.update('owners', ownerId, ownerData);
        saved = await db.update('pets', pet.id, petData);
      } else {
        const oid = ownerId ? (await db.update('owners', ownerId, ownerData)).id : (await db.insert('owners', ownerData)).id;
        saved = await db.insert('pets', { ...petData, ownerId: oid, calificacion: null });
      }
      toast(pet ? 'Cambios guardados' : `${saved.nombre} fue registrada`, 'success');
      location.hash = `#/clientes/${saved.id}`;
    } catch (err) {
      toast('No se pudo guardar: ' + err.message, 'danger');
    }
  });
}
