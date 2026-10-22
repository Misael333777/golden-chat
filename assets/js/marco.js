// Golden — marco visual compartido (diseño aprobado): columna lateral, barra superior y menú inferior en celular.
// Solo presentación: cada panel sigue decidiendo sus rutas, sus vistas y sus llamadas a la Web API.
// Salir y Cambiar panel disparan los MISMOS botones de la cabecera original (no se reimplementan).
import { el, montar } from './ui.js';
import { icono } from './panels/cliente/iconos.js';

export const iniciales = (n) => String(n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'G';
export const disparar = (id) => { const b = document.getElementById(id); if (b && !b.hidden) b.click(); };
const cerrarMenu = () => document.body.classList.remove('cg-menu-abierto');

// o: { panel, base, nav:[{id,txt,sub,corto,ico,secs?,tab?}], grupo, etiqueta, rolTxt, ariaMenu, sub, selector, zonas:[], contenido, sec, extraClase }
export function marco(ctx, o) {
  document.body.classList.add('cg-activo'); // app.js la quita en cada cambio de pantalla
  cerrarMenu();
  const nombre = (ctx.sesion && ctx.sesion().nombre) || '';
  const puedeCambiar = !document.getElementById('btn-cambiar-panel').hidden;
  const actual = (g) => g.id === o.grupo.id;
  const href = (g) => o.base + '/' + g.id;

  const itemNav = (g) => el('a', { class: 'cg-nav-item', href: href(g), 'aria-current': actual(g) ? 'page' : null, 'data-menu': o.prefijo + g.id, onclick: cerrarMenu },
    icono(g.ico, 18), el('span', { class: 'cg-nav-txt' }, el('span', { text: g.txt }), g.sub ? el('small', { text: g.sub }) : null),
    actual(g) ? el('span', { class: 'cg-nav-punto', 'aria-hidden': 'true' }) : null);
  const bSalir = (clase) => el('button', { type: 'button', class: clase, 'data-accion': 'salir', 'aria-label': 'Salir', title: 'Salir', onclick: () => disparar('btn-salir') }, icono('salir', 17));
  const bCambiar = (clase) => puedeCambiar ? el('button', { type: 'button', class: clase, 'data-accion': 'cambiar-panel', 'aria-label': 'Cambiar panel', title: 'Cambiar panel', onclick: () => disparar('btn-cambiar-panel') }, icono('cambiar', 17)) : null;

  const lateral = el('aside', { class: 'cg-side', id: 'cg-side' },
    el('div', { class: 'cg-brand' },
      el('a', { class: 'cg-brand-link', href: o.base + '/inicio', 'aria-label': 'Golden, inicio', onclick: cerrarMenu }, el('img', { src: 'assets/img/logo.png', alt: 'Golden' }), el('span', { text: 'PANADERÍA EN BUENAS MANOS' })),
      el('button', { type: 'button', class: 'cg-icono-btn cg-side-cerrar', 'aria-label': 'Cerrar menú', onclick: cerrarMenu }, icono('cerrar', 18))),
    el('span', { class: 'cg-side-panel' }, o.etiqueta),
    el('nav', { class: 'cg-nav', 'aria-label': o.ariaMenu }, o.nav.map(itemNav)),
    el('div', { class: 'cg-side-fin' },
      el('img', { class: 'cg-side-trigo', src: 'assets/img/deco/trigo-ramo.svg', alt: '' }),
      el('p', { class: 'cg-side-frase' }, 'Lo de cada día.', el('br'), el('em', { text: 'Hecho con dedicación.' })),
      el('div', { class: 'cg-user' }, el('span', { class: 'cg-avatar', 'aria-hidden': 'true', text: iniciales(nombre) }),
        el('div', { class: 'cg-user-txt' }, el('strong', { text: nombre || 'Mi cuenta' }), el('small', { text: o.rolTxt })),
        bCambiar('cg-icono-btn'), bSalir('cg-icono-btn'))));

  const cabeceraTop = el('header', { class: 'cg-top' },
    el('div', { class: 'cg-top-izq' }, el('img', { class: 'cg-top-logo', src: 'assets/img/logo.png', alt: 'Golden' }),
      el('span', { class: 'cg-miga' }, o.etiqueta, icono('chevron', 13)), el('strong', { text: o.grupo.txt }),
      o.sub ? el('span', { class: 'cg-miga cg-miga-sub' }, icono('chevron', 13), o.sub) : null),
    el('div', { class: 'cg-top-der' }, el('span', { class: 'cg-top-nombre', text: nombre }), bCambiar('cg-icono-btn cg-top-btn'), bSalir('cg-icono-btn cg-top-btn')));

  // Menú inferior: hasta 5 lugares. Si hay más secciones, 4 accesos + "Más" (abre la columna lateral como panel deslizable).
  const muchas = o.nav.length > 5;
  const tabs = muchas ? o.nav.filter(g => g.tab).slice(0, 4) : o.nav;
  const enMas = muchas && !tabs.some(actual);
  const botonMas = muchas ? el('button', { type: 'button', class: 'cg-tab', 'aria-controls': 'cg-side', 'aria-expanded': 'false', 'aria-current': enMas ? 'page' : null, 'data-accion': 'mas-secciones',
    onclick: (e) => { const ab = document.body.classList.toggle('cg-menu-abierto'); e.currentTarget.setAttribute('aria-expanded', String(ab)); } }, icono('menu', 20), el('span', { text: 'Más' })) : null;
  const barra = el('nav', { class: 'cg-tabbar', 'aria-label': 'Secciones' },
    tabs.map(g => el('a', { class: 'cg-tab', href: href(g), 'aria-current': actual(g) ? 'page' : null }, icono(g.ico, 20), el('span', { text: g.corto || g.txt }))), botonMas);
  const velo = el('div', { class: 'cg-velo', 'aria-hidden': 'true', onclick: cerrarMenu });

  montar(ctx.app, el('div', { class: 'cg ' + (o.extraClase || ''), 'data-panel-persona': o.panel, 'data-seccion': o.sec },
    lateral, velo,
    el('div', { class: 'cg-main' }, cabeceraTop,
      el('div', { class: 'cg-content' }, ...(o.zonas || []), o.selector || null, o.contenido,
        el('footer', { class: 'cg-pie' }, el('span', { text: 'Golden. Panadería en buenas manos.' }), el('span', { text: o.pie || 'Pedidos para mañana hasta las 22:00.' })))),
    barra));
  window.scrollTo(0, 0);
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('cg-menu-abierto')) cerrarMenu(); });
