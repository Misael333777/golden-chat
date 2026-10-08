// Panel Admin Finanzas. Mismo marco visual que Admin General (assets/js/marco.js). Las 11 secciones tienen backend real (Web API PROD →
// Consultas / Escrituras PROD). Escrituras: previsualizar → confirmar → registrar, con operacion_id idempotente y reintento seguro.
import { el, montar, conBloqueo } from '../../ui.js';
import * as ops from '../../ops.js';
import { marco } from '../../marco.js';
import { TIPO, avisoFin } from './comun.js';
import { vistaInicio } from './inicio.js';
import { vistaCuentas } from './cuentas.js';
import { vistaCobros, vistaGastos, vistaTransferencias } from './dinero.js';
import { vistaCobrar, vistaCuenta } from './cobrar.js';
import { vistaPagar } from './pagar.js';
import { vistaExtras } from './extras.js';
import { vistaMovimientos } from './movimientos.js';
import { vistaPendientesFin } from './pendientes.js';
import { vistaConfiguracion } from './configuracion.js';

const MENU = [
  { id: 'inicio', txt: 'Inicio' }, { id: 'cuentas', txt: 'Cuentas financieras' }, { id: 'cobros', txt: 'Cobros' }, { id: 'gastos', txt: 'Gastos' },
  { id: 'transferencias', txt: 'Transferencias' }, { id: 'cobrar', txt: 'Cuentas por cobrar' }, { id: 'pagar', txt: 'Cuentas por pagar' }, { id: 'extras', txt: 'Extras' },
  { id: 'movimientos', txt: 'Movimientos' }, { id: 'pendientes', txt: 'Pendientes' }, { id: 'configuracion', txt: 'Configuración' },
];

// Presentación del menú (ícono y subtítulo) para el marco compartido. No cambia secciones ni rutas.
const PRESENTACION = {
  inicio: { ico: 'inicio', sub: 'Resumen del día', corto: 'Inicio', tab: true },
  cuentas: { ico: 'banco', sub: 'Bancos y cajas' },
  cobros: { ico: 'entrada', sub: 'Lo que ingresa', corto: 'Cobros', tab: true },
  gastos: { ico: 'salida', sub: 'Lo que sale', corto: 'Gastos', tab: true },
  transferencias: { ico: 'cambiar', sub: 'Entre cuentas' },
  cobrar: { ico: 'personas', sub: 'Saldos de clientes', corto: 'Cobrar', tab: true },
  pagar: { ico: 'documento', sub: 'Deudas y sueldos' },
  extras: { ico: 'mas', sub: 'Cargos de extras' },
  movimientos: { ico: 'pedidos', sub: 'Historial de dinero' },
  pendientes: { ico: 'alerta', sub: 'Revisiones abiertas' },
  configuracion: { ico: 'ajustes', sub: 'Ajustes de finanzas' },
};

export function vistaFinanzas(ctx, partes) {
  const sec = partes[0] || 'inicio';
  if (!MENU.some(m => m.id === sec)) return ctx.ir('#/finanzas/inicio');
  const nav = MENU.map(m => Object.assign({}, m, PRESENTACION[m.id]));
  const avisos = el('div', { class: 'stack', id: 'fin-pendientes-ops' });
  const contenido = el('section', { class: 'stack', id: 'finanzas-contenido' });
  marco(ctx, { panel: 'finanzas', base: '#/finanzas', nav, grupo: nav.find(m => m.id === sec), sec, prefijo: 'fin-', zonas: [avisos], contenido,
    etiqueta: 'Admin Finanzas', rolTxt: 'Admin Finanzas', ariaMenu: 'Menú Admin Finanzas', extraClase: 'admin-page finanzas-page', pie: 'Las cuentas claras de Golden.' });
  pintarPendientes(ctx, avisos);
  if (ctx.flash) { const f = ctx.flash; ctx.flash = null; if (f.r) avisos.appendChild(avisoFin(f.r)); }
  const resto = partes.slice(1);
  if (sec === 'cuentas') return vistaCuentas(ctx, contenido);
  if (sec === 'cobros') return vistaCobros(ctx, contenido);
  if (sec === 'gastos') return vistaGastos(ctx, contenido);
  if (sec === 'transferencias') return vistaTransferencias(ctx, contenido);
  if (sec === 'cobrar') return resto[0] ? vistaCuenta(ctx, contenido, decodeURIComponent(resto[0])) : vistaCobrar(ctx, contenido);
  if (sec === 'pagar') return vistaPagar(ctx, contenido, resto);
  if (sec === 'extras') return vistaExtras(ctx, contenido);
  if (sec === 'movimientos') return vistaMovimientos(ctx, contenido);
  if (sec === 'pendientes') return vistaPendientesFin(ctx, contenido);
  if (sec === 'configuracion') return vistaConfiguracion(ctx, contenido);
  return vistaInicio(ctx, contenido);
}

// Operaciones financieras que quedaron sin confirmar (red caída, candado ocupado): se reintentan con el MISMO operacion_id.
const ACC_TXT = { registrar_cobro: 'Cobro', registrar_ajuste: 'Ajuste', revertir_movimiento: 'Reversión', registrar_extra: 'Extra', registrar_cuenta: 'Nueva cuenta',
  registrar_estado_cuenta: 'Estado de cuenta', registrar_gasto: 'Gasto', registrar_transferencia: 'Transferencia', registrar_deuda: 'Nueva deuda', registrar_pago_deuda: 'Pago de deuda',
  registrar_anular_deuda: 'Anular deuda', tomar_revision: 'Tomar revisión', terminar_revision: 'Terminar revisión', devolver_revision: 'Devolver revisión',
  registrar_empleado: 'Nuevo empleado', registrar_sueldo: 'Cambio de sueldo', registrar_obligacion_sueldo: 'Sueldo del período',
  baja_empleado: 'Baja de empleado', restaurar_empleado: 'Restaurar empleado' };
function describir(p) {
  const c = p.campos || {};
  return [ACC_TXT[p.accion] || p.accion, c.tipo_pago === 'adelanto' ? 'adelanto' : null, c.concepto || c.nombre || null,
    typeof c.importe === 'number' ? '$ ' + c.importe : (typeof c.importe_original === 'number' ? '$ ' + c.importe_original : null), c.periodo || null].filter(Boolean).join(' · ');
}
function pintarPendientes(ctx, zona) {
  const lista = ops.listar((acc, tipo) => tipo === 'admin_finanzas' && ops.ACCIONES_FINANZAS.includes(acc));
  if (!lista.length) return montar(zona);
  montar(zona, el('div', { class: 'notice pending stack', role: 'alert', 'data-pendientes-fin': String(lista.length) },
    el('strong', { text: 'Operaciones financieras sin confirmar' }),
    el('span', { text: 'No sabemos si se registraron (o había otra operación en curso). Reintentá la misma operación: si ya se había registrado, no se duplica.' }),
    lista.map(p => {
      const b = el('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-accion': 'reintentar-pendiente' }, 'Reintentar la misma operación');
      b.addEventListener('click', conBloqueo(b, async () => {
        if (!ops.hayPendiente(p.accion, p.campos)) return pintarPendientes(ctx, zona);
        const res = await ops.ejecutar(ctx.base(TIPO), p.accion, p.campos);
        if (res.r && ctx.revisarFinSesion(res.r)) return;
        ctx.flash = res.r ? { r: res.r } : null;
        ctx.ir(location.hash);
      }, 'Reintentando…'));
      return el('div', { class: 'row', 'data-pendiente': p.operacion_id, 'data-pendiente-accion': p.accion },
        el('span', { class: 'small', text: describir(p) }), el('span', { class: 'spacer' }), b,
        el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'descartar-pendiente', onclick: () => { ops.descartar(p.accion, p.campos); pintarPendientes(ctx, zona); } }, 'Descartar'));
    })));
}
