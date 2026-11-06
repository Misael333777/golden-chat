// Admin Finanzas → Cuentas por pagar → Sueldos (26/10). Liquidación mensual por jornada, copiada de la planilla firmada.
// - Por empleado: días trabajados (Liam: por tipo de jornada) y horas extra del mes.
// - Mercadería que se llevó (a precio mayorista) y adelantos (sale plata de una cuenta): se descuentan.
// - 06/11: Descuentos (por un fallo, etc.): se restan del sueldo, no mueven plata. Todo va al mes que se está mirando
//   (un adelanto del 4/11 cargado viendo octubre se descuenta de octubre).
// - Liquidar: arma el sueldo del mes y lo deja en Deudas para pagar (con los adelantos ya descontados).
// El backend (GOLDEN - Sueldos) valida y calcula todo; acá solo se muestra y se envía.
import * as ops from '../../ops.js';
import { el, montar, aviso, modal, confirmar, conBloqueo, toast } from '../../ui.js';
import { numero } from './comun.js';

const TIPO = 'admin_finanzas';
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const hoyART = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
const pesos = (v) => (typeof v === 'number' && Number.isFinite(v) ? money.format(v) : '—');
const fnum = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 100) / 100).replace('.', ',') : '0');
const ddmm = (f) => (FECHA_RE.test(f || '') ? f.slice(8, 10) + '/' + f.slice(5, 7) : '—');
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const nombreMes = (p) => (MES_RE.test(p || '') ? MESES[Number(p.slice(5, 7)) - 1] + ' ' + p.slice(0, 4) : p);
// Del 1 al 10 se liquida el mes que cerró: por defecto se muestra el mes anterior hasta el día 10.
const mesPorDefecto = () => { const h = hoyART(); const [y, m, d] = h.split('-').map(Number); if (d > 10) return h.slice(0, 7); const t = new Date(Date.UTC(y, m - 2, 1)); return t.toISOString().slice(0, 7); };
const leerNum = (v) => { const t = String(v == null ? '' : v).trim(); if (t === '') return 0; const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const errorDe = (r) => aviso('error', (r && r.mensaje) || 'No se pudo completar.', r && r.codigo);

export function vistaSueldos(ctx, cont) {
  const iMes = el('input', { class: 'input', id: 'sl-mes', type: 'month', value: mesPorDefecto(), max: hoyART().slice(0, 7) });
  const bVer = el('button', { type: 'button', class: 'btn btn-primary', id: 'sl-ver' }, 'Ver mes');
  const avisos = el('div', { class: 'stack', id: 'sl-aviso' });
  const cuerpo = el('div', { class: 'stack', id: 'sl-cuerpo' });
  montar(cont,
    el('div', { class: 'card stack' },
      el('div', { class: 'card-head' }, el('h2', { text: 'Sueldos del mes' })),
      el('p', { class: 'muted small', text: 'Cargá los días y horas extra de la planilla firmada, lo que se llevó cada uno, los adelantos y los descuentos. Todo se descuenta del mes que estás mirando. Del 1 al 10 liquidá el mes que cerró: queda como sueldo a pagar (botón Pagar).' }),
      el('div', { class: 'row' }, el('div', { class: 'field' }, el('label', { for: 'sl-mes', text: 'Mes' }), iMes), bVer)),
    avisos, cuerpo);
  let datos = null;

  async function cargar() {
    montar(avisos);
    if (!MES_RE.test(iMes.value)) return montar(avisos, aviso('error', 'Elegí un mes.'));
    montar(cuerpo, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
    const res = await ctx.pedir(TIPO, 'sueldos_mes', { periodo: iMes.value });
    if (res.falla) return montar(cuerpo, aviso('error', 'No pudimos conectar. Probá de nuevo.'));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(cuerpo, errorDe(res.r));
    datos = res.r.datos;
    pintar();
  }
  bVer.addEventListener('click', conBloqueo(bVer, cargar, 'Cargando…'));

  function pintar() {
    const d = datos;
    const lista = d.empleados || [];
    if (!lista.length) return montar(cuerpo, aviso('info', 'No hay empleados activos. Se cargan con "Nuevo empleado".'));
    montar(cuerpo,
      el('div', { class: 'card row', id: 'sl-resumen' }, el('strong', { text: nombreMes(d.periodo) }), el('span', { class: 'spacer' }),
        el('span', { text: 'Total a pagar: ' }), el('strong', { id: 'sl-total', text: pesos(d.totales && d.totales.a_pagar) })),
      lista.map(e => tarjetaEmpleado(e)));
  }

  function tarjetaEmpleado(e) {
    const t = e.totales || {};
    const liq = e.liquidado;
    const tarifa = !e.tarifa ? 'Sin sueldo cargado' : e.tarifa.tipo === 'jornadas'
      ? e.tarifa.tarifas.map(x => x.etiqueta + ' ' + pesos(x.importe)).join(' · ')
      : (e.tarifa.tipo === 'diario' ? pesos(e.tarifa.importe) + ' por día · hora extra ' + pesos(e.tarifa.hora_extra) : pesos(e.tarifa.importe) + ' (' + e.tarifa.tipo + ')');
    const trasladoTxt = e.traslado ? ' · traslado pan ' + pesos(e.traslado) + ' por día' : '';
    const a = e.asistencia || { dias: {}, horas_extra: {} };
    const jornadas = e.tarifa && e.tarifa.tipo === 'jornadas';
    const resumenDias = !a.cargada ? 'Sin cargar' : jornadas
      ? ['normal ' + fnum(a.dias.normal), '4 hs ' + fnum(a.dias.cuatro_horas), 'reparto ' + fnum(a.dias.reparto)].join(' · ') + ' · ' + fnum((a.horas_extra.normal || 0) + (a.horas_extra.reparto || 0)) + ' h extra'
      : fnum(a.dias.normal) + ' días · ' + fnum(a.horas_extra.normal) + ' h extra';
    const resumenTraslado = a.cargada && e.traslado ? ' · traslado pan ' + fnum(a.dias.traslado || 0) + ' días' : '';
    const b = (txt, cls, fn, id) => { const x = el('button', { type: 'button', class: 'btn btn-sm ' + cls, 'data-emp': e.empleado_id, id }, txt); x.addEventListener('click', fn); return x; };
    const pagar = liq && /^DEU-[0-9A-F]{16}$/.test(liq.deuda_id || '') ? el('a', { class: 'btn btn-sm btn-gold', href: '#/finanzas/pagar/deuda/' + liq.deuda_id, 'data-emp': e.empleado_id }, 'Pagar') : null;
    const acciones = liq ? [pagar, b('Imprimir', 'btn-ghost', () => imprimir(e, datos.periodo))]
      : [b('Cargar días', 'btn-primary', () => abrirDias(e), 'sl-dias-' + e.empleado_id), b('Se llevó', 'btn-ghost', () => abrirMercaderia(e)), b('Adelanto', 'btn-ghost', () => abrirAdelanto(e)), b('Descuento', 'btn-ghost', () => abrirDescuento(e), 'sl-desc-' + e.empleado_id),
        b('Liquidar', 'btn-gold', () => abrirLiquidar(e), 'sl-liq-' + e.empleado_id)];
    const filaNov = (txt, imp, id) => el('div', { class: 'row small' }, el('span', { text: txt }), el('span', { class: 'spacer' }), el('span', { text: '− ' + pesos(imp) }),
      liq ? null : (() => { const x = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-anular': id }, 'Anular'); x.addEventListener('click', () => anular(id, txt)); return x; })());
    return el('div', { class: 'card stack sl-emp', 'data-emp': e.empleado_id },
      el('div', { class: 'card-head' }, el('h3', { text: e.nombre }), el('span', { class: 'spacer' }),
        liq ? el('span', { class: 'chip ok', text: 'Liquidado ' + ddmm(liq.fecha) }) : null),
      el('p', { class: 'muted small', text: tarifa + trasladoTxt }),
      el('p', { class: 'small', text: 'Mes: ' + resumenDias + resumenTraslado }),
      (e.lineas || []).length ? el('div', { class: 'stack small' }, e.lineas.map(l => el('div', { class: 'row' }, el('span', { text: l.concepto + ' ' + fnum(l.cantidad) + ' × ' + pesos(l.unitario) }), el('span', { class: 'spacer' }), el('span', { text: pesos(l.importe) })))) : null,
      (e.mercaderia || []).map(m => filaNov('Se llevó ' + ddmm(m.fecha) + ': ' + fnum(m.cantidad) + ' ' + (m.unidad || '') + ' ' + m.producto, m.importe, m.novedad_id)),
      (e.adelantos || []).map(x => filaNov('Adelanto ' + ddmm(x.fecha) + ' (' + x.cuenta + ')', x.importe, x.novedad_id)),
      (e.descuentos || []).map(x => filaNov('Descuento ' + ddmm(x.fecha) + ': ' + x.motivo, x.importe, x.novedad_id)),
      el('div', { class: 'row' }, el('strong', { text: 'A pagar' }), el('span', { class: 'spacer' }), el('strong', { class: 'sl-apagar', text: pesos(t.a_pagar) })),
      (e.avisos || []).length ? aviso('info', e.avisos.join(' ')) : null,
      el('div', { class: 'row' }, acciones));
  }

  async function enviar(accion, campos, zona, alOk) {
    const res = await ops.ejecutar(ctx.base(TIPO), accion, campos);
    if (res.sinConfirmar) { montar(zona, aviso('error', 'No pudimos confirmar si se guardó. Volvé a tocar el botón: no se duplica.')); return null; }
    if (ctx.revisarFinSesion(res.r)) return null;
    if (!res.r.success) { montar(zona, errorDe(res.r)); return null; }
    if (alOk) alOk(res.r);
    return res.r;
  }
  const terminar = (m, r) => { m.cerrar(); toast(r.mensaje || 'Listo.'); cargar(); };

  function abrirDias(e) {
    const jornadas = e.tarifa && e.tarifa.tipo === 'jornadas';
    const a = e.asistencia || { dias: {}, horas_extra: {} };
    const inp = (id, v, step) => el('input', { class: 'input input-num', id, type: 'number', min: '0', step: step || '0.5', inputmode: 'decimal', value: a.cargada ? String(v || 0) : '' });
    const campo = (id, txt, i) => el('div', { class: 'field' }, el('label', { for: id, text: txt }), i);
    const f = jornadas
      ? { dn: inp('sl-d-normal', a.dias.normal), d4: inp('sl-d-cuatro', a.dias.cuatro_horas), dr: inp('sl-d-reparto', a.dias.reparto), hn: inp('sl-h-normal', (a.horas_extra.normal || 0) + (a.horas_extra.reparto || 0)) }
      : { dn: inp('sl-d-normal', a.dias.normal), hn: inp('sl-h-normal', a.horas_extra.normal) };
    // 06/11: traslado de pan (llevar pan de una panadería a otra), solo para quien tiene ese importe (Isma y Franco).
    if (e.traslado) f.dt = inp('sl-d-traslado', a.dias.traslado);
    const campoTraslado = e.traslado ? campo('sl-d-traslado', 'Traslado pan (' + pesos(e.traslado) + ' c/u)', f.dt) : null;
    const zona = el('div', { class: 'stack' });
    const bOk = el('button', { type: 'button', class: 'btn btn-primary', id: 'sl-dias-guardar' }, 'Guardar');
    const m = modal('Días de ' + nombreMes(datos.periodo) + ' — ' + e.nombre, el('div', { class: 'stack' },
      el('p', { class: 'muted small', text: 'Copiá lo que dice la planilla firmada. Se pueden poner medios días o medias horas (0,5).' }),
      jornadas ? el('div', { class: 'form-grid' }, campo('sl-d-normal', 'Días de jornada normal', f.dn), campo('sl-d-cuatro', 'Días de 4 horas', f.d4), campo('sl-d-reparto', 'Días de 8 hs con reparto', f.dr),
        campo('sl-h-normal', 'Horas extra', f.hn), campoTraslado)
        : el('div', { class: 'form-grid' }, campo('sl-d-normal', 'Días trabajados', f.dn), campo('sl-h-normal', 'Horas extra', f.hn), campoTraslado),
      bOk, zona));
    bOk.addEventListener('click', conBloqueo(bOk, async () => {
      montar(zona);
      const v = Object.fromEntries(Object.entries(f).map(([k, i]) => [k, leerNum(i.value)]));
      if (Object.values(v).some(x => !Number.isFinite(x) || x < 0)) return montar(zona, aviso('error', 'Revisá los números.'));
      const campos = { empleado_id: e.empleado_id, periodo: datos.periodo,
        dias: Object.assign(jornadas ? { normal: v.dn, cuatro_horas: v.d4, reparto: v.dr } : { normal: v.dn }, e.traslado ? { traslado: v.dt } : {}),
        // 06/11: Liam ya no tiene horas extra con reparto; todas se pagan como las del día común.
        horas_extra: jornadas ? { normal: v.hn, reparto: 0 } : { normal: v.hn } };
      await enviar('sueldos_asistencia', campos, zona, (r) => terminar(m, r));
    }, 'Guardando…'));
  }

  // 06/11: se pueden cargar varios productos de una vez (misma fecha). Cada uno se guarda como un registro aparte.
  function abrirMercaderia(e) {
    const prods = datos.productos || [];
    const opciones = () => [el('option', { value: '', text: 'Elegí el producto' })].concat(prods.map(p => el('option', { value: String(p.producto_id), text: p.nombre + ' (' + pesos(p.precio_mayorista) + (p.unidad ? ' por ' + p.unidad : '') + ')' })));
    const filas = [];
    const lista = el('div', { class: 'stack', id: 'sl-m-lista' });
    const total = el('p', { class: 'small', id: 'sl-m-total' });
    const calc = () => {
      let t = 0;
      for (const f of filas) { const p = prods.find(x => String(x.producto_id) === f.sel.value); const c = leerNum(f.cant.value); if (p && c > 0) t += Math.round(p.precio_mayorista * c * 100); }
      total.textContent = t ? 'Se descuenta en total: ' + pesos(t / 100) : '';
    };
    const agregarFila = () => {
      const n = filas.length + 1;
      const f = { sel: el('select', { class: 'select', id: 'sl-m-prod-' + n, 'aria-label': 'Producto ' + n }, opciones()),
        cant: el('input', { class: 'input input-num', id: 'sl-m-cant-' + n, type: 'text', inputmode: 'decimal', placeholder: 'Cantidad', 'aria-label': 'Cantidad ' + n }) };
      const quitar = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Quitar' }, '✕');
      f.nodo = el('div', { class: 'row sl-m-fila' }, f.sel, f.cant, quitar);
      quitar.addEventListener('click', () => { if (filas.length === 1) return; filas.splice(filas.indexOf(f), 1); f.nodo.remove(); calc(); });
      f.sel.addEventListener('change', calc); f.cant.addEventListener('input', calc);
      filas.push(f); lista.appendChild(f.nodo); f.sel.focus();
    };
    const bMas = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'sl-m-mas' }, '+ Agregar otro producto');
    bMas.addEventListener('click', agregarFila);
    const iFecha = el('input', { class: 'input', id: 'sl-m-fecha', type: 'date', value: hoyART() <= finMes(datos.periodo) ? hoyART() : finMes(datos.periodo), max: hoyART() });
    const iNota = el('input', { class: 'input', id: 'sl-m-nota', maxlength: '200', placeholder: 'Nota (opcional)' });
    const zona = el('div', { class: 'stack' });
    const bOk = el('button', { type: 'button', class: 'btn btn-primary', id: 'sl-m-guardar' }, 'Guardar');
    const m = modal('Se llevó — ' + e.nombre, el('div', { class: 'stack' },
      el('p', { class: 'muted small', text: 'Se descuenta del sueldo de ' + nombreMes(datos.periodo) + ' a precio mayorista. Podés cargar varios productos.' }),
      lista, bMas,
      el('div', { class: 'form-grid' }, el('div', { class: 'field' }, el('label', { for: 'sl-m-fecha', text: 'Fecha' }), iFecha),
        el('div', { class: 'field' }, el('label', { for: 'sl-m-nota', text: 'Nota' }), iNota)),
      total, bOk, zona));
    agregarFila();
    let guardados = 0;
    bOk.addEventListener('click', conBloqueo(bOk, async () => {
      montar(zona);
      const items = filas.map(f => ({ f, c: leerNum(f.cant.value) }));
      if (items.some(x => !x.f.sel.value)) return montar(zona, aviso('error', 'Elegí el producto en cada renglón (o quitá el que sobra).'));
      if (items.some(x => !(x.c > 0))) return montar(zona, aviso('error', 'Poné la cantidad en cada renglón.'));
      if (!FECHA_RE.test(iFecha.value)) return montar(zona, aviso('error', 'Elegí la fecha.'));
      for (const x of items) {
        const campos = { empleado_id: e.empleado_id, periodo: datos.periodo, fecha: iFecha.value, producto_id: Number(x.f.sel.value), cantidad: x.c };
        if (iNota.value.trim()) campos.nota = iNota.value.trim();
        const r = await enviar('sueldos_mercaderia', campos, zona, null);
        if (!r) { if (guardados) montar(zona, aviso('error', 'Se guardaron ' + guardados + ' y falló uno. Los que ya se guardaron se sacaron de la lista: volvé a tocar Guardar para el resto.')); return; }
        guardados += 1; filas.splice(filas.indexOf(x.f), 1); x.f.nodo.remove(); calc();
      }
      terminar(m, { mensaje: guardados === 1 ? 'Se cargó 1 producto.' : 'Se cargaron ' + guardados + ' productos.' });
    }, 'Guardando…'));
  }

  function abrirAdelanto(e) {
    const ctas = datos.cuentas || [];
    const iImp = el('input', { class: 'input input-num', id: 'sl-a-imp', type: 'text', inputmode: 'decimal', placeholder: 'Importe' });
    const sel = el('select', { class: 'select', id: 'sl-a-cta' }, el('option', { value: '', text: '¿De qué cuenta sale?' }), ctas.map(k => el('option', { value: k.cuenta_id, text: k.nombre })));
    const iFecha = el('input', { class: 'input', id: 'sl-a-fecha', type: 'date', value: hoyART() <= finMes(datos.periodo) ? hoyART() : finMes(datos.periodo), max: hoyART() });
    const iNota = el('input', { class: 'input', id: 'sl-a-nota', maxlength: '200', placeholder: 'Nota (opcional)' });
    const zona = el('div', { class: 'stack' });
    const bOk = el('button', { type: 'button', class: 'btn btn-primary', id: 'sl-a-guardar' }, 'Registrar adelanto');
    const m = modal('Adelanto — ' + e.nombre, el('div', { class: 'stack' },
      el('p', { class: 'muted small', text: 'La plata sale ahora de la cuenta elegida y se descuenta del sueldo de ' + nombreMes(datos.periodo) + '.' }),
      el('div', { class: 'form-grid' }, el('div', { class: 'field' }, el('label', { for: 'sl-a-imp', text: 'Importe' }), iImp),
        el('div', { class: 'field' }, el('label', { for: 'sl-a-cta', text: 'Cuenta' }), sel),
        el('div', { class: 'field' }, el('label', { for: 'sl-a-fecha', text: 'Fecha' }), iFecha),
        el('div', { class: 'field' }, el('label', { for: 'sl-a-nota', text: 'Nota' }), iNota)),
      bOk, zona));
    bOk.addEventListener('click', conBloqueo(bOk, async () => {
      montar(zona);
      const imp = numero(iImp.value);
      if (!(imp > 0)) return montar(zona, aviso('error', 'Poné el importe.'));
      if (!sel.value) return montar(zona, aviso('error', 'Elegí la cuenta.'));
      if (!FECHA_RE.test(iFecha.value)) return montar(zona, aviso('error', 'Elegí la fecha.'));
      if (!(await confirmar('Confirmar adelanto', 'Adelanto de ' + pesos(imp) + ' a ' + e.nombre + ' desde ' + sel.options[sel.selectedIndex].text + '. ¿Confirmás?', 'Registrar'))) return;
      const campos = { empleado_id: e.empleado_id, periodo: datos.periodo, fecha: iFecha.value, importe: imp, cuenta_financiera_id: sel.value };
      if (iNota.value.trim()) campos.nota = iNota.value.trim();
      await enviar('sueldos_adelanto', campos, zona, (r) => terminar(m, r));
    }, 'Registrando…'));
  }

  // 06/11: descuento del sueldo (por un fallo, una rotura, etc.). No sale plata de ninguna cuenta.
  function abrirDescuento(e) {
    const iImp = el('input', { class: 'input input-num', id: 'sl-d-imp', type: 'text', inputmode: 'decimal', placeholder: 'Importe' });
    const iFecha = el('input', { class: 'input', id: 'sl-d-fecha', type: 'date', value: hoyART() <= finMes(datos.periodo) ? hoyART() : finMes(datos.periodo), max: hoyART() });
    const iMot = el('input', { class: 'input', id: 'sl-d-motivo', maxlength: '200', placeholder: 'Ej.: error en la elaboración de bizcochos' });
    const zona = el('div', { class: 'stack' });
    const bOk = el('button', { type: 'button', class: 'btn btn-primary', id: 'sl-d-guardar' }, 'Registrar descuento');
    const m = modal('Descuento — ' + e.nombre, el('div', { class: 'stack' },
      el('p', { class: 'muted small', text: 'Se resta del sueldo de ' + nombreMes(datos.periodo) + '. No sale plata de ninguna cuenta. El motivo sale en el recibo.' }),
      el('div', { class: 'form-grid' }, el('div', { class: 'field' }, el('label', { for: 'sl-d-imp', text: 'Importe' }), iImp),
        el('div', { class: 'field' }, el('label', { for: 'sl-d-fecha', text: 'Fecha' }), iFecha),
        el('div', { class: 'field' }, el('label', { for: 'sl-d-motivo', text: 'Motivo' }), iMot)),
      bOk, zona));
    bOk.addEventListener('click', conBloqueo(bOk, async () => {
      montar(zona);
      const imp = numero(iImp.value);
      if (!(imp > 0)) return montar(zona, aviso('error', 'Poné el importe.'));
      if (!FECHA_RE.test(iFecha.value)) return montar(zona, aviso('error', 'Elegí la fecha.'));
      if (iMot.value.trim().length < 3) return montar(zona, aviso('error', 'Escribí el motivo del descuento.'));
      if (!(await confirmar('Confirmar descuento', 'Descontar ' + pesos(imp) + ' del sueldo de ' + nombreMes(datos.periodo) + ' de ' + e.nombre + '. ¿Confirmás?', 'Descontar'))) return;
      await enviar('sueldos_descuento', { empleado_id: e.empleado_id, periodo: datos.periodo, fecha: iFecha.value, importe: imp, nota: iMot.value.trim() }, zona, (r) => terminar(m, r));
    }, 'Registrando…'));
  }

  async function anular(novedadId, txt) {
    const motivo = await pedirMotivo(txt);
    if (!motivo) return;
    const zona = el('div');
    const r = await enviar('sueldos_anular', { novedad_id: novedadId, motivo }, zona);
    if (!r) return montar(avisos, zona.firstChild || aviso('error', 'No se pudo anular.'));
    toast('Anulado.'); cargar();
  }

  function abrirLiquidar(e) {
    const zona = el('div', { class: 'stack', id: 'sl-liq-zona' });
    const m = modal('Liquidar ' + nombreMes(datos.periodo) + ' — ' + e.nombre, zona);
    montar(zona, el('div', { class: 'skeleton' }));
    (async () => {
      const r = await enviar('sueldos_liquidar', { empleado_id: e.empleado_id, periodo: datos.periodo }, zona);
      if (!r) return;
      const cal = r.datos.calculo, t = cal.totales;
      const bOk = el('button', { type: 'button', class: 'btn btn-gold', id: 'sl-liq-confirmar' }, 'Confirmar liquidación');
      const z2 = el('div', { class: 'stack' });
      montar(zona, detalle(cal),
        el('p', { class: 'muted small', text: 'Al confirmar queda como sueldo a pagar de ' + nombreMes(datos.periodo) + ' (' + pesos(t.obligacion) + ', con ' + pesos(t.adelantos) + ' ya adelantados). Después no se puede cambiar desde acá.' }),
        bOk, z2);
      bOk.addEventListener('click', conBloqueo(bOk, async () => {
        montar(z2);
        await enviar('sueldos_liquidar', { empleado_id: e.empleado_id, periodo: datos.periodo, confirmar: true }, z2, (r2) => terminar(m, r2));
      }, 'Liquidando…'));
    })();
  }

  cargar();
}

const finMes = (p) => { const [y, m] = p.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

function pedirMotivo(txt) {
  return new Promise((resolve) => {
    const i = el('input', { class: 'input', id: 'sl-motivo', maxlength: '200', placeholder: 'Motivo' });
    let listo = false;
    const fin = (v) => { if (listo) return; listo = true; m.cerrar(); resolve(v); };
    const bOk = el('button', { type: 'button', class: 'btn btn-danger', id: 'sl-anular-ok' }, 'Anular');
    bOk.addEventListener('click', () => { const v = i.value.trim(); if (v.length < 3) { i.focus(); return; } fin(v); });
    const m = modal('Anular', el('div', { class: 'stack' }, el('p', { text: txt }), el('div', { class: 'field' }, el('label', { for: 'sl-motivo', text: '¿Por qué se anula?' }), i),
      el('div', { class: 'row' }, bOk, el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => fin(null) }, 'Cancelar'))));
    const obs = new MutationObserver(() => { if (!document.body.contains(m.cuerpo)) { obs.disconnect(); fin(null); } });
    obs.observe(document.body, { childList: true });
  });
}

function detalle(cal) {
  const t = cal.totales;
  const fila = (a, b, fuerte) => el('div', { class: 'row' }, el(fuerte ? 'strong' : 'span', { text: a }), el('span', { class: 'spacer' }), el(fuerte ? 'strong' : 'span', { text: b }));
  return el('div', { class: 'stack small', id: 'sl-detalle' },
    (cal.lineas || []).map(l => fila(l.concepto + ' ' + fnum(l.cantidad) + ' × ' + pesos(l.unitario), pesos(l.importe))),
    fila('Total trabajado', pesos(t.bruto), true),
    (cal.mercaderia || []).map(m => fila('Se llevó ' + ddmm(m.fecha) + ': ' + fnum(m.cantidad) + ' ' + (m.unidad || '') + ' ' + m.producto, '− ' + pesos(m.importe))),
    (cal.descuentos || []).map(a => fila('Descuento ' + ddmm(a.fecha) + ': ' + a.motivo, '− ' + pesos(a.importe))),
    (cal.adelantos || []).map(a => fila('Adelanto ' + ddmm(a.fecha), '− ' + pesos(a.importe))),
    fila('A pagar', pesos(t.a_pagar), true));
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function imprimir(e, periodo) {
  const t = e.totales;
  const fila = (a, b, cls) => '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + esc(a) + '</td><td style="text-align:right">' + esc(b) + '</td></tr>';
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Sueldo ' + esc(e.nombre) + '</title><style>body{font-family:system-ui,sans-serif;padding:24px;max-width:520px}h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:12px}td{padding:6px 4px;border-bottom:1px solid #ddd}.t td{font-weight:700;border-top:2px solid #333}.m{color:#666;font-size:12px}</style></head><body>'
    + '<h1>Golden — Sueldo ' + esc(nombreMes(periodo)) + '</h1><div>' + esc(e.nombre) + '</div><table>'
    + (e.lineas || []).map(l => fila(l.concepto + ' ' + fnum(l.cantidad) + ' × ' + pesos(l.unitario), pesos(l.importe))).join('')
    + fila('Total trabajado', pesos(t.bruto), 't')
    + (e.mercaderia || []).map(m => fila('Se llevó ' + ddmm(m.fecha) + ': ' + fnum(m.cantidad) + ' ' + (m.unidad || '') + ' ' + m.producto, '− ' + pesos(m.importe))).join('')
    + (e.descuentos || []).map(a => fila('Descuento ' + ddmm(a.fecha) + ': ' + a.motivo, '− ' + pesos(a.importe))).join('')
    + (e.adelantos || []).map(a => fila('Adelanto ' + ddmm(a.fecha), '− ' + pesos(a.importe))).join('')
    + fila('A pagar', pesos(t.a_pagar), 't') + '</table><p class="m">Comprobante interno.</p></body></html>';
  const fr = el('iframe', { title: 'Impresión de sueldo', 'aria-hidden': 'true', class: 'gb-frame' });
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch (err) { toast('No se pudo abrir la impresión.'); } setTimeout(() => fr.remove(), 60000); }, 200);
}
