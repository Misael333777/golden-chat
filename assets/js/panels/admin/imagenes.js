// Imágenes de Golden (logo y productos): UN solo mecanismo para los dos.
// El usuario elige un archivo (PNG, JPG o WebP, hasta 2 MB) → ve la vista previa → al guardar, la Web API lo sube a Drive PROD
// (archivo PRIVADO, sin enlace público) y devuelve la referencia que se guarda en logo_url / imagen_url. Nunca se pide ni se pega una URL.
// Para mostrar una imagen guardada, la Web API la devuelve en base64 (ver_imagen) y se dibuja como data: (la CSP de la página no cambia).
import { el, montar } from '../../ui.js';

const TIPO = 'admin_general';
const FORMATOS = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_BYTES = 2 * 1024 * 1024;
export const DRIVE_RE = /^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{20,80})\/view$/;
const cache = new Map(); // url -> data: (solo en memoria de la pestaña)

// Dibuja en 'caja' la imagen guardada en 'url'. Devuelve true si se pudo mostrar.
export async function mostrarImagen(ctx, url, caja, alt) {
  if (!url) { montar(caja, el('span', { class: 'img-vacia', text: 'Sin imagen' })); return false; }
  if (!DRIVE_RE.test(url)) { montar(caja, el('span', { class: 'img-vacia', text: 'Imagen cargada antes por dirección web (no se muestra acá).' })); return false; }
  if (cache.has(url)) { montar(caja, el('img', { class: 'img-prev', src: cache.get(url), alt: alt || '' })); return true; }
  montar(caja, el('span', { class: 'img-vacia', text: 'Cargando imagen…' }));
  const res = await ctx.pedir(TIPO, 'ver_imagen', { imagen_url: url });
  if (!caja.isConnected) return false;
  if (res.r && ctx.revisarFinSesion(res.r)) return false;
  const d = res.r && res.r.success ? res.r.datos || {} : null;
  if (!d || !FORMATOS.includes(d.tipo_mime) || typeof d.contenido_base64 !== 'string') { montar(caja, el('span', { class: 'img-vacia', text: 'No se pudo mostrar la imagen.' })); return false; }
  const src = 'data:' + d.tipo_mime + ';base64,' + d.contenido_base64;
  cache.set(url, src);
  montar(caja, el('img', { class: 'img-prev', src, alt: alt || '' }));
  return true;
}

// Selector "Elegir imagen" con vista previa. resolver() sube la imagen nueva (si hay) y devuelve la referencia final:
//   { url: string|null, cambio: boolean } o { error: 'texto' }.
export function selectorImagen(ctx, { id, actual, destino, etiqueta }) {
  const caja = el('div', { class: 'img-caja', id: id + '-prev' });
  const aviso = el('p', { class: 'small img-aviso', id: id + '-aviso', role: 'status' });
  const input = el('input', { type: 'file', id: id + '-archivo', accept: FORMATOS.join(','), class: 'sr-only' });
  const bElegir = el('label', { class: 'btn btn-ghost btn-sm', for: id + '-archivo', id: id + '-elegir' }, actual ? 'Cambiar imagen' : 'Elegir imagen');
  const bQuitar = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: id + '-quitar', hidden: !actual }, 'Quitar imagen');
  let nuevo = null; let quitar = false;
  mostrarImagen(ctx, actual, caja, etiqueta);
  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    aviso.textContent = '';
    if (!f) return;
    if (!FORMATOS.includes(f.type)) { input.value = ''; aviso.textContent = 'Elegí una imagen PNG, JPG o WebP.'; return; }
    if (f.size > MAX_BYTES) { input.value = ''; aviso.textContent = 'La imagen pesa más de 2 MB. Elegí una más liviana.'; return; }
    const lector = new FileReader();
    lector.onload = () => {
      const dataUrl = String(lector.result || '');
      const coma = dataUrl.indexOf(',');
      nuevo = { tipo_mime: f.type, contenido_base64: dataUrl.slice(coma + 1) };
      quitar = false;
      montar(caja, el('img', { class: 'img-prev', src: dataUrl, alt: etiqueta || '' }));
      aviso.textContent = 'Vista previa. Se guarda al tocar "Guardar".';
      bElegir.textContent = 'Cambiar imagen'; bQuitar.hidden = false;
    };
    lector.onerror = () => { aviso.textContent = 'No se pudo leer el archivo.'; };
    lector.readAsDataURL(f);
  });
  bQuitar.addEventListener('click', () => {
    nuevo = null; quitar = true; input.value = '';
    montar(caja, el('span', { class: 'img-vacia', text: 'Sin imagen' }));
    aviso.textContent = 'La imagen se quita al tocar "Guardar".';
    bElegir.textContent = 'Elegir imagen'; bQuitar.hidden = true;
  });
  const nodo = el('div', { class: 'img-selector', id }, caja, el('div', { class: 'row' }, bElegir, bQuitar), input, aviso,
    el('p', { class: 'muted small', text: 'PNG, JPG o WebP, hasta 2 MB.' }));
  async function resolver() {
    if (quitar) return { url: null, cambio: !!actual };
    if (!nuevo) return { url: actual || null, cambio: false };
    const res = await ctx.pedir(TIPO, 'subir_imagen', { destino_imagen: destino, tipo_mime: nuevo.tipo_mime, contenido_base64: nuevo.contenido_base64 });
    if (res.falla) return { error: 'No pudimos subir la imagen. Revisá la conexión y reintentá.' };
    if (ctx.revisarFinSesion(res.r)) return { error: 'La sesión terminó.' };
    if (!res.r.success || !res.r.datos || !DRIVE_RE.test(res.r.datos.imagen_url || '')) return { error: res.r.mensaje || 'No se pudo subir la imagen.' };
    const url = res.r.datos.imagen_url;
    cache.set(url, 'data:' + nuevo.tipo_mime + ';base64,' + nuevo.contenido_base64);
    nuevo = null; actual = url; // un reintento de guardado no vuelve a subir el mismo archivo
    return { url, cambio: true };
  }
  return { nodo, resolver };
}
