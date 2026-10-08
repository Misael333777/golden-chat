// Panel Admin General: menú fijo completo. Solo Clientes y Repartidores tienen funcionalidad en este bloque.
import { el, montar, avisoBackend, aviso, conBloqueo, textoRol } from '../../ui.js';
import { TEXTO_FALLA } from '../../api.js';
import * as ops from '../../ops.js';
import { marco } from '../../marco.js';
import { icono } from '../cliente/iconos.js';
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
// Presentación del menú (ícono, subtítulo y descripción). No cambia qué secciones existen ni sus rutas.
const PRESENTACION = {
  inicio: { ico: 'inicio', sub: 'Resumen y accesos', corto: 'Inicio', tab: true },
  clientes: { ico: 'personas', sub: 'Altas, precios y acceso', corto: 'Clientes', tab: true, desc: 'Altas, datos, lista de precio, roles y acceso.' },
  repartidores: { ico: 'camion', sub: 'Altas y acceso', desc: 'Altas, datos, roles y acceso.' },
  catalogo: { ico: 'caja', sub: 'Productos y precios', desc: 'Productos, precios por lista y visibilidad por rol.' },
  pedidos: { ico: 'pedido', sub: 'Fecha, habituales y extras', corto: 'Pedidos', tab: true, dia: true, desc: 'Pedidos por fecha, habituales y extras.' },
  produccion: { ico: 'produccion', sub: 'Planilla del día', corto: 'Producción', tab: true, dia: true, desc: 'Planilla por fecha, líneas manuales y aclaraciones.' },
  pendientes: { ico: 'alerta', sub: 'Lo que requiere atención', dia: true, desc: 'Lo que necesita intervención.' },
  historial: { ico: 'reloj', sub: 'Quién hizo qué', desc: 'Quién hizo qué y cuándo.' },
  reportes: { ico: 'grafico', sub: 'Resúmenes por período', desc: 'Resúmenes por período.' },
  configuracion: { ico: 'ajustes', sub: 'Datos generales', desc: 'Datos generales de Golden y Admin Finanzas.' },
};
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
  // Presentación: mismo MENU y mismo orden, en el marco compartido de la maqueta aprobada (assets/js/marco.js).
  const nav = MENU.map(m => Object.assign({}, m, PRESENTACION[m.id]));
  const contenido = el('section', { class: 'stack', id: 'admin-contenido' });
  const zonaFlash = el('div', { class: 'stack', id: 'admin-flash' });
  const zonaPend = el('div', { class: 'stack', id: 'pendientes' });
  marco(ctx, { panel: 'admin', base: '#/admin', nav, grupo: nav.find(m => m.id === sec), sec, prefijo: '', zonas: [zonaFlash, zonaPend], contenido,
    etiqueta: 'Admin General', rolTxt: 'Admin General', ariaMenu: 'Menú Admin General', extraClase: 'admin-page', pie: 'Gestión diaria de Golden.' });
  if (ctx.flash) { montar(zonaFlash, ctx.flash.r ? avisoBackend(ctx.flash.r) : aviso('error', TEXTO_FALLA[ctx.flash.falla] || 'No se pudo completar.', 'FALLA_' + ctx.flash.falla)); ctx.flash = null; }
  pintarPendientes(ctx, zonaPend);
  const off = ops.suscribir(() => { if (!zonaPend.isConnected) return off(); pintarPendientes(ctx, zonaPend); });

  if (!item.activo) {
    return montar(contenido, el('div', { class: 'card empty', 'data-no-disponible': sec },
      el('span', { class: 'empty-ico', 'aria-hidden': 'true' }),
      el('h2', { text: item.txt }), el('p', { text: 'Todavía no disponible.' })));
  }
  if (sec === 'inicio') {
    const nombre = ((ctx.sesion && ctx.sesion().nombre) || '').split(' ')[0];
    const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Buenos_Aires' });
    const atajo = (m, clase) => el('a', { class: 'cg-accion' + (clase ? ' ' + clase : ''), href: '#/admin/' + m.id, 'data-atajo': m.id },
      el('span', { class: 'cg-accion-ico' }, icono(m.ico, 20)),
      el('span', { class: 'cg-accion-txt' }, el('strong', { text: m.txt }), el('small', { text: m.desc })), icono('chevron', 16));
    const otros = nav.filter(m => m.id !== 'inicio');
    return montar(contenido, el('div', { class: 'cg-home' },
      el('div', { class: 'cg-encabezado' },
        el('div', null, el('span', { class: 'cg-eyebrow', text: 'Admin General' }), el('h1', { text: nombre ? 'Hola, ' + nombre + '.' : 'Hola.' }),
          el('p', { text: 'Todas las secciones de Admin General están habilitadas.' })),
        el('div', { class: 'cg-hoy' }, hoy, el('small', { text: 'Hora de Argentina' }))),
      el('div', { class: 'cg-titulo-seccion' }, el('h2', { text: 'Lo del día' }), el('span', { text: 'Accesos rápidos' })),
      el('div', { class: 'cg-acciones' }, otros.filter(m => m.dia).map(m => atajo(m, 'cg-accion-dia'))),
      el('div', { class: 'cg-titulo-seccion' }, el('h2', { text: 'Gestión' }), el('span', { text: 'Personas, catálogo y datos' })),
      el('div', { class: 'cg-acciones' }, otros.filter(m => !m.dia).map(m => atajo(m)))));
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
  editar_habitual_dia: 'Editar día del habitual', hoy_no_pedir: 'Hoy no pedir', anular_pedido_fecha: 'Volver al habitual / cancelar pedido',
  solicitar_extra: 'Cargar extra', aprobar_extra: 'Aprobar extra', rechazar_extra: 'Rechazar extra', registrar_entrega: 'Registrar entrega', recuperar_finanzas_extra: 'Generar cargo del extra', cancelar_extra: 'Cancelar extra',
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
