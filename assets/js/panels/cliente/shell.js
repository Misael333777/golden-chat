// Panel Cliente y Panel Repartidor: mismas vistas, el backend decide rol, persona, catálogo y precios por la SESIÓN y el panel activo.
// Repartidor suma "Mis clientes" (solo lectura, H8). No hay registro de entregas en ningún panel de persona (decisión cerrada 2026-10-02).
// Mismo marco visual que Admin General / Admin Finanzas. Todas las secciones tienen backend real
// (Web API PROD → Usuario Web Consultas, Pedidos Fecha Consultas/Escrituras, Recurrentes Cambios, Extras, Cuenta corriente y Soporte PROD).
// La persona y el actor salen SIEMPRE de la sesión (Web API). Las escrituras usan operacion_id idempotente y reintento seguro.
import { el, montar, conBloqueo } from '../../ui.js';
import * as ops from '../../ops.js';
import { TIPOS_CLIENTE, avisoCli, textoOk } from './comun.js';
import { vistaInicio } from './inicio.js';
import { vistaHabitual } from './habitual.js';
import { vistaPedidoFecha } from './pedido.js';
import { vistaExtras } from './extras.js';
import { vistaHistorial } from './historial.js';
import { vistaCuenta } from './cuenta.js';
import { vistaSoporte } from './soporte.js';
import { vistaPerfil, vistaCatalogo } from './perfil.js';
import { vistaMisClientes } from './clientes.js';
import { icono } from './iconos.js';

const MENU = [
  { id: 'inicio', txt: 'Inicio' }, { id: 'habitual', txt: 'Mi pedido habitual' }, { id: 'pedido', txt: 'Pedido para una fecha' }, { id: 'extras', txt: 'Extras de hoy' },
  { id: 'clientes', txt: 'Mis clientes', solo: 'repartidor' }, { id: 'pedidos', txt: 'Mis pedidos' }, { id: 'cuenta', txt: 'Mi cuenta' }, { id: 'catalogo', txt: 'Productos y precios' }, { id: 'perfil', txt: 'Mi perfil' },
  { id: 'soporte', txt: 'Hablar con Golden' },
];

export const vistaCliente = (ctx, partes) => vistaPanelCliente(ctx, partes);
export const vistaRepartidor = (ctx, partes) => vistaPanel(ctx, partes, 'repartidor');

function vistaPanel(ctx, partes, panel) {
  const base = '#/' + panel;
  const menu = MENU.filter(m => !m.solo || m.solo === panel);
  const sec = partes[0] || 'inicio';
  if (!menu.some(m => m.id === sec)) return ctx.ir(base + '/inicio');
  const itemMenu = (m) => el('a', { class: 'menu-item' + (m.id === sec ? ' active' : ''), href: base + '/' + m.id,
    'aria-current': m.id === sec ? 'page' : null, 'data-menu': 'cli-' + m.id },
    el('span', { class: 'menu-ico', 'aria-hidden': 'true' }), el('span', { class: 'menu-txt', text: m.txt }));
  const avisos = el('div', { class: 'stack', id: 'cli-pendientes-ops' });
  const contenido = el('section', { class: 'stack', id: 'cliente-contenido' });
  const lateral = el('aside', { class: 'side' },
    el('div', { class: 'side-head' }, el('span', { class: 'side-crown', 'aria-hidden': 'true' }), el('h1', { text: panel === 'repartidor' ? 'Repartidor' : 'Mi Golden' })),
    el('nav', { class: 'side-menu', 'aria-label': panel === 'repartidor' ? 'Menú Repartidor' : 'Menú Cliente' }, menu.map(itemMenu)),
    el('span', { class: 'side-art', 'aria-hidden': 'true' }),
    el('p', { class: 'side-script', 'aria-hidden': 'true' }, 'Panadería', el('br'), 'en buenas manos.'));
  montar(ctx.app, el('div', { class: 'stack admin-page cliente-page' + (panel === 'repartidor' ? ' repartidor-page' : ''), 'data-panel-persona': panel }, el('div', { class: 'admin-layout' }, lateral, el('div', { class: 'stack admin-body' }, avisos, contenido))));
  pintarPendientes(ctx, avisos, panel);
  if (ctx.flash) { const f = ctx.flash; ctx.flash = null; if (f.r) avisos.appendChild(avisoCli(f.r)); }
  return mostrarSeccion(ctx, contenido, sec, partes.slice(1));
}

function mostrarSeccion(ctx, contenido, sec, resto) {
  if (sec === 'habitual') return vistaHabitual(ctx, contenido);
  if (sec === 'pedido') return vistaPedidoFecha(ctx, contenido, resto[0]);
  if (sec === 'extras') return vistaExtras(ctx, contenido);
  if (sec === 'clientes') return vistaMisClientes(ctx, contenido);
  if (sec === 'pedidos') return vistaHistorial(ctx, contenido);
  if (sec === 'cuenta') return vistaCuenta(ctx, contenido);
  if (sec === 'catalogo') return vistaCatalogo(ctx, contenido);
  if (sec === 'perfil') return vistaPerfil(ctx, contenido);
  if (sec === 'soporte') return vistaSoporte(ctx, contenido);
  return vistaInicio(ctx, contenido);
}

// ---------- Panel Cliente: marco de la maqueta aprobada ----------
// Mismas secciones y rutas de siempre (#/cliente/<seccion>): solo cambia cómo se agrupan y se ven.
// "Hacer pedido" agrupa Para una fecha / Mi habitual / Extras de hoy; "Mi cuenta" agrupa Movimientos / Productos y precios / Mi perfil.
// Salir y Cambiar panel usan los MISMOS botones de la cabecera original (se disparan, no se reimplementan).
const NAV_CLI = [
  { id: 'inicio', txt: 'Inicio', sub: 'Tu resumen del día', corto: 'Inicio', ico: 'inicio', secs: ['inicio'] },
  { id: 'pedido', txt: 'Hacer pedido', sub: 'Fecha, habitual y extras', corto: 'Pedir', ico: 'pedido', secs: ['pedido', 'habitual', 'extras'] },
  { id: 'pedidos', txt: 'Mis pedidos', sub: 'Próximos e historial', corto: 'Pedidos', ico: 'pedidos', secs: ['pedidos'] },
  { id: 'cuenta', txt: 'Mi cuenta', sub: 'Saldo, precios y datos', corto: 'Cuenta', ico: 'cuenta', secs: ['cuenta', 'catalogo', 'perfil'] },
  { id: 'soporte', txt: 'Hablar con Golden', sub: 'Consultas y ayuda', corto: 'Ayuda', ico: 'soporte', secs: ['soporte'] },
];
const MODOS_PEDIDO = [
  { id: 'pedido', txt: 'Para una fecha', sub: 'Cambiar un día o pedir uno nuevo', ico: 'calendario' },
  { id: 'habitual', txt: 'Mi pedido habitual', sub: 'Lo que recibís cada semana', ico: 'repetir' },
  { id: 'extras', txt: 'Extras de hoy', sub: 'Si hoy te falta algo', ico: 'mas' },
];
const PESTANAS_CUENTA = [
  { id: 'cuenta', txt: 'Movimientos', ico: 'cuenta' }, { id: 'catalogo', txt: 'Productos y precios', ico: 'etiqueta' }, { id: 'perfil', txt: 'Mi perfil', ico: 'persona' },
];
const iniciales = (n) => String(n || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || 'G';
const disparar = (id) => { const b = document.getElementById(id); if (b && !b.hidden) b.click(); };

function vistaPanelCliente(ctx, partes) {
  const base = '#/cliente';
  const sec = partes[0] || 'inicio';
  const grupo = NAV_CLI.find(g => g.secs.includes(sec));
  if (!grupo) return ctx.ir(base + '/inicio');
  document.body.classList.add('cg-activo'); // app.js la quita en cada cambio de pantalla
  const nombre = (ctx.sesion && ctx.sesion().nombre) || '';
  const puedeCambiar = !document.getElementById('btn-cambiar-panel').hidden;
  const actual = (g) => g.id === grupo.id;

  const itemNav = (g) => el('a', { class: 'cg-nav-item', href: base + '/' + g.id, 'aria-current': actual(g) ? 'page' : null, 'data-menu': 'cli-' + g.id },
    icono(g.ico, 18), el('span', { class: 'cg-nav-txt' }, el('span', { text: g.txt }), el('small', { text: g.sub })),
    actual(g) ? el('span', { class: 'cg-nav-punto', 'aria-hidden': 'true' }) : null);
  const bSalir = (clase) => el('button', { type: 'button', class: clase, 'data-accion': 'salir', 'aria-label': 'Salir', title: 'Salir', onclick: () => disparar('btn-salir') }, icono('salir', 17));
  const bCambiar = (clase) => puedeCambiar ? el('button', { type: 'button', class: clase, 'data-accion': 'cambiar-panel', 'aria-label': 'Cambiar panel', title: 'Cambiar panel', onclick: () => disparar('btn-cambiar-panel') }, icono('cambiar', 17)) : null;

  const lateral = el('aside', { class: 'cg-side' },
    el('a', { class: 'cg-brand', href: base + '/inicio', 'aria-label': 'Golden, inicio' }, el('img', { src: 'assets/img/logo.png', alt: 'Golden' }), el('span', { text: 'PANADERÍA EN BUENAS MANOS' })),
    el('nav', { class: 'cg-nav', 'aria-label': 'Menú Cliente' }, NAV_CLI.map(itemNav)),
    el('div', { class: 'cg-side-fin' },
      el('img', { class: 'cg-side-trigo', src: 'assets/img/deco/trigo-ramo.svg', alt: '' }),
      el('p', { class: 'cg-side-frase' }, 'Lo de cada día.', el('br'), el('em', { text: 'Hecho con dedicación.' })),
      el('div', { class: 'cg-user' }, el('span', { class: 'cg-avatar', 'aria-hidden': 'true', text: iniciales(nombre) }),
        el('div', { class: 'cg-user-txt' }, el('strong', { text: nombre || 'Mi cuenta' }), el('small', { text: 'Mi cuenta de cliente' })),
        bCambiar('cg-icono-btn'), bSalir('cg-icono-btn'))));

  const sub = grupo.id === 'pedido' ? MODOS_PEDIDO.find(m => m.id === sec) : grupo.id === 'cuenta' ? PESTANAS_CUENTA.find(t => t.id === sec) : null;
  const cabeceraTop = el('header', { class: 'cg-top' },
    el('div', { class: 'cg-top-izq' }, el('img', { class: 'cg-top-logo', src: 'assets/img/logo.png', alt: 'Golden' }),
      el('span', { class: 'cg-miga' }, 'Mi Golden', icono('chevron', 13)), el('strong', { text: grupo.txt }),
      sub ? el('span', { class: 'cg-miga cg-miga-sub' }, icono('chevron', 13), sub.txt) : null),
    el('div', { class: 'cg-top-der' }, el('span', { class: 'cg-top-nombre', text: nombre }), bCambiar('cg-icono-btn cg-top-btn'), bSalir('cg-icono-btn cg-top-btn')));

  let selector = null;
  if (grupo.id === 'pedido') selector = el('nav', { class: 'cg-modos', 'aria-label': 'Tipo de pedido' }, MODOS_PEDIDO.map(m => el('a', { class: 'cg-modo', href: base + '/' + m.id, 'aria-current': m.id === sec ? 'page' : null, 'data-menu': 'cli-' + m.id },
    el('span', { class: 'cg-modo-ico' }, icono(m.ico, 18)), el('span', { class: 'cg-modo-txt' }, el('strong', { text: m.txt }), el('small', { text: m.sub })))));
  if (grupo.id === 'cuenta') selector = el('nav', { class: 'cg-pestanas', 'aria-label': 'Secciones de mi cuenta' }, PESTANAS_CUENTA.map(t => el('a', { class: 'cg-pestana', href: base + '/' + t.id, 'aria-current': t.id === sec ? 'page' : null, 'data-menu': 'cli-' + t.id },
    icono(t.ico, 16), el('span', { text: t.txt }))));

  const avisos = el('div', { class: 'stack', id: 'cli-pendientes-ops' });
  const contenido = el('section', { class: 'stack', id: 'cliente-contenido', 'data-sec': sec });
  const barra = el('nav', { class: 'cg-tabbar', 'aria-label': 'Secciones' }, NAV_CLI.map(g => el('a', { class: 'cg-tab', href: base + '/' + g.id, 'aria-current': actual(g) ? 'page' : null }, icono(g.ico, 20), el('span', { text: g.corto }))));

  montar(ctx.app, el('div', { class: 'cg cliente-page' + (sec === 'pedido' ? ' cg-con-pedido' : ''), 'data-panel-persona': 'cliente', 'data-seccion': sec },
    lateral,
    el('div', { class: 'cg-main' }, cabeceraTop,
      el('div', { class: 'cg-content' }, avisos, selector, contenido,
        el('footer', { class: 'cg-pie' }, el('span', { text: 'Golden. Panadería en buenas manos.' }), el('span', { text: 'Pedidos para mañana hasta las 22:00.' })))),
    barra));
  pintarPendientes(ctx, avisos, 'cliente');
  if (ctx.flash) { const f = ctx.flash; ctx.flash = null; if (f.r) avisos.appendChild(avisoCli(f.r)); }
  window.scrollTo(0, 0);
  return mostrarSeccion(ctx, contenido, sec, partes.slice(1));
}

// Operaciones del panel Cliente que quedaron sin confirmar (red caída): se reintentan con el MISMO operacion_id.
const ACC_TXT = { crear_pedido_normal: 'Pedido para una fecha', cambio_vigente: 'Cambio del habitual', solicitar_extra: 'Pedido de extra', modificar_extra: 'Cambio de un extra', cancelar_extra: 'Cancelación de un extra', solicitar_soporte: 'Consulta a Golden',
  editar_habitual_dia: 'Cambio del habitual', hoy_no_pedir: 'Hoy no pedir', anular: 'Volver al habitual / cancelar pedido' };
function describir(p) {
  const c = p.campos || {};
  return [ACC_TXT[p.accion] || p.accion, c.fecha || c.fecha_entrega || null, c.dia_semana || null, c.tema || null].filter(Boolean).join(' · ');
}
function pintarPendientes(ctx, zona, panel) {
  const lista = ops.listar((acc, tipo, p) => TIPOS_CLIENTE.includes(tipo) && p === panel);
  if (!lista.length) return montar(zona);
  montar(zona, el('div', { class: 'notice pending stack', role: 'alert', 'data-pendientes-cli': String(lista.length) },
    el('strong', { text: 'Operaciones sin confirmar' }),
    el('span', { text: 'No sabemos si llegaron a Golden. Reintentá la misma operación: si ya se había registrado, no se duplica.' }),
    lista.map(p => {
      const b = el('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-accion': 'reintentar-pendiente' }, 'Reintentar la misma operación');
      b.addEventListener('click', conBloqueo(b, async () => {
        if (!ops.hayPendiente(p.accion, p.campos)) return pintarPendientes(ctx, zona, panel);
        const res = await ops.ejecutar(ctx.base(p.tipo), p.accion, p.campos);
        if (res.r && ctx.revisarFinSesion(res.r)) return;
        ctx.flash = res.r ? { r: res.r } : null;
        if (res.r && res.r.success) ctx.flash = { r: Object.assign({}, res.r, { mensaje: textoOk(res.r) }) };
        ctx.ir(location.hash);
      }, 'Reintentando…'));
      return el('div', { class: 'row', 'data-pendiente': p.operacion_id, 'data-pendiente-accion': p.accion },
        el('span', { class: 'small', text: describir(p) }), el('span', { class: 'spacer' }), b,
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'descartar-pendiente', onclick: () => { ops.descartar(p.accion, p.campos); pintarPendientes(ctx, zona, panel); } }, 'Descartar'));
    })));
}
