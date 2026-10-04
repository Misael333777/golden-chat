// Selector de panel. Admin General, Admin Finanzas, Cliente y Repartidor tienen contenido en la página.
import { el, montar, textoPanel } from '../ui.js';

const ORDEN = ['admin_general', 'admin_finanzas', 'cliente', 'repartidor'];

export function vistaSelector(ctx, sesion) {
  const d = sesion.datos();
  const paneles = ORDEN.filter(p => d.paneles.includes(p)).concat(d.paneles.filter(p => !ORDEN.includes(p)));
  const tarjetas = paneles.map(p => {
    const DESTINO = { admin_general: '#/admin/inicio', admin_finanzas: '#/finanzas/inicio', cliente: '#/cliente/inicio', repartidor: '#/repartidor/inicio' };
    const activo = !!DESTINO[p];
    return el('button', { type: 'button', class: 'card panel-card', disabled: !activo, 'data-panel': p,
      onclick: activo ? () => { sesion.elegirPanel(p); ctx.ir(DESTINO[p]); } : null },
      el('h2', { text: textoPanel(p) }),
      el('p', { class: 'muted', text: activo ? 'Entrar al panel.' : 'Todavía no disponible.' }));
  });
  montar(ctx.app, el('div', { class: 'stack' },
    el('h1', { text: 'Elegí un panel' }),
    paneles.length ? el('div', { class: 'panel-grid' }, tarjetas)
      : el('div', { class: 'card' }, el('p', { class: 'muted', text: 'Tu sesión no tiene paneles habilitados.' })),
    null));
}
