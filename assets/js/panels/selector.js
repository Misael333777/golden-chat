// Selector de panel. Admin General, Admin Finanzas, Cliente y Repartidor tienen contenido en la página.
// Diseño de la maqueta aprobada: misma lógica (elegir panel → ir a su inicio), tarjetas con ícono y descripción.
import { el, montar, textoPanel } from '../ui.js';
import { icono } from './cliente/iconos.js';
import { disparar } from '../marco.js';

const ORDEN = ['admin_general', 'admin_finanzas', 'cliente', 'repartidor'];
const DESTINO = { admin_general: '#/admin/inicio', admin_finanzas: '#/finanzas/inicio', cliente: '#/cliente/inicio', repartidor: '#/repartidor/inicio' };
const INFO = {
  admin_general: { ico: 'ajustes', txt: 'Personas, catálogo, pedidos y producción.' },
  admin_finanzas: { ico: 'banco', txt: 'Cobros, gastos, cuentas y revisiones.' },
  cliente: { ico: 'pedido', txt: 'Tus pedidos, tu habitual y tu cuenta.' },
  repartidor: { ico: 'camion', txt: 'Tus pedidos y tus clientes del reparto.' },
};

export function vistaSelector(ctx, sesion) {
  document.body.classList.add('cg-activo');
  const d = sesion.datos();
  const nombre = (d.nombre || '').split(' ')[0];
  const paneles = ORDEN.filter(p => d.paneles.includes(p)).concat(d.paneles.filter(p => !ORDEN.includes(p)));
  const tarjetas = paneles.map(p => {
    const activo = !!DESTINO[p];
    const info = INFO[p] || { ico: 'inicio', txt: '' };
    return el('button', { type: 'button', class: 'card panel-card cgs-card', disabled: !activo, 'data-panel': p,
      onclick: activo ? () => { sesion.elegirPanel(p); ctx.ir(DESTINO[p]); } : null },
      el('span', { class: 'cg-accion-ico' }, icono(info.ico, 22)),
      el('span', { class: 'cgs-card-txt' }, el('h2', { text: textoPanel(p) }), el('p', { class: 'muted', text: activo ? (info.txt || 'Entrar al panel.') : 'Todavía no disponible.' })),
      activo ? el('span', { class: 'cgs-flecha' }, icono('flecha', 18)) : null);
  });
  montar(ctx.app, el('div', { class: 'stack cgs' },
    el('img', { class: 'cgs-logo', src: 'assets/img/logo.png', alt: 'Golden' }),
    el('div', { class: 'cgs-head' }, el('span', { class: 'cg-eyebrow', text: nombre ? 'Hola, ' + nombre : 'Hola' }), el('h1', { text: 'Elegí un panel' }),
      el('p', { text: 'Tu cuenta tiene más de un panel. Podés cambiar cuando quieras.' })),
    paneles.length ? el('div', { class: 'panel-grid cgs-grid' }, tarjetas)
      : el('div', { class: 'card' }, el('p', { class: 'muted', text: 'Tu sesión no tiene paneles habilitados.' })),
    el('button', { type: 'button', class: 'cgs-salir', 'data-accion': 'salir', onclick: () => disparar('btn-salir') }, icono('salir', 16), el('span', { text: 'Salir' }))));
}
