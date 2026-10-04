// Admin Finanzas: utilidades de presentación compartidas. Los importes y saldos los calcula SIEMPRE el backend; acá solo se formatean.
import { el, montar, modal, toast, aviso, conBloqueo } from '../../ui.js';
import { avisoFalla, avisoSinConfirmar } from '../admin/personas.js';
import * as ops from '../../ops.js';

export const TIPO = 'admin_finanzas';
const ARS = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pesos = (v) => (typeof v === 'number' && Number.isFinite(v) ? ARS.format(v) : '—');
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
export const fmtFecha = (f) => {
  if (FECHA_RE.test(f || '')) return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z'));
  const t = Date.parse(f || ''); return isNaN(t) ? '—' : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(t));
};
export const sinTilde = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Estado de la cuenta según el saldo que devuelve el backend (positivo = debe; negativo = a favor).
export const estadoCuenta = (saldo) => (saldo > 0 ? { k: 'debe', txt: 'Debe', chip: 'warn' } : saldo < 0 ? { k: 'a_favor', txt: 'Saldo a favor', chip: 'ok' } : { k: 'al_dia', txt: 'Al día', chip: '' });
export const tile = (label, valor, attr) => el('div', { class: 'precio-tile prd-tile', 'data-tile': attr || label }, el('span', { class: 'precio-label', text: label }), el('span', { class: 'precio-valor', text: valor }));
export const cabecera = (titulo, sub, extra) => el('div', { class: 'card stack section-card' }, el('div', { class: 'card-head' },
  el('div', null, el('h2', { class: 'section-title', text: titulo }), el('p', { class: 'card-sub', text: sub })), extra ? el('span', { class: 'spacer' }) : null, extra || null));
export const tabla = (cols, filas, id) => el('div', { class: 'tabla rep-tabla', id }, el('div', { class: 'rep-fila rep-head rep-c' + cols.length }, cols.map(c => el('span', { text: c }))),
  filas.map(f => el('div', { class: 'rep-fila rep-c' + cols.length, dataset: f.dataset || {} }, f.celdas.map((v, i) => el('span', { 'data-col': cols[i] }, el('span', { class: 'pc-label', text: cols[i] + ': ' }),
    v === null || v === undefined ? '—' : (v instanceof Node ? v : String(v)))))));
export const vacio = (texto) => el('div', { class: 'card empty', 'data-vacio': 'true' }, el('span', { class: 'empty-ico', 'aria-hidden': 'true' }), el('p', { text: texto }));
// Lectura estándar: carga → falla de red (reintentar) → fin de sesión → rechazo del backend → pintar.
export async function leer(ctx, zona, accion, campos, pintar) {
  zona.dataset.estado = 'cargando';
  montar(zona, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
  const res = await ctx.pedir(TIPO, accion, campos || {});
  if (!zona.isConnected) return;
  zona.dataset.estado = 'listo';
  if (res.falla) return montar(zona, avisoFalla(res.falla, () => leer(ctx, zona, accion, campos, pintar)));
  if (ctx.revisarFinSesion(res.r)) return;
  if (!res.r.success) return montar(zona, el('div', { class: 'notice error', role: 'alert', 'data-codigo': res.r.codigo }, res.r.mensaje || 'No se pudo leer la información.', el('span', { class: 'code', text: res.r.codigo })));
  pintar(res.r.datos || {});
}

// ======================= ESCRITURAS: previsualizar → confirmar → registrar =======================
// Reglas: el actor lo pone la Web API desde la sesión; la página solo envía los campos de negocio de la whitelist.
// La previsualización y el registro usan el MISMO operacion_id (ops.operacionPara). Doble click: botones bloqueados mientras hay envío.
// OPERACION_EN_CURSO (candado financiero ocupado): no se escribió nada → reintento automático con el MISMO operacion_id; si sigue ocupado,
// la operación queda "sin confirmar" (aviso en el panel) y se reintenta con el mismo id. Nunca se genera un id nuevo para reintentar.

export const hoyART = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
export const campo = (id, label, input, hint) => el('div', { class: 'field' }, el('label', { for: id, text: label }), input, hint ? el('span', { class: 'hint', text: hint }) : null);
export const entrada = (id, attrs) => el('input', Object.assign({ class: 'input', id, autocomplete: 'off' }, attrs || {}));
export const importeInput = (id, valor) => { const i = entrada(id, { type: 'number', min: '0', step: '0.01', inputmode: 'decimal' }); if (valor !== undefined && valor !== null) i.value = String(valor); return i; };
export const fechaInput = (id, valor) => { const i = entrada(id, { type: 'date', max: hoyART() }); i.value = valor || hoyART(); return i; };
export const textoArea = (id, max, placeholder) => el('textarea', { class: 'input', id, maxlength: String(max || 500), rows: '3', placeholder: placeholder || null });
export const selector = (id, opciones, valor) => { const s = el('select', { class: 'select', id }, opciones.map(([v, t]) => el('option', { value: v, text: t }))); if (valor !== undefined) s.value = valor; return s; };
export const numero = (v) => { const t = String(v == null ? '' : v).trim(); if (t === '') return null; const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN; };
export const texto = (v) => { const t = String(v == null ? '' : v).trim(); return t === '' ? null : t; };
// Agrega a 'campos' solo los opcionales con valor (no se envían vacíos).
export const conOpcionales = (campos, extra) => { for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined && v !== '') campos[k] = v; return campos; };
export const filaDato = (label, valor, attr) => el('div', { class: 'rep-fila rep-c2 op-dato', 'data-dato': attr || null }, el('span', { text: label }), el('span', { text: valor === null || valor === undefined ? '—' : String(valor) }));
export const resumenOp = (filas, nota) => el('div', { class: 'stack', 'data-resumen-op': 'true' }, el('div', { class: 'tabla rep-tabla op-resumen' }, filas.filter(Boolean)), nota ? el('p', { class: 'muted small', text: nota }) : null);
export const TIPO_CUENTA_TXT = { efectivo: 'Efectivo', banco: 'Banco', billetera: 'Billetera virtual', otro: 'Otro' };
export const CATEGORIA_TXT = { proveedor: 'Proveedor', servicio: 'Servicio', alquiler: 'Alquiler', impuesto: 'Impuesto', otro: 'Otro', empleado: 'Sueldos' };
export const PERIODICIDAD_TXT = { diario: 'Diario', semanal: 'Semanal', mensual: 'Mensual' };

const MSJ = { CUENTA_CON_SALDO: 'La cuenta tiene saldo distinto de cero: primero transferí el saldo a otra cuenta.', SALDO_INSUFICIENTE: 'La cuenta de origen no tiene saldo suficiente.',
  IMPORTE_SUPERA_SALDO: 'El importe supera el saldo pendiente.', DEUDA_PAGADA: 'La deuda ya está pagada.', DEUDA_CON_PAGOS: 'La deuda tiene pagos registrados: no se puede anular.',
  DEUDA_ANULADA: 'La deuda está anulada.', CATEGORIA_NO_HABILITADA: 'Los sueldos y adelantos se cargan desde Cuentas por pagar → Sueldos.', NOMBRE_DUPLICADO: 'Ya existe una cuenta con ese nombre.',
  CUENTA_FINANCIERA_NO_HABILITADA: 'La cuenta financiera está inactiva.', OBLIGACION_EXISTENTE: 'Ya existe el sueldo de ese empleado para ese período.',
  SIN_SUELDO_VIGENTE: 'El empleado no tiene un sueldo vigente al inicio del período: cargá primero el sueldo.', ADELANTO_SOLO_SUELDO: 'Los adelantos solo se aplican a sueldos.',
  EMPLEADO_DUPLICADO: 'Ya existe un empleado con ese nombre e identificación.', MOVIMIENTO_YA_REVERTIDO: 'El movimiento ya fue revertido.',
  MOVIMIENTO_NO_REVERSIBLE: 'Este tipo de movimiento no se puede revertir.', COLA_NO_PENDIENTE: 'El extra ya no está pendiente.' };
export const avisoFin = (r) => el('div', { class: 'notice ' + (r.success ? 'ok' : 'error'), role: r.success ? 'status' : 'alert', 'data-codigo': r.codigo },
  MSJ[r.codigo] || r.mensaje || (r.success ? 'Listo.' : 'No se pudo completar la operación.'), el('span', { class: 'code', text: r.codigo }));
const espera = (ms) => new Promise(res => setTimeout(res, ms));

// Cuentas financieras ACTIVAS para elegir de dónde sale / a dónde entra el dinero.
export async function cuentasActivas(ctx) {
  const res = await ctx.pedir(TIPO, 'cuentas_financieras', {});
  if (res.falla) { toast(TEXTO_RED); return null; }
  if (ctx.revisarFinSesion(res.r)) return null;
  if (!res.r.success) { toast(res.r.mensaje || 'No se pudieron leer las cuentas.'); return null; }
  const l = ((res.r.datos || {}).cuentas || []).filter(c => c.activa === true);
  if (!l.length) { toast('No hay cuentas financieras activas.'); return null; }
  return l;
}
const TEXTO_RED = 'No pudimos conectar con Golden. Reintentá.';
export const opcionesCuentas = (l) => l.map(c => [c.cuenta_id, c.nombre + ' · ' + pesos(c.saldo)]);

// o = { id, titulo, form, datos() -> campos | { __error }, prev?, reg, resumen?(d, campos) -> Node, textoConfirmar?, confirmacion?, ok?(r) }
export function operacion(ctx, o) {
  const zona = el('div', { class: 'stack', id: o.id + '-aviso' });
  const bRev = el('button', { type: 'submit', class: 'btn btn-primary', id: o.id + '-revisar' }, o.prev ? 'Revisar' : (o.textoConfirmar || 'Confirmar'));
  const paso1 = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' }, o.form, o.confirmacion ? el('p', { class: 'muted small', text: o.confirmacion }) : null, bRev);
  const paso2 = el('div', { class: 'stack', id: o.id + '-confirmar', hidden: true });
  const caja = el('div', { class: 'stack', id: o.id, 'data-paso': 'datos' }, paso1, paso2, zona);
  const m = modal(o.titulo, caja);
  let campos = null;
  const verPaso = (p) => { caja.dataset.paso = p; paso1.hidden = p !== 'datos'; paso2.hidden = p !== 'confirmar'; };
  paso1.addEventListener('submit', conBloqueo(bRev, async () => {
    montar(zona);
    const c = o.datos();
    if (!c || c.__error) return montar(zona, aviso('error', (c && c.__error) || 'Revisá los datos.', 'DATOS_INCOMPLETOS'));
    campos = c;
    if (!o.prev) return registrar();
    const res = await ctx.pedir(TIPO, o.prev, Object.assign({}, campos, { operacion_id: ops.operacionPara(o.reg, campos) }));
    if (!caja.isConnected) return;
    if (res.falla) return montar(zona, avisoFalla(res.falla));
    if (ctx.revisarFinSesion(res.r)) return m.cerrar();
    const incompleta = !res.r.success && res.r.codigo === 'OPERACION_INCOMPLETA'; // el dinero ya salió: confirmar completa el registro
    if (!res.r.success && !incompleta) return montar(zona, avisoFin(res.r));
    if (res.r.codigo === 'OPERACION_YA_PROCESADA') { montar(zona, avisoFin(res.r)); if (o.ok) o.ok(res.r); return; }
    const bConf = el('button', { type: 'button', class: 'btn btn-gold', id: o.id + '-registrar' }, incompleta ? 'Completar registro' : (o.textoConfirmar || 'Confirmar y registrar'));
    bConf.addEventListener('click', conBloqueo(bConf, registrar, 'Registrando…'));
    montar(paso2, incompleta ? avisoFin(res.r) : null, o.resumen ? o.resumen(res.r.datos || {}, campos) : null,
      el('p', { class: 'muted small', text: 'Revisá los datos. Todavía no se registró nada.' }),
      el('div', { class: 'row' }, bConf, el('button', { type: 'button', class: 'btn btn-ghost', id: o.id + '-volver', onclick: () => { montar(zona); verPaso('datos'); } }, 'Volver a editar')));
    verPaso('confirmar');
  }, o.prev ? 'Revisando…' : 'Registrando…'));
  async function registrar() {
    for (let intento = 0; ; intento++) {
      const res = await ops.ejecutar(ctx.base(TIPO), o.reg, campos);
      if (!caja.isConnected) return;
      if (res.sinConfirmar) return montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, registrar, () => { ops.descartar(o.reg, campos); m.cerrar(); }));
      if (ctx.revisarFinSesion(res.r)) return m.cerrar();
      if (res.r.codigo === 'OPERACION_EN_CURSO') {
        if (intento < 2) { montar(zona, el('div', { class: 'notice pending', role: 'status', 'data-codigo': 'OPERACION_EN_CURSO', 'data-reintento': String(intento + 1) }, 'Hay otra operación financiera en curso. Reintentando la misma operación…')); await espera(1200 * (intento + 1)); if (!caja.isConnected) return; continue; }
        return montar(zona, el('div', { class: 'stack', 'data-en-curso': 'true' }, avisoSinConfirmar('EN_CURSO', res.operacion_id, registrar, () => { ops.descartar(o.reg, campos); m.cerrar(); })));
      }
      if (!res.r.success) return montar(zona, avisoFin(res.r));
      m.cerrar();
      toast(res.r.codigo === 'OPERACION_YA_PROCESADA' ? 'La operación ya estaba registrada. No se duplicó.' : (res.r.mensaje || 'Operación registrada.'));
      if (o.ok) o.ok(res.r);
      return;
    }
  }
  return m;
}
