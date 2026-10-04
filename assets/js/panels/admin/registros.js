// Admin General → Pendientes → Nuevas solicitudes de registro (registro público del inicio). Movido desde Admin Finanzas (2026-10-02).
// La interfaz muestra solo mensajes en español: los códigos técnicos quedan en data-* (diagnóstico), nunca como texto visible.
// - Listado: nombre, teléfono, estado y fecha. Las abiertas (pendiente / en revisión) primero.
// - Revisar → Aprobar (crea el CLIENTE con la lógica existente de Admin Gestion PROD y muestra el GLD para comunicarlo a mano)
//   o Rechazar (motivo breve; la solicitud no se borra).
// - Aprobadas: "Ver código" relee el GLD desde la persona creada (acción exclusiva de este circuito). El GLD no se guarda en la página.
// Escrituras con operacion_id idempotente (ops.ejecutar): un reintento o un segundo aprobar no duplica persona, rol ni código.
import { el, montar, modal, toast, conBloqueo } from '../../ui.js';
import * as ops from '../../ops.js';
import { avisoFalla, avisoSinConfirmar } from './personas.js';

const TIPO = 'admin_general';
const fmtFecha = (f) => { const t = Date.parse(f || ''); return isNaN(t) ? '—' : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(t)); };
const vacio = (t) => el('div', { class: 'card empty', 'data-vacio': 'true' }, el('span', { class: 'empty-ico', 'aria-hidden': 'true' }), el('p', { text: t }));
const campo = (id, label, input) => el('div', { class: 'field' }, el('label', { for: id, text: label }), input);
const textoArea = (id, max, ph) => el('textarea', { class: 'input', id, maxlength: String(max), rows: '3', placeholder: ph });
const texto = (v) => { const t = String(v == null ? '' : v).trim(); return t === '' ? null : t; };
const filaDato = (label, valor, attr) => el('div', { class: 'rep-fila rep-c2 op-dato', 'data-dato': attr || null }, el('span', { text: label }), el('span', { text: valor === null || valor === undefined ? '—' : String(valor) }));
const resumenOp = (filas) => el('div', { class: 'stack', 'data-resumen-op': 'true' }, el('div', { class: 'tabla rep-tabla op-resumen' }, filas.filter(Boolean)));
// Aviso SOLO con texto humano; el código técnico va en data-codigo (no se muestra).
const aviso = (tipo, txt, codigo) => el('div', { class: 'notice ' + tipo, role: tipo === 'error' ? 'alert' : 'status', 'data-codigo': codigo || null, text: txt });
const MSJ = { REGISTRO_EN_REVISION: null, ESTADO_SOLICITUD_INVALIDO: 'La solicitud ya fue resuelta.', SOLICITUD_INEXISTENTE: 'La solicitud ya no existe.', CONFIRMACION_NO_APLICA: 'Esta solicitud no necesita esa confirmación.',
  MOTIVO_OBLIGATORIO: 'Escribí un motivo breve.', ACCESO_DENEGADO: 'No tenés permiso para esta acción.', ERROR_INTERNO: 'No pudimos procesar la solicitud. Intentá nuevamente.' };
const avisoR = (r) => aviso(r.success ? 'ok' : 'error', MSJ[r.codigo] || r.mensaje || (r.success ? 'Listo.' : 'No se pudo completar la operación.'), r.codigo);
// Lectura: carga → falla de red (reintentar) → fin de sesión → rechazo → pintar.
async function leer(ctx, zona, accion, campos, pintar) {
  zona.dataset.estado = 'cargando';
  montar(zona, el('div', { class: 'skeleton' }));
  const res = await ctx.pedir(TIPO, accion, campos || {});
  if (!zona.isConnected) return;
  zona.dataset.estado = 'listo';
  if (res.falla) return montar(zona, avisoFalla(res.falla, () => leer(ctx, zona, accion, campos, pintar)));
  if (ctx.revisarFinSesion(res.r)) return;
  if (!res.r.success) return montar(zona, avisoR(res.r));
  pintar(res.r.datos || {});
}

const EST = { pendiente: ['Pendiente', 'warn'], en_revision: ['En revisión', 'gold'], aprobada: ['Aprobada', 'ok'], rechazada: ['Rechazada', 'off'] };
const ABIERTA = (s) => s.estado === 'pendiente' || s.estado === 'en_revision';
const MOTIVO_TXT = { TELEFONO_EXISTENTE: 'Ese teléfono ya pertenece a una persona de Golden. No se puede crear otra.', POSIBLE_DUPLICADO: 'Hay personas con un nombre parecido. Revisá si es la misma persona antes de aprobar.' };
const fichas = (l) => (l || []).map(x => [x.nombre || '—', x.telefono || 'sin teléfono'].join(' · ')).join(' / ');

export function seccionRegistros(ctx) {
  const zona = el('div', { class: 'stack', id: 'rg-cuerpo', 'data-estado': 'cargando' });
  cargar(ctx, zona);
  return el('div', { class: 'card stack section-card', id: 'ag-registros-card' },
    el('div', { class: 'card-head' }, el('div', null, el('h2', { class: 'section-title', text: 'Nuevas solicitudes de registro' }),
      el('p', { class: 'card-sub', text: 'Personas que pidieron acceso desde el inicio. Revisá, aprobá (se crea el cliente y ves su código para comunicárselo) o rechazá.' }))), zona);
}
function cargar(ctx, zona) {
  const recargar = () => cargar(ctx, zona);
  leer(ctx, zona, 'registros_listar', {}, (d) => {
    const l = (d.solicitudes || []).slice().sort((a, b) => (ABIERTA(b) - ABIERTA(a)) || String(b.fecha_creacion).localeCompare(String(a.fecha_creacion)));
    const pe = d.por_estado || {};
    montar(zona,
      el('div', { class: 'ped-resumen', id: 'rg-resumen' }, Object.keys(EST).map(k => el('span', { class: 'ped-res-item', 'data-res': k }, el('strong', { text: String(pe[k] || 0) }), ' ' + EST[k][0].toLowerCase()))),
      !l.length ? vacio('No hay solicitudes de registro.') : el('div', { class: 'stack', id: 'rg-lista' }, l.map(s => tarjeta(ctx, s, recargar))));
  });
}

function tarjeta(ctx, s, recargar) {
  const e = EST[s.estado] || [s.estado, ''];
  const botones = [];
  if (ABIERTA(s)) botones.push(el('button', { type: 'button', class: 'btn btn-gold btn-sm', 'data-accion': 'revisar-registro', onclick: () => revisar(ctx, s, recargar) }, 'Revisar'));
  if (s.estado === 'aprobada') botones.push(el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'ver-codigo-registro', onclick: (ev) => verCodigo(ctx, s, ev.currentTarget) }, 'Ver código'));
  return el('div', { class: 'card pend-card stack', 'data-solicitud': s.solicitud_id, 'data-estado-solicitud': s.estado },
    el('div', { class: 'card-head' }, el('strong', { text: s.nombre || '—' }), el('span', { class: 'spacer' }), el('span', { class: 'chip ' + e[1], text: e[0] })),
    el('p', { class: 'muted small', text: [s.telefono || 'Sin teléfono', 'Recibida ' + fmtFecha(s.fecha_creacion)].join(' · ') }),
    s.estado === 'en_revision' && s.revision_motivo ? el('p', { class: 'small', 'data-revision-motivo': s.revision_motivo },
      MOTIVO_TXT[s.revision_motivo] || 'Necesita revisión.', s.coincidencias && s.coincidencias.length ? ' Coincide con: ' + fichas(s.coincidencias) + '.' : '') : null,
    s.estado === 'aprobada' ? el('p', { class: 'small', text: ['Cliente creado: ' + (s.cliente_creado || s.nombre || '—'), s.resuelto_por ? 'Aprobó ' + s.resuelto_por : null, s.fecha_resolucion ? fmtFecha(s.fecha_resolucion) : null].filter(Boolean).join(' · ') }) : null,
    s.estado === 'rechazada' ? el('p', { class: 'small', text: ['Motivo: ' + (s.rechazo_motivo || '—'), s.resuelto_por ? 'Rechazó ' + s.resuelto_por : null, s.fecha_resolucion ? fmtFecha(s.fecha_resolucion) : null].filter(Boolean).join(' · ') }) : null,
    botones.length ? el('div', { class: 'row' }, botones) : null);
}

// Revisar: datos de la solicitud + Aprobar / Rechazar en el mismo cuadro.
function revisar(ctx, s, recargar) {
  const zona = el('div', { class: 'stack', id: 'rg-op-aviso' });
  const telExiste = s.estado === 'en_revision' && s.revision_motivo === 'TELEFONO_EXISTENTE';
  const dudoso = s.estado === 'en_revision' && s.revision_motivo === 'POSIBLE_DUPLICADO';
  const chk = dudoso ? el('input', { type: 'checkbox', id: 'rg-distinta' }) : null;
  const bAprobar = telExiste ? null : el('button', { type: 'button', class: 'btn btn-gold', id: 'rg-aprobar' }, 'Aprobar y crear cliente');
  const bRechazar = el('button', { type: 'button', class: 'btn btn-ghost', id: 'rg-rechazar' }, 'Rechazar');
  const caja = el('div', { class: 'stack', id: 'rg-op', 'data-paso': 'revisar' },
    resumenOp([filaDato('Nombre', s.nombre, 'nombre'), filaDato('Teléfono', s.telefono, 'telefono'), filaDato('Estado', (EST[s.estado] || [s.estado])[0], 'estado'), filaDato('Recibida', fmtFecha(s.fecha_creacion))]),
    s.revision_motivo ? aviso('info', (MOTIVO_TXT[s.revision_motivo] || 'Necesita revisión.') + (s.coincidencias && s.coincidencias.length ? ' Coincide con: ' + fichas(s.coincidencias) + '.' : ''), s.revision_motivo) : null,
    chk ? el('label', { class: 'row small', for: 'rg-distinta' }, chk, el('span', { text: 'Revisé las coincidencias: es una persona distinta.' })) : null,
    bAprobar ? el('p', { class: 'muted small', text: 'Se crea la persona con rol cliente y su código GLD. El código no se envía solo: lo comunicás vos al teléfono de la solicitud.' }) : null,
    el('div', { class: 'row' }, bAprobar, bRechazar), zona);
  const m = modal('Solicitud de registro', caja);
  if (bAprobar) bAprobar.addEventListener('click', conBloqueo(bAprobar, async () => {
    montar(zona);
    if (chk && !chk.checked) return montar(zona, aviso('error', 'Confirmá que revisaste las coincidencias.', 'CONFIRMACION_REQUERIDA'));
    const campos = { solicitud_id: s.solicitud_id }; if (chk) campos.confirmar_distinta = true;
    await escribir(ctx, 'registro_aprobar', campos, zona, m, recargar, (r) => mostrarCodigo(r.datos || {}, 'Cliente creado'));
  }, 'Aprobando…'));
  bRechazar.addEventListener('click', () => rechazar(ctx, s, caja, zona, m, recargar));
}

function rechazar(ctx, s, caja, zona, m, recargar) {
  const iMotivo = textoArea('rg-motivo', 300, 'Motivo breve (queda registrado)');
  const bConf = el('button', { type: 'button', class: 'btn btn-danger', id: 'rg-rechazar-confirmar' }, 'Confirmar rechazo');
  caja.dataset.paso = 'rechazar';
  montar(caja, resumenOp([filaDato('Nombre', s.nombre), filaDato('Teléfono', s.telefono)]), campo('rg-motivo', 'Motivo del rechazo', iMotivo),
    el('p', { class: 'muted small', text: 'La solicitud no se borra: queda como rechazada con el motivo.' }), el('div', { class: 'row' }, bConf), zona);
  iMotivo.focus();
  bConf.addEventListener('click', conBloqueo(bConf, async () => {
    montar(zona);
    const motivo = texto(iMotivo.value);
    if (!motivo || motivo.length < 3) return montar(zona, aviso('error', 'Escribí un motivo breve.', 'MOTIVO_OBLIGATORIO'));
    await escribir(ctx, 'registro_rechazar', { solicitud_id: s.solicitud_id, motivo }, zona, m, recargar, () => toast('Solicitud rechazada.'));
  }, 'Rechazando…'));
}

// Escritura idempotente: sin respuesta -> "sin confirmar" con reintento de la MISMA operación (mismo operacion_id).
async function escribir(ctx, accion, campos, zona, m, recargar, alTerminar) {
  const res = await ops.ejecutar(ctx.base(TIPO), accion, campos);
  if (!zona.isConnected) return;
  if (res.sinConfirmar) return montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => escribir(ctx, accion, campos, zona, m, recargar, alTerminar), () => { ops.descartar(accion, campos); m.cerrar(); recargar(); }));
  if (ctx.revisarFinSesion(res.r)) return m.cerrar();
  if (!res.r.success) {
    // El backend la pasó a revisión (teléfono existente / nombre parecido) o ya estaba resuelta: se muestra y se refresca la lista.
    montar(zona, avisoR(res.r), el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'volver-lista', onclick: () => { m.cerrar(); recargar(); } }, 'Volver a la lista'));
    return;
  }
  m.cerrar(); recargar();
  alTerminar(res.r);
}

// Aprobadas: relee el GLD desde la persona creada (registro_ver_codigo). Solo lectura.
async function verCodigo(ctx, s, boton) {
  boton.disabled = true;
  const res = await ctx.pedir(TIPO, 'registro_ver_codigo', { solicitud_id: s.solicitud_id });
  boton.disabled = false;
  if (res.falla) return toast('No pudimos conectar con Golden. Reintentá.');
  if (ctx.revisarFinSesion(res.r)) return;
  if (!res.r.success) return toast(res.r.mensaje || 'No se pudo leer el código.');
  const d = res.r.datos || {};
  mostrarCodigo({ nombre: (d.solicitud || {}).nombre || s.nombre, telefono: (d.solicitud || {}).telefono || s.telefono, codigo_acceso: d.codigo_acceso }, 'Código de acceso');
}

function mostrarCodigo(d, titulo) {
  const gld = typeof d.codigo_acceso === 'string' ? d.codigo_acceso : null;
  const valor = el('span', { class: 'gld-code', id: 'rg-gld-valor', text: gld || 'Sin código' });
  const bCopiar = gld ? el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'rg-copiar-gld' }, 'Copiar código') : null;
  if (bCopiar) bCopiar.addEventListener('click', () => copiar(gld, valor));
  modal(titulo, el('div', { class: 'stack', id: 'rg-codigo' },
    resumenOp([filaDato('Nombre', d.nombre), filaDato('Teléfono', d.telefono)]),
    el('div', { class: 'card stack card-gld' }, el('p', { class: 'muted small', text: 'Comunicale este código a la persona por el teléfono de la solicitud. No se envía automáticamente.' }),
      el('div', { class: 'gld-box' }, valor, el('span', { class: 'spacer' }), bCopiar))));
}

async function copiar(texto, nodo) {
  try { await navigator.clipboard.writeText(texto); toast('Código copiado.'); }
  catch (e) {
    const rango = document.createRange(); rango.selectNodeContents(nodo);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rango);
    toast('No se pudo copiar automáticamente. El código quedó seleccionado.');
  }
}

