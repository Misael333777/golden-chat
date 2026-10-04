// Admin Finanzas → Cobros, Gastos y Transferencias. Cada escritura: previsualizar → confirmar → registrar (mismo operacion_id).
// Cobro: entra dinero a una cuenta y baja la cuenta corriente de la persona (Cuenta Corriente Escrituras PROD).
// Gasto: sale dinero de una cuenta; impacta el resultado. La categoría 'empleado' no existe acá: los sueldos van por Cuentas por pagar.
// Transferencia: mismo importe sale de origen y entra en destino; no es ingreso ni gasto (no cambia el resultado neto).
import { el, montar, conBloqueo } from '../../ui.js';
import { pesos, fmtFecha, cabecera, tabla, vacio, leer, operacion, campo, entrada, importeInput, fechaInput, textoArea, selector, numero, texto, conOpcionales,
  resumenOp, filaDato, cuentasActivas, opcionesCuentas, CATEGORIA_TXT, TIPO } from './comun.js';

const CATEGORIAS_GASTO = ['proveedor', 'servicio', 'alquiler', 'impuesto', 'otro'];

function recientes(ctx, zona, tipo, vacioTxt) {
  leer(ctx, zona, 'movimientos', { tipo_movimiento: tipo }, (d) => {
    const l = d.items || [];
    montar(zona, el('h3', { text: 'Del mes en curso' }),
      !l.length ? vacio(vacioTxt) : tabla(['Concepto', 'Fecha', 'Cuenta', 'Persona', 'Importe'], l.map(m => ({ dataset: { mov: m.id },
        celdas: [m.concepto || m.categoria || '—', fmtFecha(m.fecha), [m.cuenta_origen, m.cuenta_destino].filter(Boolean).join(' → ') || '—', m.persona || '—', pesos(m.importe)] })), 'mov-' + tipo),
      d.total > l.length ? el('a', { class: 'btn btn-ghost btn-sm', href: '#/finanzas/movimientos' }, 'Ver todos en Movimientos') : null);
  });
}
const lanzar = (id, txt, fn) => { const b = el('button', { type: 'button', class: 'btn btn-gold', id }, txt); b.addEventListener('click', conBloqueo(b, fn, 'Abriendo…')); return b; };

// ======================= COBROS =======================
export function vistaCobros(ctx, cont) {
  const zona = el('div', { class: 'stack', id: 'cobros-lista', 'data-estado': 'cargando' });
  montar(cont, cabecera('Cobros', 'Dinero que entra de clientes y repartidores. Baja la deuda de su cuenta corriente.', lanzar('btn-nuevo-cobro', 'Nuevo cobro', () => nuevoCobro(ctx))), zona);
  recientes(ctx, zona, 'cobro', 'Todavía no hay cobros este mes.');
}
// persona = { persona_id, nombre } opcional (desde la ficha de Cuentas por cobrar).
export async function nuevoCobro(ctx, persona, alTerminar) {
  const cuentas = await cuentasActivas(ctx); if (!cuentas) return;
  let elegida = persona || null;
  const zPersona = el('div', { class: 'stack', id: 'cb-persona' });
  const iBus = entrada('cb-buscar', { type: 'search', maxlength: '60', placeholder: 'Nombre…' });
  const zRes = el('div', { class: 'stack', id: 'cb-resultados' });
  const pintarPersona = () => montar(zPersona, elegida
    ? el('div', { class: 'row', 'data-persona-elegida': elegida.persona_id }, el('strong', { text: elegida.nombre }), el('span', { class: 'spacer' }),
      persona ? null : el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'cambiar-persona', onclick: () => { elegida = null; pintarPersona(); } }, 'Cambiar'))
    : el('div', { class: 'stack' }, campo('cb-buscar', 'Persona', el('div', { class: 'row' }, iBus, bBus)), zRes));
  const bBus = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'cb-btn-buscar' }, 'Buscar');
  bBus.addEventListener('click', conBloqueo(bBus, async () => {
    const res = await ctx.pedir(TIPO, 'buscar_personas', { texto: iBus.value });
    if (res.falla) return montar(zRes, el('p', { class: 'notice error', text: 'No pudimos buscar. Reintentá.' }));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(zRes, el('p', { class: 'notice error', 'data-codigo': res.r.codigo, text: res.r.codigo === 'FILTRO_INVALIDO' ? 'Escribí al menos 2 letras.' : (res.r.mensaje || 'No se pudo buscar.') }));
    const l = (res.r.datos || {}).personas || [];
    montar(zRes, !l.length ? el('p', { class: 'muted small', text: 'Sin resultados con cuenta de cliente o repartidor.' })
      : el('div', { class: 'list' }, l.map(p => el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-elegir-persona': p.persona_id,
        onclick: () => { elegida = { persona_id: p.persona_id, nombre: p.nombre }; pintarPersona(); } }, p.nombre + ' · ' + (p.roles || []).join(', ')))));
  }, 'Buscando…'));
  iBus.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); bBus.click(); } });
  pintarPersona();
  const iImp = importeInput('cb-importe');
  const sCta = selector('cb-cuenta', opcionesCuentas(cuentas));
  const iObs = textoArea('cb-obs', 500);
  operacion(ctx, {
    id: 'op-cobro', titulo: 'Nuevo cobro', prev: 'previsualizar_cobro', reg: 'registrar_cobro',
    form: el('div', { class: 'stack' }, zPersona, el('div', { class: 'form-grid two' }, campo('cb-importe', 'Importe', iImp), campo('cb-cuenta', 'Entra en la cuenta', sCta)),
      campo('cb-obs', 'Observación (opcional)', iObs)),
    datos: () => {
      if (!elegida) return { __error: 'Elegí la persona que paga.' };
      const imp = numero(iImp.value); if (!(imp > 0)) return { __error: 'Ingresá un importe mayor a 0.' };
      return conOpcionales({ persona_id: elegida.persona_id, importe: imp, cuenta_financiera_id: sCta.value }, { observacion: texto(iObs.value) });
    },
    resumen: (d) => resumenOp([filaDato('Persona', elegida && elegida.nombre), filaDato('Importe', pesos(d.importe_pago), 'importe'), filaDato('Entra en', (d.cuenta_financiera || {}).nombre),
      filaDato('Debe hoy', pesos(d.falta_pagar_actual), 'falta_actual'), filaDato('Debe después', pesos(d.falta_pagar_proyectado), 'falta_despues'),
      d.saldo_a_favor_proyectado > 0 ? filaDato('Saldo a favor después', pesos(d.saldo_a_favor_proyectado), 'a_favor_despues') : null], d.advertencia),
    ok: () => alTerminar ? alTerminar() : ctx.ir('#/finanzas/cobros'),
  });
}

// ======================= GASTOS =======================
export function vistaGastos(ctx, cont) {
  const zona = el('div', { class: 'stack', id: 'gastos-lista', 'data-estado': 'cargando' });
  montar(cont, cabecera('Gastos', 'Dinero que sale por un gasto. Impacta el resultado. Los sueldos se cargan y pagan desde Cuentas por pagar.', lanzar('btn-nuevo-gasto', 'Nuevo gasto', () => nuevoGasto(ctx))), zona);
  recientes(ctx, zona, 'gasto', 'Todavía no hay gastos este mes.');
}
async function nuevoGasto(ctx) {
  const cuentas = await cuentasActivas(ctx); if (!cuentas) return;
  const sCat = selector('gs-categoria', CATEGORIAS_GASTO.map(k => [k, CATEGORIA_TXT[k]]));
  const iCon = entrada('gs-concepto', { maxlength: '120' });
  const iBen = entrada('gs-beneficiario', { maxlength: '80' });
  const iImp = importeInput('gs-importe');
  const sCta = selector('gs-cuenta', opcionesCuentas(cuentas));
  const iFec = fechaInput('gs-fecha');
  const iObs = textoArea('gs-obs', 500);
  operacion(ctx, {
    id: 'op-gasto', titulo: 'Nuevo gasto', prev: 'previsualizar_gasto', reg: 'registrar_gasto',
    form: el('div', { class: 'stack' }, el('div', { class: 'form-grid two' }, campo('gs-categoria', 'Categoría', sCat), campo('gs-concepto', 'Concepto', iCon),
      campo('gs-beneficiario', 'A quién se pagó (opcional)', iBen), campo('gs-importe', 'Importe', iImp), campo('gs-cuenta', 'Sale de la cuenta', sCta), campo('gs-fecha', 'Fecha', iFec)),
      campo('gs-obs', 'Observación (opcional)', iObs)),
    datos: () => {
      const imp = numero(iImp.value); if (!(imp > 0)) return { __error: 'Ingresá un importe mayor a 0.' };
      return conOpcionales({ categoria: sCat.value, concepto: iCon.value, importe: imp, cuenta_financiera_id: sCta.value, fecha: iFec.value }, { beneficiario: texto(iBen.value), observacion: texto(iObs.value) });
    },
    resumen: (d) => resumenOp([filaDato('Concepto', d.concepto), filaDato('Categoría', CATEGORIA_TXT[d.categoria] || d.categoria), filaDato('Importe', pesos(d.importe), 'importe'),
      filaDato('Sale de', (d.cuenta || {}).nombre), filaDato('Saldo de la cuenta después', pesos(d.saldo_cuenta_proyectado), 'saldo_despues'), filaDato('Fecha', fmtFecha(d.fecha))], d.advertencia),
    ok: () => ctx.ir('#/finanzas/gastos'),
  });
}

// ======================= TRANSFERENCIAS =======================
export function vistaTransferencias(ctx, cont) {
  const zona = el('div', { class: 'stack', id: 'transf-lista', 'data-estado': 'cargando' });
  montar(cont, cabecera('Transferencias', 'Mover dinero entre cuentas propias. No es ingreso ni gasto: el resultado neto no cambia.', lanzar('btn-nueva-transferencia', 'Nueva transferencia', () => nuevaTransferencia(ctx))), zona);
  recientes(ctx, zona, 'transferencia', 'Todavía no hay transferencias este mes.');
}
async function nuevaTransferencia(ctx) {
  const cuentas = await cuentasActivas(ctx); if (!cuentas) return;
  const sOri = selector('tr-origen', opcionesCuentas(cuentas));
  const sDes = selector('tr-destino', opcionesCuentas(cuentas), cuentas.length > 1 ? cuentas[1].cuenta_id : undefined);
  const iImp = importeInput('tr-importe');
  const iFec = fechaInput('tr-fecha');
  const iObs = textoArea('tr-obs', 500);
  operacion(ctx, {
    id: 'op-transferencia', titulo: 'Nueva transferencia', prev: 'previsualizar_transferencia', reg: 'registrar_transferencia',
    form: el('div', { class: 'stack' }, el('div', { class: 'form-grid two' }, campo('tr-origen', 'Sale de', sOri), campo('tr-destino', 'Entra en', sDes),
      campo('tr-importe', 'Importe', iImp), campo('tr-fecha', 'Fecha', iFec)), campo('tr-obs', 'Observación (opcional)', iObs)),
    datos: () => {
      if (sOri.value === sDes.value) return { __error: 'La cuenta de origen y la de destino tienen que ser distintas.' };
      const imp = numero(iImp.value); if (!(imp > 0)) return { __error: 'Ingresá un importe mayor a 0.' };
      return conOpcionales({ cuenta_origen_id: sOri.value, cuenta_destino_id: sDes.value, importe: imp, fecha: iFec.value }, { observacion: texto(iObs.value) });
    },
    resumen: (d) => resumenOp([filaDato('Importe', pesos(d.importe), 'importe'),
      filaDato('Sale de', (d.cuenta_origen || {}).nombre + ' · queda ' + pesos(d.saldo_origen_proyectado), 'origen'),
      filaDato('Entra en', (d.cuenta_destino || {}).nombre + ' · queda ' + pesos(d.saldo_destino_proyectado), 'destino'), filaDato('Fecha', fmtFecha(d.fecha))],
      'No es ingreso ni gasto: el resultado neto no cambia.'),
    ok: () => ctx.ir('#/finanzas/transferencias'),
  });
}
