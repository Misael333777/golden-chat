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

const MENU = [
  { id: 'inicio', txt: 'Inicio' }, { id: 'habitual', txt: 'Mi pedido habitual' }, { id: 'pedido', txt: 'Pedido para una fecha' }, { id: 'extras', txt: 'Extras de hoy' },
  { id: 'clientes', txt: 'Mis clientes', solo: 'repartidor' }, { id: 'pedidos', txt: 'Mis pedidos' }, { id: 'cuenta', txt: 'Mi cuenta' }, { id: 'catalogo', txt: 'Productos y precios' }, { id: 'perfil', txt: 'Mi perfil' },
  { id: 'soporte', txt: 'Hablar con Golden' },
];

export const vistaCliente = (ctx, partes) => vistaPanel(ctx, partes, 'cliente');
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
  const resto = partes.slice(1);
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

// Operaciones del panel Cliente que quedaron sin confirmar (red caída): se reintentan con el MISMO operacion_id.
const ACC_TXT = { crear_pedido_normal: 'Pedido para una fecha', cambio_vigente: 'Cambio del habitual', solicitar_extra: 'Pedido de extra', solicitar_soporte: 'Consulta a Golden',
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
