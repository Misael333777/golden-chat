// Admin Finanzas → Cuentas financieras (cuentas_financieras). Listar, crear, activar y desactivar.
// El saldo se deriva de los movimientos (nunca se guarda). Una cuenta con saldo distinto de cero no se puede desactivar (lo valida el backend).
import { el, montar } from '../../ui.js';
import { pesos, fmtFecha, cabecera, tabla, vacio, leer, operacion, campo, entrada, importeInput, fechaInput, textoArea, selector, numero, texto, conOpcionales,
  resumenOp, filaDato, TIPO_CUENTA_TXT } from './comun.js';

export function vistaCuentas(ctx, cont) {
  const bNueva = el('button', { type: 'button', class: 'btn btn-gold', id: 'btn-nueva-cuenta', onclick: () => nuevaCuenta(ctx) }, 'Nueva cuenta');
  const cuerpo = el('div', { class: 'stack', id: 'cf-lista', 'data-estado': 'cargando' });
  montar(cont, cabecera('Cuentas financieras', 'Dónde está el dinero: caja, banco, billeteras. El saldo se calcula desde los movimientos registrados.', bNueva), cuerpo);
  leer(ctx, cuerpo, 'cuentas_financieras', {}, (d) => {
    const l = d.cuentas || [];
    montar(cuerpo,
      !l.length ? vacio('Todavía no hay cuentas financieras.') : tabla(['Cuenta', 'Tipo', 'Saldo', 'Estado', 'Acción'], l.map(c => {
        const b = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': c.activa ? 'desactivar-cuenta' : 'activar-cuenta' }, c.activa ? 'Desactivar' : 'Activar');
        b.addEventListener('click', () => cambiarEstado(ctx, c));
        return { dataset: { cuenta: c.cuenta_id, activa: String(!!c.activa) }, celdas: [
          el('span', null, c.nombre, c.alerta ? el('span', { class: 'chip off', text: 'Revisar' }) : null),
          TIPO_CUENTA_TXT[c.tipo_cuenta] || c.tipo_cuenta, pesos(c.saldo),
          el('span', { class: 'chip ' + (c.activa ? 'ok' : 'off'), text: c.activa ? 'Activa' : 'Inactiva' }), b] };
      }), 'cf-cuentas'),
      el('p', { class: 'muted small', text: 'Saldo = saldo inicial + entradas − salidas. Para desactivar una cuenta primero transferí su saldo a otra.' }));
  });
}

function nuevaCuenta(ctx) {
  const iNom = entrada('cf-nombre', { maxlength: '60', placeholder: 'Caja chica' });
  const sTipo = selector('cf-tipo', Object.entries(TIPO_CUENTA_TXT));
  const iSaldo = importeInput('cf-saldo', 0);
  const iFecha = fechaInput('cf-fecha');
  const iObs = textoArea('cf-obs', 500);
  operacion(ctx, {
    id: 'op-cuenta', titulo: 'Nueva cuenta financiera', prev: 'previsualizar_cuenta', reg: 'registrar_cuenta',
    form: el('div', { class: 'form-grid two' }, campo('cf-nombre', 'Nombre', iNom), campo('cf-tipo', 'Tipo', sTipo),
      campo('cf-saldo', 'Saldo inicial', iSaldo), campo('cf-fecha', 'Fecha del saldo inicial', iFecha), campo('cf-obs', 'Observación (opcional)', iObs)),
    datos: () => {
      const si = numero(iSaldo.value);
      if (Number.isNaN(si)) return { __error: 'El saldo inicial no es un número válido.' };
      return conOpcionales({ nombre: iNom.value, tipo_cuenta: sTipo.value, saldo_inicial: si === null ? 0 : si, fecha: iFecha.value }, { observacion: texto(iObs.value) });
    },
    resumen: (d) => { const c = d.cuenta || {}; return resumenOp([filaDato('Nombre', c.nombre, 'nombre'), filaDato('Tipo', TIPO_CUENTA_TXT[c.tipo_cuenta] || c.tipo_cuenta),
      filaDato('Saldo inicial', pesos(c.saldo_inicial), 'saldo_inicial'), filaDato('Desde', fmtFecha(c.fecha_saldo_inicial))]); },
    ok: () => ctx.ir('#/finanzas/cuentas'),
  });
}

function cambiarEstado(ctx, c) {
  const activa = !c.activa;
  const iObs = textoArea('cf-estado-obs', 500);
  operacion(ctx, {
    id: 'op-estado-cuenta', titulo: (activa ? 'Activar' : 'Desactivar') + ' cuenta', prev: 'previsualizar_estado_cuenta', reg: 'registrar_estado_cuenta',
    form: el('div', { class: 'stack' }, el('p', { text: c.nombre + ' · saldo ' + pesos(c.saldo) }), campo('cf-estado-obs', 'Observación (opcional)', iObs)),
    datos: () => conOpcionales({ cuenta_id: c.cuenta_id, activa }, { observacion: texto(iObs.value) }),
    resumen: (d) => { const k = d.cuenta || {}; return resumenOp([filaDato('Cuenta', k.nombre || c.nombre), filaDato('Saldo', pesos(k.saldo ?? c.saldo)),
      filaDato('Nuevo estado', activa ? 'Activa' : 'Inactiva', 'estado')], activa ? null : 'Una cuenta inactiva no recibe ni entrega dinero. Su historial se conserva.'); },
    textoConfirmar: activa ? 'Activar cuenta' : 'Desactivar cuenta',
    ok: () => ctx.ir('#/finanzas/cuentas'),
  });
}
