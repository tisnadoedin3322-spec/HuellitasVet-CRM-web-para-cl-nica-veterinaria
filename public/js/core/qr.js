import qrcode from '../vendor/qrcode.js';
import { enNube } from './store.js';
import { openModal, toast, icon } from './ui.js';
import { esc } from './utils.js';

const ARCHIVO = 'huellitasvet-registro-qr.png';
const TINTA = '#0a2c36'; 


export const urlRegistro = () => `${location.origin}/registro-cliente.html`;


function dibujar(url, px) {
  const qr = qrcode(0, 'M');
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const margen = 4;
  const celda = Math.max(1, Math.floor(px / (n + margen * 2)));
  const lado = celda * (n + margen * 2);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = lado;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, lado, lado);
  g.fillStyle = TINTA;
  for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) if (qr.isDark(f, c)) g.fillRect((c + margen) * celda, (f + margen) * celda, celda, celda);
  return canvas;
}

function descargar(canvas) {
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = ARCHIVO;
  document.body.append(a);
  a.click();
  a.remove();
}

async function copiar(url, input, aviso = 'Enlace copiado') {
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    // Sin permiso del portapapeles (por ejemplo con http): se selecciona el texto para copiarlo a mano
    input.select();
    if (!document.execCommand?.('copy')) return toast('Selecciona el enlace y cópialo', 'danger');
  }
  toast(aviso, 'success');
}

async function compartir(url, canvas, input) {
  const datos = { title: 'Registro en HuellitasVet', text: `Registra a tu mascota en HuellitasVet: ${url}` };
  try {
    const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
    const file = new File([blob], ARCHIVO, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) return await navigator.share({ ...datos, files: [file] });
    if (navigator.share) return await navigator.share({ ...datos, url });
  } catch (err) {
    if (err?.name === 'AbortError') return; // cerró el panel de compartir
  }
  copiar(url, input, 'Este navegador no puede compartir, el enlace quedó copiado');
}

export function abrirQr() {
  const url = urlRegistro();
  const canvas = dibujar(url, 1024);
  const enMiPc = ['localhost', '127.0.0.1'].includes(location.hostname);
  const m = openModal({
    title: 'Registro de clientes por QR',
    size: 'sm',
    html: `<div class="qr-big">
      <img src="${canvas.toDataURL('image/png')}" alt="Código QR para registrarse en la clínica" width="280" height="280">
      <div class="qr-acciones">
        <ion-button fill="outline" id="qr-copy">${icon('link')}Copiar enlace</ion-button>
        <ion-button fill="outline" id="qr-down">${icon('download')}Descargar</ion-button>
        <ion-button id="qr-share">${icon('share')}Compartir</ion-button>
      </div>
      <p class="muted">Tu cliente apunta la cámara del celular al código y llena su registro, la mascota aparece sola en Clientes</p>
      <input class="qr-link" readonly value="${esc(url)}" aria-label="Enlace del registro" onfocus="this.select()">
      ${enMiPc ? '<div class="banner warn">Estás en tu computadora (localhost), el celular no puede abrir este enlace. Entra al CRM desde la dirección publicada en Render y el QR funcionará en cualquier celular</div>' : ''}
    </div>`,
  });
  const input = m.body.querySelector('.qr-link');
  m.body.querySelector('#qr-copy').addEventListener('click', () => copiar(url, input));
  m.body.querySelector('#qr-down').addEventListener('click', () => descargar(canvas));
  m.body.querySelector('#qr-share').addEventListener('click', () => compartir(url, canvas, input));
}


export function iniciarQr() {
  const dock = document.getElementById('qr-dock');
  const btn = document.getElementById('qr-btn');
  const cuerpo = document.querySelector('.sidebar-body');
  if (!enNube || !dock || !btn || !cuerpo) return; // sin la nube, el celular no tiene dónde guardar el registro

  dock.querySelector('img').src = dibujar(urlRegistro(), 400).toDataURL('image/png');
  dock.querySelectorAll('[data-qr-open]').forEach((b) => b.addEventListener('click', abrirQr));
  btn.addEventListener('click', abrirQr);

  const colocar = () => {
    let cabe = false;
    btn.hidden = true; // se mide el menú sin el botón, para no depender de lo que se muestre
    if (matchMedia('(min-width: 992px)').matches) {
      dock.hidden = false;
      dock.style.top = `${cuerpo.getBoundingClientRect().bottom + 16}px`;
      cabe = dock.getBoundingClientRect().bottom + 16 <= innerHeight;
    }
    dock.hidden = !cabe;
    btn.hidden = cabe;
  };
  new ResizeObserver(colocar).observe(cuerpo);
  addEventListener('resize', colocar);
  colocar();
}
