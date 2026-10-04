// Render SEGURO: solo createElement + textContent (nunca se inserta HTML armado con datos).
export function el(tag, attrs, ...hijos) {
  const n = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = String(v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (v === true) n.setAttribute(k, '');
      else n.setAttribute(k, String(v));
    }
  }
  for (const h of hijos.flat()) {
    if (h === null || h === undefined || h === false) continue;
    n.appendChild(typeof h === 'string' || typeof h === 'number' ? document.createTextNode(String(h)) : h);
  }
  return n;
}
export function vaciar(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }
export function montar(n, ...hijos) { vaciar(n); for (const h of hijos.flat()) if (h) n.appendChild(h); return n; }

// Aviso de backend: muestra el mensaje TAL CUAL lo devolvió el backend y su código (sin reinterpretarlo).
export function avisoBackend(r) {
  const tipo = r.success ? 'ok' : 'error';
  return el('div', { class: 'notice ' + tipo, role: r.success ? 'status' : 'alert', 'data-codigo': r.codigo },
    r.mensaje || (r.success ? 'Operación realizada.' : 'No se pudo completar la solicitud.'),
    el('span', { class: 'code', text: r.codigo }));
}
export function aviso(tipo, texto, codigo) {
  return el('div', { class: 'notice ' + tipo, role: tipo === 'error' ? 'alert' : 'status', 'data-codigo': codigo || null }, texto,
    codigo ? el('span', { class: 'code', text: codigo }) : null);
}

export function toast(texto) {
  const zona = document.getElementById('toasts');
  if (!zona) return;
  const t = el('div', { class: 'toast', role: 'status', text: texto });
  zona.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// Modal simple (sin window.confirm/alert). Devuelve { cerrar, cuerpo }.
export function modal(titulo, contenido) {
  const cuerpo = el('div', { class: 'stack' });
  const caja = el('div', { class: 'card modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo },
    el('div', { class: 'card-head' }, el('h2', { text: titulo }), el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'cerrar-modal', onclick: () => cerrar() }, 'Cerrar')),
    cuerpo);
  const fondo = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === fondo) cerrar(); } }, caja);
  const tecla = (e) => { if (e.key === 'Escape') cerrar(); };
  function cerrar() { fondo.remove(); document.removeEventListener('keydown', tecla); }
  document.addEventListener('keydown', tecla);
  if (contenido) montar(cuerpo, contenido);
  document.body.appendChild(fondo);
  const f = caja.querySelector('input, select, button.btn-primary, button.btn-gold');
  if (f) f.focus();
  return { cerrar, cuerpo };
}

// Confirmación explícita para acciones sensibles. Resuelve true/false.
export function confirmar(titulo, texto, etiqueta) {
  return new Promise((resolve) => {
    let listo = false;
    const fin = (v) => { if (listo) return; listo = true; m.cerrar(); resolve(v); };
    const m = modal(titulo, el('div', { class: 'stack' },
      el('p', { text: texto }),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'btn btn-primary', 'data-accion': 'confirmar', onclick: () => fin(true) }, etiqueta || 'Confirmar'),
        el('button', { type: 'button', class: 'btn btn-ghost', 'data-accion': 'cancelar', onclick: () => fin(false) }, 'Cancelar'))));
    const obs = new MutationObserver(() => { if (!document.body.contains(m.cuerpo)) { obs.disconnect(); fin(false); } });
    obs.observe(document.body, { childList: true });
  });
}

// Bloqueo de doble click: mientras la promesa no termina, el botón queda deshabilitado y un segundo click no hace nada.
export function conBloqueo(boton, fn, textoEnvio) {
  let enCurso = false;
  return async (ev) => {
    if (ev) ev.preventDefault();
    if (enCurso) return;
    enCurso = true;
    const original = boton.textContent;
    boton.disabled = true;
    boton.setAttribute('aria-busy', 'true');
    if (textoEnvio) boton.textContent = textoEnvio;
    try { await fn(); } finally {
      enCurso = false;
      if (boton.isConnected) { boton.disabled = false; boton.removeAttribute('aria-busy'); boton.textContent = original; }
    }
  };
}

const ROL_TXT = { cliente: 'Cliente', repartidor: 'Repartidor', admin: 'Admin General', admin_finanzas: 'Admin Finanzas' };
export const textoRol = (r) => ROL_TXT[r] || String(r);
const PANEL_TXT = { admin_general: 'Admin General', admin_finanzas: 'Admin Finanzas', cliente: 'Cliente', repartidor: 'Repartidor' };
export const textoPanel = (p) => PANEL_TXT[p] || String(p);
export const textoLista = (l) => (l === null || l === undefined || l === '') ? 'Sin definir' : (l === 'minorista' ? 'Minorista' : l === 'mayorista' ? 'Mayorista' : String(l));

// Estado y acceso de un rol, tal como vienen del backend (no se inventan estados).
export function chipsRol(r) {
  const est = r.estado === 'activo' ? el('span', { class: 'chip ok', text: 'Activo' })
    : r.estado === 'inactivo' ? el('span', { class: 'chip off', text: 'Inactivo' })
    : el('span', { class: 'chip', text: r.estado ? String(r.estado) : 'Sin estado' });
  const acc = r.acceso_habilitado === true ? el('span', { class: 'chip gold', text: 'Acceso habilitado' })
    : el('span', { class: 'chip warn', text: 'Acceso deshabilitado' });
  return [est, acc];
}
