// Admin Finanzas → Configuración (solo lectura en v1). Muestra las reglas vigentes del backend PROD y las cuentas configuradas.
// No hay acciones: categorías, tipos de cuenta y periodicidades están fijados en Escrituras PROD.
import { el, montar } from '../../ui.js';
import { pesos, cabecera, tabla, vacio, leer, resumenOp, filaDato, TIPO_CUENTA_TXT, CATEGORIA_TXT, PERIODICIDAD_TXT } from './comun.js';

export function vistaConfiguracion(ctx, cont) {
  const zona = el('div', { class: 'stack', id: 'cfg-cuentas', 'data-estado': 'cargando' });
  montar(cont, cabecera('Configuración', 'Reglas financieras vigentes. Solo lectura.'),
    el('div', { class: 'card stack section-card', id: 'cfg-reglas' },
      resumenOp([
        filaDato('Categorías de gasto', ['proveedor', 'servicio', 'alquiler', 'impuesto', 'otro'].map(k => CATEGORIA_TXT[k]).join(', '), 'categorias'),
        filaDato('Tipos de cuenta', Object.values(TIPO_CUENTA_TXT).join(', '), 'tipos_cuenta'),
        filaDato('Periodicidad de sueldos', Object.values(PERIODICIDAD_TXT).join(', '), 'periodicidades'),
        filaDato('Moneda', 'ARS'),
        filaDato('Desactivar cuentas', 'Solo con saldo cero'),
        filaDato('Transferencias', 'No son ingreso ni gasto'),
        filaDato('Sueldos', 'Se cargan a mano por período en Cuentas por pagar; se registran como gasto al pagarse (adelantos y pagos)'),
        filaDato('Correcciones', 'Nunca se borra ni se edita un movimiento: se agrega una reversión, un ajuste o una anulación'),
      ])),
    el('h3', { text: 'Cuentas configuradas' }), zona);
  leer(ctx, zona, 'cuentas_financieras', {}, (d) => {
    const l = d.cuentas || [];
    montar(zona, !l.length ? vacio('No hay cuentas.') : tabla(['Cuenta', 'Tipo', 'Saldo inicial', 'Estado'], l.map(c => ({ dataset: { cuenta: c.cuenta_id },
      celdas: [c.nombre, TIPO_CUENTA_TXT[c.tipo_cuenta] || c.tipo_cuenta, pesos(c.saldo_inicial), c.activa ? 'Activa' : 'Inactiva'] })), 'cfg-lista'),
      el('a', { class: 'btn btn-ghost btn-sm', href: '#/finanzas/cuentas' }, 'Administrar cuentas'));
  });
}
