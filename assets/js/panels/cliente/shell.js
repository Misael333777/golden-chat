// Panel Cliente y Panel Repartidor: mismas vistas, el backend decide rol, persona, catálogo y precios por la SESIÓN y el panel activo.
// Repartidor suma "Mis clientes" (solo lectura, H8). No hay registro de entregas en ningún panel de persona (decisión cerrada 2026-10-02).
// Mismo marco visual que Admin General / Admin Finanzas (assets/js/marco.js). Todas las secciones tienen backend real
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
import { marco } from '../../marco.js';

export const vistaCliente = (ctx, partes) => vistaPanelCliente(ctx, partes, 'cliente');
export const vistaRepartidor = (ctx, partes) => vistaPanelCliente(ctx, partes, 'repartidor');

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

// ---------- Panel Cliente / Repartidor: marco de la maqueta aprobada (assets/js/marco.js) ----------
// Mismas secciones y rutas de siempre (#/cliente/<seccion> y #/repartidor/<seccion>): solo cambia cómo se agrupan y se ven.
// "Hacer pedido" agrupa Para una fecha / Mi habitual / Extras de hoy; "Mi cuenta" agrupa Movimientos / Productos y precios / Mi perfil.
const NAV_CLI = [
  { id: 'inicio', txt: 'Inicio', sub: 'Tu resumen del día', corto: 'Inicio', ico: 'inicio', secs: ['inicio'], tab: true },
  { id: 'pedido', txt: 'Hacer pedido', sub: 'Fecha, habitual y extras', corto: 'Pedir', ico: 'pedido', secs: ['pedido', 'habitual', 'extras'], tab: true },
  { id: 'clientes', txt: 'Mis clientes', sub: 'Tu reparto habitual', corto: 'Clientes', ico: 'camion', secs: ['clientes'], solo: 'repartidor', tab: true },
  { id: 'pedidos', txt: 'Mis pedidos', sub: 'Próximos e historial', corto: 'Pedidos', ico: 'pedidos', secs: ['pedidos'], tab: true },
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

function vistaPanelCliente(ctx, partes, panel) {
  const base = '#/' + panel;
  const nav = NAV_CLI.filter(g => !g.solo || g.solo === panel);
  const sec = partes[0] || 'inicio';
  const grupo = nav.find(g => g.secs.includes(sec));
  if (!grupo) return ctx.ir(base + '/inicio');
  const sub = grupo.id === 'pedido' ? MODOS_PEDIDO.find(m => m.id === sec) : grupo.id === 'cuenta' ? PESTANAS_CUENTA.find(t => t.id === sec) : null;

  let selector = null;
  if (grupo.id === 'pedido') selector = el('nav', { class: 'cg-modos', 'aria-label': 'Tipo de pedido' }, MODOS_PEDIDO.map(m => el('a', { class: 'cg-modo', href: base + '/' + m.id, 'aria-current': m.id === sec ? 'page' : null, 'data-menu': 'cli-' + m.id },
    el('span', { class: 'cg-modo-ico' }, icono(m.ico, 18)), el('span', { class: 'cg-modo-txt' }, el('strong', { text: m.txt }), el('small', { text: m.sub })))));
  if (grupo.id === 'cuenta') selector = el('nav', { class: 'cg-pestanas', 'aria-label': 'Secciones de mi cuenta' }, PESTANAS_CUENTA.map(t => el('a', { class: 'cg-pestana', href: base + '/' + t.id, 'aria-current': t.id === sec ? 'page' : null, 'data-menu': 'cli-' + t.id },
    icono(t.ico, 16), el('span', { text: t.txt }))));

  const avisos = el('div', { class: 'stack', id: 'cli-pendientes-ops' });
  const contenido = el('section', { class: 'stack', id: 'cliente-contenido', 'data-sec': sec });
  marco(ctx, { panel, base, nav, grupo, sec, prefijo: 'cli-', sub: sub && sub.txt, selector, zonas: [avisos], contenido,
    etiqueta: panel === 'repartidor' ? 'Repartidor' : 'Mi Golden', rolTxt: panel === 'repartidor' ? 'Panel de repartidor' : 'Mi cuenta de cliente',
    ariaMenu: panel === 'repartidor' ? 'Menú Repartidor' : 'Menú Cliente',
    extraClase: 'cliente-page' + (panel === 'repartidor' ? ' repartidor-page' : '') + (sec === 'pedido' ? ' cg-con-pedido' : '') });
  pintarPendientes(ctx, avisos, panel);
  if (ctx.flash) { const f = ctx.flash; ctx.flash = null; if (f.r) avisos.appendChild(avisoCli(f.r)); }
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
