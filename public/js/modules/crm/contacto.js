import { db } from '../../core/store.js';
import { esc, waLink, mailLink } from '../../core/utils.js';
import { openModal, toast, badge, icon } from '../../core/ui.js';
import { criticalTags } from '../../core/domain.js';

export const primerNombre = (o) => String(o?.nombre || '').split(/\s+/)[0] || '';

export async function logInteraccion({ petId, ownerId, canal, nota }) {
  return db.insert('interacciones', { petId: petId || null, ownerId, canal, nota, fecha: new Date().toISOString() });
}

export function tagsHTML(pet, owner) {
  const tags = criticalTags(pet, owner);
  return tags.length
    ? `<div class="banner bad"><strong>Antes de contactar:</strong> ${tags.map((t) => badge(t, 'bad')).join(' ')}</div>`
    : '';
}

export function openContactModal({ pet, owner, asunto, mensaje, nota, onSent }) {
  const m = openModal({
    title: `Contactar a ${owner.nombre}`,
    size: 'sm',
    html: `
      ${tagsHTML(pet, owner)}
      <p class="muted contact-who">Mascota: <strong>${esc(pet?.nombre || '—')}</strong> · Celular: ${esc(owner.celular)}${owner.correo ? ` · ${esc(owner.correo)}` : ''}</p>
      <ion-textarea id="msg" label="Mensaje" label-placement="stacked" fill="outline" auto-grow="true" rows="5" maxlength="800" value="${esc(mensaje)}"></ion-textarea>`,
    footer: `<ion-button fill="outline" data-close>Cancelar</ion-button>
      <ion-button fill="outline" id="mail" ${owner.correo ? '' : 'disabled'}>${icon('mail')}Enviar por correo</ion-button>
      <ion-button id="wa">${icon('whatsapp')}Abrir WhatsApp</ion-button>`,
  });
  const send = async (canal) => {
    const text = String(m.body.querySelector('#msg').value || '').trim();
    if (!text) return toast('Escribe un mensaje antes de enviar.', 'danger');
    const url = canal === 'WhatsApp' ? waLink(owner.celular, text) : mailLink(owner.correo, asunto, text);
    window.open(url, '_blank', 'noopener');
    await logInteraccion({ petId: pet?.id, ownerId: owner.id, canal, nota: nota || asunto });
    m.close();
    toast(`Contacto por ${canal} registrado en la bitácora`, 'success');
    onSent?.(canal);
  };
  m.foot.querySelector('#wa').addEventListener('click', () => send('WhatsApp'));
  m.foot.querySelector('#mail').addEventListener('click', () => send('Correo'));
}
