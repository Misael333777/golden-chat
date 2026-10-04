// Admin General → Pendientes → Revisiones financieras (revisiones_financieras).
// Circuito: Admin General deriva (derivar_revision) → Admin Finanzas toma, revisa y devuelve → Admin General ve el resultado y retoma la atención.
// Admin General no tiene permisos financieros: solo deriva y consulta el estado (revisiones_listar).
import { el, montar, aviso, modal, toast, conBloqueo } from '../../ui.js';
import * as ops from '../../ops.js';
import { avisoFalla, avisoSinConfirmar } from './personas.js';

const TIPO = 'admin_general';
const EST = { pendiente: ['Pendiente en Finanzas', 'warn'], en_revision: ['En revisión', 'gold'], revision_terminada: ['Revisión terminada', 'ok'], devuelta_admin_general: ['Devuelta: retomar atención', 'ok'], atendida: ['Atendida', ''] };
const ROL = { cliente: 'Cliente', repartidor: 'Repartidor', otro: 'Otro' };
const fmt = (f) => { const t = Date.parse(f || ''); return isNaN(t) ? '—' : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(t)); };

// fuente (opcional): promesa de revisiones_listar ya pedida por Pendientes (una sola llamada para la lista y esta sección).
export function seccionRevisiones(ctx, fuente) {
  const zona = el('div', { class: 'stack', id: 'ag-revisiones', 'data-estado': 'cargando' });
  const bDerivar = el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'btn-derivar-finanzas', onclick: () => derivar(ctx) }, 'Derivar a Finanzas');
  const card = el('div', { class: 'card stack section-card', id: 'ag-revisiones-card' },
    el('div', { class: 'card-head' }, el('div', null, el('h2', { class: 'section-title', text: 'Revisiones financieras' }),
      el('p', { class: 'card-sub', text: 'Consultas de saldo o pagos que Admin Finanzas revisa. Cuando la devuelve, retomás la atención con la persona.' })),
      el('span', { class: 'spacer' }), bDerivar), zona);
  cargar(ctx, zona, fuente);
  card.actualizar = (p) => cargar(ctx, zona, p);
  return card;
}
async function cargar(ctx, zona, fuente) {
  zona.dataset.estado = 'cargando';
  montar(zona, el('div', { class: 'skeleton' }));
  const res = await (fuente || ctx.pedir(TIPO, 'revisiones_listar', {}));
  if (!zona.isConnected) return;
  zona.dataset.estado = 'listo';
  if (res.falla) return montar(zona, avisoFalla(res.falla, () => cargar(ctx, zona)));
  if (ctx.revisarFinSesion(res.r)) return;
  if (!res.r.success) return montar(zona, aviso('error', res.r.mensaje || 'No se pudieron leer las revisiones.', res.r.codigo));
  const l = ((res.r.datos || {}).revisiones || []).slice().sort((a, b) => String(b.fecha_derivacion).localeCompare(String(a.fecha_derivacion)));
  if (!l.length) return montar(zona, el('p', { class: 'muted small', text: 'No hay revisiones derivadas.' }));
  montar(zona, el('div', { class: 'stack', id: 'ag-revisiones-lista' }, l.map(r => el('div', { class: 'card pend-card stack', 'data-revision': r.revision_id, 'data-estado-revision': r.estado },
    el('div', { class: 'card-head' }, el('strong', { text: (r.persona_nombre || r.persona_id) + ' · ' + (ROL[r.rol_contexto] || r.rol_contexto) }), el('span', { class: 'spacer' }),
      el('span', { class: 'chip ' + (EST[r.estado] || ['', ''])[1], text: (EST[r.estado] || [r.estado])[0] })),
    el('p', { class: 'small', text: r.motivo + (r.resumen ? ' — ' + r.resumen : '') }),
    r.resolucion ? el('p', { class: 'small', 'data-resolucion': 'true', text: 'Resolución de Finanzas: ' + r.resolucion }) : null,
    el('p', { class: 'muted small', text: 'Derivada ' + fmt(r.fecha_derivacion) + (r.revisado_por ? ' · revisa ' + r.revisado_por : '') + (r.fecha_devolucion ? ' · devuelta ' + fmt(r.fecha_devolucion) : '') + (r.fecha_atencion ? ' · atendida ' + fmt(r.fecha_atencion) + (r.atendido_por ? ' por ' + r.atendido_por : '') : '') })))));
}

// pre (opcional, desde una consulta de cliente): { persona_id, nombre, rol, motivo, resumen } para precargar el formulario.
export function derivar(ctx, pre) {
  let elegida = pre && pre.persona_id ? { persona_id: pre.persona_id, nombre: pre.nombre || pre.persona_id } : null;
  const iBus = el('input', { class: 'input', id: 'dr-buscar', type: 'search', maxlength: '100', placeholder: 'Nombre o teléfono…', autocomplete: 'off' });
  const bBus = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'dr-btn-buscar' }, 'Buscar');
  const zRes = el('div', { class: 'stack', id: 'dr-resultados' });
  const zPer = el('div', { class: 'stack', id: 'dr-persona' });
  const sRol = el('select', { class: 'select', id: 'dr-rol' }, Object.entries(ROL).map(([v, t]) => el('option', { value: v, text: t })));
  const iMot = el('input', { class: 'input', id: 'dr-motivo', maxlength: '120', placeholder: 'Ej.: consulta de saldo', autocomplete: 'off' });
  const iRes = el('textarea', { class: 'input', id: 'dr-resumen', maxlength: '500', rows: '3', placeholder: 'Qué dice la persona y qué hay que revisar' });
  const iRef = el('input', { class: 'input', id: 'dr-referencias', maxlength: '400', placeholder: 'Códigos separados por coma (opcional)', autocomplete: 'off' });
  const zona = el('div', { class: 'stack', id: 'dr-aviso' });
  const bOk = el('button', { type: 'submit', class: 'btn btn-primary', id: 'dr-enviar' }, 'Derivar a Finanzas');
  const campo = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id, text: label }), input);
  const pintarPersona = () => montar(zPer, elegida ? el('div', { class: 'row', 'data-persona-elegida': elegida.persona_id }, el('strong', { text: elegida.nombre }), el('span', { class: 'spacer' }),
    el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { elegida = null; pintarPersona(); } }, 'Cambiar'))
    : el('div', { class: 'stack' }, campo('dr-buscar', 'Persona', el('div', { class: 'row' }, iBus, bBus)), zRes));
  bBus.addEventListener('click', conBloqueo(bBus, async () => {
    const res = await ctx.pedir(TIPO, 'listar_personas', iBus.value.trim() ? { buscar: iBus.value.trim() } : {});
    if (res.falla) return montar(zRes, avisoFalla(res.falla));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(zRes, aviso('error', res.r.mensaje || 'No se pudo buscar.', res.r.codigo));
    const l = ((res.r.datos || {}).personas || []).slice(0, 8);
    montar(zRes, !l.length ? el('p', { class: 'muted small', text: 'Sin resultados.' }) : el('div', { class: 'list' }, l.map(p => el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-elegir-persona': p.persona_id,
      onclick: () => { elegida = { persona_id: p.persona_id, nombre: p.nombre }; pintarPersona(); } }, p.nombre))));
  }, 'Buscando…'));
  iBus.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); bBus.click(); } });
  pintarPersona();
  if (pre) { if (pre.rol && ROL[pre.rol]) sRol.value = pre.rol; if (pre.motivo) iMot.value = String(pre.motivo).slice(0, 120); if (pre.resumen) iRes.value = String(pre.resumen).slice(0, 500); }
  const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' }, zPer,
    el('div', { class: 'form-grid two' }, campo('dr-rol', 'Atendida como', sRol), campo('dr-motivo', 'Motivo', iMot)), campo('dr-resumen', 'Resumen', iRes), campo('dr-referencias', 'Referencias (opcional)', iRef),
    el('p', { class: 'muted small', text: 'Finanzas revisa y te la devuelve. La atención con la persona sigue a tu cargo.' }), bOk, zona);
  const m = modal('Derivar a Finanzas', form);
  async function enviar(campos) {
    const res = await ops.ejecutar(ctx.base(TIPO), 'derivar_revision', campos);
    if (res.sinConfirmar) return montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => enviar(campos), () => { ops.descartar('derivar_revision', campos); montar(zona); }));
    if (ctx.revisarFinSesion(res.r)) return m.cerrar();
    if (res.r.codigo === 'OPERACION_EN_CURSO') return montar(zona, avisoSinConfirmar('EN_CURSO', res.operacion_id, () => enviar(campos), () => { ops.descartar('derivar_revision', campos); montar(zona); }));
    if (!res.r.success) return montar(zona, aviso('error', res.r.mensaje || 'No se pudo derivar.', res.r.codigo));
    m.cerrar(); toast(res.r.codigo === 'OPERACION_YA_PROCESADA' ? 'Ya estaba derivada. No se duplicó.' : 'Derivada a Finanzas.');
    ctx.ir(location.hash);
  }
  form.addEventListener('submit', conBloqueo(bOk, async () => {
    montar(zona);
    if (!elegida) return montar(zona, aviso('error', 'Elegí la persona.', 'DATOS_INCOMPLETOS'));
    if (!iMot.value.trim() || !iRes.value.trim()) return montar(zona, aviso('error', 'Escribí el motivo y el resumen.', 'DATOS_INCOMPLETOS'));
    const campos = { persona_id: elegida.persona_id, rol_contexto: sRol.value, motivo: iMot.value, resumen: iRes.value };
    const refs = iRef.value.split(',').map(x => x.trim()).filter(Boolean);
    if (refs.length) campos.referencias = refs;
    await enviar(campos);
  }, 'Derivando…'));
}
