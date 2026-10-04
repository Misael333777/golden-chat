// Panel Admin General: menú fijo completo. Solo Clientes y Repartidores tienen funcionalidad en este bloque.
import { el, montar, avisoBackend, aviso, conBloqueo, textoRol } from '../../ui.js';
import { TEXTO_FALLA } from '../../api.js';
import * as ops from '../../ops.js';
import { vistaPersonas, vistaFicha } from './personas.js';
import { vistaCatalogo, vistaProducto } from './catalogo.js';
import { vistaPedidos, vistaPersonaPedido } from './pedidos.js';
import { vistaProduccion } from './produccion.js';
import { vistaPendientes } from './pendientes.js';
import { vistaHistorial } from './historial.js';
import { vistaReportes } from './reportes.js';
import { vistaConfiguracion } from './configuracion.js';

const MENU = [
  { id: 'inicio', txt: 'Inicio', activo: true },
  { id: 'clientes', txt: 'Clientes', activo: true },
  { id: 'repartidores', txt: 'Repartidores', activo: true },
  { id: 'catalogo', txt: 'Catálogo', activo: true },
  { id: 'pedidos', txt: 'Pedidos', activo: true },
  { id: 'produccion', txt: 'Producción', activo: true },
  { id: 'pendientes', txt: 'Pendientes', activo: true },
  { id: 'historial', txt: 'Historial', activo: true },
  { id: 'reportes', txt: 'Reportes', activo: true },
  { id: 'configuracion', txt: 'Configuración', activo: true },
];
export const SECCIONES = {
  clientes: { id: 'clientes', titulo: 'Clientes', rol: 'cliente', singular: 'cliente' },
  repartidores: { id: 'repartidores', titulo: 'Repartidores', rol: 'repartidor', singular: 'repartidor' },
  // Se entra desde Configuración (no es un ítem del menú).
  admin_finanzas: { id: 'configuracion/admin-finanzas', titulo: 'Admin Finanzas', rol: 'admin_finanzas', singular: 'Admin Finanzas' },
};

export function vistaAdmin(ctx, partes) {
  const sec = partes[0] || 'inicio';
  const item = MENU.find(m => m.id === sec);
  if (!item) return ctx.ir('#/admin/inicio');
  // Presentación: mismo MENU y mismo orden, en una sola lista. Los no habilitados conservan la marca "Pronto".
  const itemMenu = (m) => el('a', { class: 'menu-item' + (m.id === sec ? ' active' : '') + (m.activo ? '' : ' off'), href: '#/admin/' + m.id,
    'aria-current': m.id === sec ? 'page' : null, 'data-menu': m.id },
    el('span', { class: 'menu-ico', 'aria-hidden': 'true' }), el('span', { class: 'menu-txt', text: m.txt }), m.activo ? null : el('span', { class: 'tag-off', text: 'Pronto' }));
  const menu = el('nav', { class: 'side-menu', 'aria-label': 'Menú Admin General' }, MENU.map(itemMenu));
  const contenido = el('section', { class: 'stack', id: 'admin-contenido' });
  const zonaFlash = el('div', { class: 'stack', id: 'admin-flash' });
  const zonaPend = el('div', { class: 'stack', id: 'pendientes' });
  // Presentación: el título del panel encabeza la columna lateral (estilo marco de aplicación).
  const lateral = el('aside', { class: 'side' },
    el('div', { class: 'side-head' }, el('span', { class: 'side-crown', 'aria-hidden': 'true' }), el('h1', { text: 'Admin General' })),
    menu,
    el('span', { class: 'side-art', 'aria-hidden': 'true' }),
    el('p', { class: 'side-script', 'aria-hidden': 'true' }, 'Panadería', el('br'), 'en buenas manos.'));
  montar(ctx.app, el('div', { class: 'stack admin-page' },
    el('div', { class: 'admin-layout' }, lateral, el('div', { class: 'stack admin-body' }, zonaFlash, zonaPend, contenido))));
  if (ctx.flash) { montar(zonaFlash, ctx.flash.r ? avisoBackend(ctx.flash.r) : aviso('error', TEXTO_FALLA[ctx.flash.falla] || 'No se pudo completar.', 'FALLA_' + ctx.flash.falla)); ctx.flash = null; }
  pintarPendientes(ctx, zonaPend);
  const off = ops.suscribir(() => { if (!zonaPend.isConnected) return off(); pintarPendientes(ctx, zonaPend); });

  if (!item.activo) {
    return montar(contenido, el('div', { class: 'card empty', 'data-no-disponible': sec },
      el('span', { class: 'empty-ico', 'aria-hidden': 'true' }),
      el('h2', { text: item.txt }), el('p', { text: 'Todavía no disponible.' })));
  }
  if (sec === 'inicio') {
    const atajo = (id, titulo, texto, boton, clase) => el('div', { class: 'shortcut', 'data-atajo': id },
      el('span', { class: 'shortcut-ico', 'aria-hidden': 'true' }),
      el('h3', { text: titulo }), el('p', { class: 'muted small', text: texto }),
      el('a', { class: 'btn ' + clase, href: '#/admin/' + id }, boton));
    return montar(contenido, el('div', { class: 'card stack card-welcome' },
      el('div', null,
        el('span', { class: 'eyebrow', text: 'Bienvenida' }),
        el('h2', { text: 'Inicio' }),
        el('p', { class: 'muted', text: 'Todas las secciones de Admin General están habilitadas.' })),
      el('div', { class: 'shortcut-grid' },
        atajo('clientes', 'Clientes', 'Altas, datos, lista de precio, roles y acceso.', 'Ir a Clientes', 'btn-primary'),
        atajo('repartidores', 'Repartidores', 'Altas, datos, roles y acceso.', 'Ir a Repartidores', 'btn-ghost'),
        atajo('catalogo', 'Catálogo', 'Productos, precios por lista y visibilidad por rol.', 'Ir a Catálogo', 'btn-ghost'),
        atajo('pedidos', 'Pedidos', 'Pedidos por fecha, habituales y extras.', 'Ir a Pedidos', 'btn-ghost'),
        atajo('produccion', 'Producción', 'Planilla por fecha, líneas manuales y aclaraciones.', 'Ir a Producción', 'btn-ghost'),
        atajo('pendientes', 'Pendientes', 'Lo que necesita intervención.', 'Ir a Pendientes', 'btn-ghost'),
        atajo('historial', 'Historial', 'Quién hizo qué y cuándo.', 'Ir a Historial', 'btn-ghost'),
        atajo('reportes', 'Reportes', 'Resúmenes por período.', 'Ir a Reportes', 'btn-ghost'),
        atajo('configuracion', 'Configuración', 'Datos generales de Golden y Admin Finanzas.', 'Ir a Configuración', 'btn-ghost'))));
  }
  if (sec === 'pedidos') return partes[1] === 'persona' ? vistaPersonaPedido(ctx, contenido, decodeURIComponent(partes[2] || ''), partes[3] || '') : vistaPedidos(ctx, contenido, partes[1]);
  if (sec === 'produccion') return vistaProduccion(ctx, contenido, partes[1] || '');
  if (sec === 'pendientes') return vistaPendientes(ctx, contenido);
  if (sec === 'historial') return vistaHistorial(ctx, contenido);
  if (sec === 'reportes') return vistaReportes(ctx, contenido);
  if (sec === 'configuracion' && partes[1] === 'admin-finanzas') return partes[2] ? vistaFicha(ctx, contenido, SECCIONES.admin_finanzas, decodeURIComponent(partes[2])) : vistaPersonas(ctx, contenido, SECCIONES.admin_finanzas);
  if (sec === 'configuracion') return vistaConfiguracion(ctx, contenido);
  if (sec === 'catalogo') return partes[1] ? vistaProducto(ctx, contenido, decodeURIComponent(partes[1])) : vistaCatalogo(ctx, contenido);
  const s = SECCIONES[sec];
  if (partes[1]) return vistaFicha(ctx, contenido, s, decodeURIComponent(partes[1]));
  return vistaPersonas(ctx, contenido, s);
}

// Operaciones de escritura que quedaron SIN CONFIRMAR en esta pestaña (sobreviven al refresh).
// "Reintentar" repite EXACTAMENTE la misma operación (mismo operacion_id y mismos campos). "Descartar" la abandona.
const ACC_TXT = { crear_persona: 'Crear persona', editar_persona: 'Editar datos', agregar_rol: 'Agregar rol', quitar_rol: 'Quitar rol',
  reactivar_rol: 'Reactivar rol', habilitar_acceso: 'Habilitar acceso', deshabilitar_acceso: 'Deshabilitar acceso',
  crear_producto: 'Crear producto', editar_producto: 'Editar producto', cambiar_precios: 'Cambiar precios', activar_producto: 'Activar producto', desactivar_producto: 'Desactivar producto',
  crear_pedido_normal: 'Pedido de la fecha', configurar_recurrente: 'Configurar habitual', agregar_dia: 'Agregar día al habitual', cambio_vigente: 'Editar habitual',
  solicitar_extra: 'Cargar extra', aprobar_extra: 'Aprobar extra', rechazar_extra: 'Rechazar extra', registrar_entrega: 'Registrar entrega', recuperar_finanzas_extra: 'Generar cargo del extra',
  agregar_linea_manual: 'Agregar línea manual', editar_linea_manual: 'Editar línea manual', anular_linea_manual: 'Anular línea manual',
  crear_aclaracion: 'Crear aclaración', editar_aclaracion: 'Editar aclaración', activar_aclaracion: 'Activar aclaración', desactivar_aclaracion: 'Desactivar aclaración', actualizar_configuracion: 'Datos generales', derivar_revision: 'Derivar a Finanzas', atender_revision: 'Marcar revisión atendida',
  registro_aprobar: 'Aprobar solicitud de registro', registro_rechazar: 'Rechazar solicitud de registro' };
function describir(p) {
  const c = p.campos || {};
  const partes = [ACC_TXT[p.accion] || p.accion];
  if (c.nombre) partes.push(String(c.nombre));
  if (c.rol) partes.push(textoRol(c.rol));
  if (c.rol_inicial) partes.push(textoRol(c.rol_inicial));
  if (c.persona_id) partes.push(String(c.persona_id));
  if (c.producto) partes.push(String(c.producto));
  if (Number.isInteger(c.producto_id)) partes.push('producto ' + c.producto_id);
  if (c.fecha) partes.push(String(c.fecha));
  if (c.pedido_id) partes.push(String(c.pedido_id));
  if (c.fecha_produccion) partes.push(String(c.fecha_produccion));
  if (c.concepto) partes.push(String(c.concepto));
  if (c.texto) partes.push(String(c.texto).slice(0, 40));
  return partes.join(' · ');
}
function pintarPendientes(ctx, zona) {
  const lista = ops.listar((acc, tipo) => tipo === 'admin_general' && !ops.ACCIONES_FINANZAS.includes(acc)); // las de Admin Finanzas se reintentan en su panel
  if (!lista.length) return montar(zona);
  montar(zona, el('div', { class: 'notice pending stack', role: 'alert', 'data-pendientes': String(lista.length) },
    el('strong', { text: 'Operaciones sin confirmar' }),
    el('span', { text: 'No sabemos si se registraron. Reintentá la misma operación (si ya se había registrado, no se duplica) o descartala.' }),
    lista.map(p => {
      const b = el('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-accion': 'reintentar-pendiente' }, 'Reintentar la misma operación');
      b.addEventListener('click', conBloqueo(b, async () => {
        if (!ops.hayPendiente(p.accion, p.campos)) return pintarPendientes(ctx, zona); // ya se resolvió: no se reenvía con otro id
        const res = await ops.ejecutar(ctx.base('admin_general'), p.accion, p.campos);
        if (res.r && ctx.revisarFinSesion(res.r)) return;
        ctx.flash = res.r ? { r: res.r } : { falla: res.falla };
        ctx.ir(location.hash);
      }, 'Reintentando…'));
      return el('div', { class: 'row', 'data-pendiente': p.operacion_id, 'data-pendiente-accion': p.accion },
        el('span', { class: 'small', style: null, text: describir(p) }), el('span', { class: 'spacer' }), b,
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'descartar-pendiente',
          onclick: () => { ops.descartar(p.accion, p.campos); pintarPendientes(ctx, zona); } }, 'Descartar'));
    })));
}
