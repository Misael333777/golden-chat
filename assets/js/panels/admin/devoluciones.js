// Admin General → ficha de la persona → Devoluciones (24/10).
// Solo consulta a n8n al tocar "Registrar devolución" (devolucion_entrega: 1 ejecución) y al confirmar (registrar_devolucion: 1 ejecución).
// Por producto: cantidad a DESCONTAR de la cuenta (al precio que se le cobró ese día; Admin lo puede corregir)
// y/o cantidad a REPONER sin cargo (se suma a la planilla de producción de la fecha elegida, sin cobrar).
// El backend valida todo (lo que se llevó, lo ya devuelto, el precio, la fecha de reposición, el rol de Finanzas para descontar).
import * as ops from '../../ops.js';
import { el, montar, aviso, modal, confirmar, conBloqueo, toast } from '../../ui.js';
import { numero } from '../finanzas/comun.js';
import { llamar } from '../../api.js';

const TIPO = 'admin_general';
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const hoyART = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
const pesos = (v) => (typeof v === 'number' && Number.isFinite(v) ? money.format(v) : '—');
const fnum = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 1000) / 1000).replace('.', ',') : '—');
const ddmm = (f) => (FECHA_RE.test(f || '') ? f.slice(8, 10) + '/' + f.slice(5, 7) : '—');
// Unidad para mostrar: los paquetes del catálogo (x2u, x4u, x6u) se muestran como 'paquetes'.
const uTxt = (u) => (/^x\d+u$/i.test(u || '') ? 'paquetes' : (u || ''));
const leerCant = (v) => { const t = String(v == null ? '' : v).trim(); if (t === '') return 0; const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const TXT_CREDITO = { aplicado: 'descontado de la cuenta', pendiente_finanzas: 'pendiente para Finanzas', error: 'no se pudo descontar', no_aplica: null, pendiente: 'pendiente' };
const TXT_REPO = { agregada: 'agregada a la planilla', error: 'no se pudo agregar', no_aplica: null, pendiente: 'pendiente' };

// Tarjeta en la ficha. fechaFicha = fecha que se está mirando (si es futura, se propone hoy).
export function tarjetaDevoluciones(ctx, persona, pid, fechaFicha, alTerminar) {
  const nombre = persona && typeof persona.nombre === 'string' && persona.nombre ? persona.nombre : pid;
  const b = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-devolucion' }, 'Registrar devolución');
  b.addEventListener('click', () => abrirDevolucion(ctx, { pid, nombre, fecha: FECHA_RE.test(fechaFicha || '') && fechaFicha <= hoyART() ? fechaFicha : hoyART() }, alTerminar));
  return el('div', { class: 'card stack', id: 'pp-devoluciones' },
    el('div', { class: 'card-head' }, el('h3', { text: 'Devoluciones' }), el('span', { class: 'spacer' }), b),
    el('p', { class: 'muted small', text: 'Si devolvió productos: se descuentan de su cuenta o se le reponen sin cargo en otra entrega (o las dos cosas).' }));
}

function abrirDevolucion(ctx, ini, alTerminar) {
  const iFecha = el('input', { class: 'input', id: 'dev-fecha', type: 'date', value: ini.fecha, max: hoyART() });
  const bVer = el('button', { type: 'button', class: 'btn btn-primary', id: 'btn-dev-ver' }, 'Ver lo que se llevó');
  const zona = el('div', { class: 'stack', id: 'dev-zona' });
  const m = modal('Devolución — ' + ini.nombre, el('div', { class: 'stack' },
    el('div', { class: 'field' }, el('label', { for: 'dev-fecha', text: 'Día de la entrega que devuelve' }), iFecha),
    bVer, zona));
  bVer.addEventListener('click', conBloqueo(bVer, async () => {
    montar(zona);
    if (!FECHA_RE.test(iFecha.value)) return montar(zona, aviso('error', 'Elegí una fecha.'));
    const res = await ctx.pedir(TIPO, 'devolucion_entrega', { persona_id: ini.pid, fecha_entrega: iFecha.value });
    if (res.falla) return montar(zona, aviso('error', 'No pudimos conectar. Probá de nuevo.'));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(zona, aviso('error', res.r.mensaje || 'No se pudo cargar.', res.r.codigo));
    pintarFormulario(ctx, zona, res.r.datos, () => { m.cerrar(); if (alTerminar) alTerminar(); });
  }, 'Cargando…'));
}

function pintarFormulario(ctx, zona, d, cerrar) {
  if (!d.lineas || !d.lineas.length) return montar(zona, aviso('info', 'No tiene productos en la planilla del ' + ddmm(d.fecha_entrega) + '.'));
  const puede = d.puede_descontar === true;
  const filas = d.lineas.map((l, k) => {
    const iDes = el('input', { class: 'input input-num', id: 'dev-des-' + k, type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: '0' });
    const iRep = el('input', { class: 'input input-num', id: 'dev-rep-' + k, type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: '0' });
    const iPre = el('input', { class: 'input input-num', id: 'dev-pre-' + k, type: 'text', inputmode: 'decimal', value: typeof l.precio_sistema === 'number' ? String(l.precio_sistema) : '', placeholder: 'Precio' });
    const u = uTxt(l.unidad);
    const nodo = el('div', { class: 'card stack dev-linea', 'data-clave': l.clave },
      el('div', { class: 'card-head' }, el('strong', { text: l.detalle }), el('span', { class: 'spacer' }),
        el('span', { class: 'muted small', text: 'Se llevó ' + fnum(l.cantidad) + ' ' + u + (l.ya_devuelto > 0 ? ' · ya devolvió ' + fnum(l.ya_devuelto) : '') })),
      l.disponible > 0 ? el('div', { class: 'form-grid two' },
        el('div', { class: 'field' }, el('label', { for: 'dev-des-' + k, text: 'Descontar de la cuenta (' + u + ')' }), iDes),
        el('div', { class: 'field' }, el('label', { for: 'dev-rep-' + k, text: 'Reponer sin cargo (' + u + ')' }), iRep),
        puede ? el('div', { class: 'field' }, el('label', { for: 'dev-pre-' + k, text: 'Precio por ' + (u || 'unidad') }), iPre) : null)
        : el('p', { class: 'muted small', text: 'Ya devolvió todo lo que se llevó.' }));
    return { l, iDes, iRep, iPre, nodo };
  });
  const iRepFecha = el('input', { class: 'input', id: 'dev-fecha-rep', type: 'date', value: d.fecha_reposicion_sugerida || '', min: d.fecha_reposicion_sugerida || '' });
  const iNota = el('input', { class: 'input', id: 'dev-nota', type: 'text', maxlength: '200', placeholder: 'Opcional (ej. pan duro)' });
  const total = el('p', { class: 'small', id: 'dev-total' });
  const zAviso = el('div', { class: 'stack', id: 'dev-aviso' });
  const bOk = el('button', { type: 'submit', class: 'btn btn-gold', id: 'btn-dev-registrar' }, 'Registrar devolución');
  const leer = () => filas.filter(f => f.l.disponible > 0).map(f => ({ f, des: leerCant(f.iDes.value), rep: leerCant(f.iRep.value), pre: puede ? numero(f.iPre.value) : null }));
  const recalcular = () => {
    const v = leer();
    const t = v.reduce((a, x) => a + (x.des > 0 && x.pre > 0 ? x.des * x.pre : 0), 0);
    const hayRep = v.some(x => x.rep > 0);
    total.textContent = (t > 0 ? 'Se descuenta de la cuenta: ' + pesos(Math.round(t * 100) / 100) + '. ' : '') + (hayRep ? 'Se repone sin cargo el ' + ddmm(iRepFecha.value) + '.' : '');
  };
  const form = el('form', { class: 'stack', novalidate: true },
    el('p', { class: 'muted small', text: 'Entrega del ' + ddmm(d.fecha_entrega) + '. Cargá solo lo que devolvió; lo demás dejalo vacío.' }),
    filas.map(f => f.nodo),
    el('div', { class: 'field' }, el('label', { for: 'dev-fecha-rep', text: 'Si se repone: en la planilla del' }), iRepFecha),
    el('div', { class: 'field' }, el('label', { for: 'dev-nota', text: 'Nota' }), iNota),
    !puede ? aviso('info', 'No tenés el rol de Finanzas: el descuento queda pendiente y le llega un aviso a Finanzas.') : null,
    total, bOk, zAviso);
  form.addEventListener('input', recalcular);
  montar(zona, form);
  recalcular();
  form.addEventListener('submit', conBloqueo(bOk, async () => {
    montar(zAviso);
    const v = leer();
    if (v.some(x => !(x.des >= 0) || !(x.rep >= 0))) return montar(zAviso, aviso('error', 'Revisá las cantidades (números de 0 en adelante).'));
    const usados = v.filter(x => x.des > 0 || x.rep > 0);
    if (!usados.length) return montar(zAviso, aviso('error', 'No cargaste ninguna cantidad.'));
    for (const x of usados) {
      if (Math.round((x.des + x.rep) * 1000) > Math.round(x.f.l.disponible * 1000)) return montar(zAviso, aviso('error', x.f.l.detalle + ': devuelve más de lo que se llevó (' + fnum(x.f.l.disponible) + ' ' + uTxt(x.f.l.unidad) + ').'));
      if (puede && x.des > 0 && !(x.pre > 0)) return montar(zAviso, aviso('error', x.f.l.detalle + ': falta el precio para descontar.'));
    }
    if (usados.some(x => x.rep > 0) && !FECHA_RE.test(iRepFecha.value)) return montar(zAviso, aviso('error', 'Elegí la fecha de la reposición.'));
    const lineas = usados.map(x => { const o = { clave: x.f.l.clave }; if (x.des > 0) o.descontar = x.des; if (x.rep > 0) o.reponer = x.rep; if (puede && x.des > 0) o.precio_unitario = x.pre; return o; });
    const resumen = usados.map(x => x.f.l.detalle + ': ' + [x.des > 0 ? 'descontar ' + fnum(x.des) : null, x.rep > 0 ? 'reponer ' + fnum(x.rep) : null].filter(Boolean).join(' y ')).join(' · ');
    if (!(await confirmar('Confirmar devolución', resumen + '. ' + total.textContent + ' ¿Confirmás?', 'Registrar'))) return;
    const campos = { persona_id: d.persona.persona_id, fecha_entrega: d.fecha_entrega, lineas };
    if (usados.some(x => x.rep > 0)) campos.fecha_reposicion = iRepFecha.value;
    if (iNota.value.trim()) campos.nota = iNota.value.trim();
    const res = await ops.ejecutar(ctx.base(TIPO), 'registrar_devolucion', campos);
    if (res.sinConfirmar) return montar(zAviso, aviso('error', 'No pudimos confirmar si se guardó. Tocá "Registrar devolución" de nuevo: no se duplica.'));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success && res.r.codigo !== 'DEVOLUCION_INCOMPLETA') return montar(zAviso, aviso('error', res.r.mensaje || 'No se pudo registrar.', res.r.codigo));
    pintarResultado(ctx, zona, res.r, res.operacion_id, campos, cerrar);
  }, 'Registrando…'));
}

// Resultado. Si algo quedó incompleto (descuento o reposición), "Reintentar" reenvía la MISMA operación (mismo operacion_id):
// el backend no vuelve a guardar la devolución, solo completa lo que faltó.
function pintarResultado(ctx, zona, r, operacionId, campos, cerrar) {
  const det = (r.datos && r.datos.lineas) || [];
  const bRe = r.success ? null : el('button', { type: 'button', class: 'btn btn-gold', id: 'btn-dev-reintentar' }, 'Reintentar lo que faltó');
  montar(zona, el('div', { class: 'stack', id: 'dev-resultado', 'data-codigo': r.codigo },
    aviso(r.success ? 'ok' : 'error', r.mensaje || 'Devolución registrada.', r.codigo),
    det.map(x => el('p', { class: 'small', text: x.detalle + ': ' + [x.descontado > 0 ? 'descontar ' + fnum(x.descontado) + ' (' + pesos(x.importe_credito) + ', ' + (TXT_CREDITO[x.estado_credito] || x.estado_credito) + ')' : null,
      x.repuesto > 0 ? 'reponer ' + fnum(x.repuesto) + ' el ' + ddmm(x.fecha_reposicion) + ' (' + (TXT_REPO[x.estado_reposicion] || x.estado_reposicion) + ')' : null].filter(Boolean).join(' · ') })),
    el('div', { class: 'row' }, bRe, el('button', { type: 'button', class: 'btn btn-primary', onclick: cerrar }, 'Listo'))));
  if (r.success) toast('Devolución registrada.');
  if (bRe) bRe.addEventListener('click', conBloqueo(bRe, async () => {
    const res = await llamar(Object.assign({}, ctx.base(TIPO), { accion: 'registrar_devolucion', operacion_id: operacionId }, campos));
    if (!res.r) return toast('No pudimos conectar. Probá de nuevo.');
    if (ctx.revisarFinSesion(res.r)) return;
    pintarResultado(ctx, zona, res.r, operacionId, campos, cerrar);
  }, 'Reintentando…'));
}
