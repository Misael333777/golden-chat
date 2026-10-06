// Operaciones de escritura e idempotencia del lado del navegador.
// - Cada operación NUEVA recibe un operacion_id nuevo.
// - Si una operación quedó SIN CONFIRMAR (red, timeout, respuesta vacía o ilegible), el reintento de EXACTAMENTE la misma
//   operación (misma acción y mismos campos) reutiliza el mismo operacion_id. Cualquier cambio de contenido => operacion_id nuevo.
// - Ante cualquier respuesta del backend (éxito, OPERACION_YA_PROCESADA o rechazo) la operación termina y se limpia.
//
// PERSISTENCIA (solo esta pestaña): las operaciones pendientes se guardan en sessionStorage para sobrevivir a un refresh.
//   Se guarda por operación: accion, operacion_id, campos de negocio enviados (sin token, sin GLD), huella SHA-256 de
//   accion+campos, persona_id del actor de la sesión (para no mezclar personas en la misma pestaña) y fecha.
//   Al leer se RECALCULA la huella: si no coincide, falta algo o aparece un campo prohibido, la entrada se descarta y
//   ese operacion_id NO se reutiliza. Nunca se usa localStorage.
import { llamar } from './api.js';

const K = 'golden_ops_pendientes';
const VERSION = 1;
// Escrituras del panel Admin Finanzas (tipo admin_finanzas). Se listan aparte para que cada panel reintente solo las suyas.
export const ACCIONES_FINANZAS = ['registrar_cobro', 'registrar_ajuste', 'revertir_movimiento', 'registrar_extra', 'registrar_cuenta', 'registrar_estado_cuenta', 'registrar_gasto',
  'registrar_transferencia', 'registrar_deuda', 'registrar_pago_deuda', 'registrar_anular_deuda', 'tomar_revision', 'terminar_revision', 'devolver_revision',
  'registrar_empleado', 'registrar_sueldo', 'registrar_obligacion_sueldo', 'baja_empleado', 'restaurar_empleado'];
const ACCIONES = ['crear_persona', 'editar_persona', 'agregar_rol', 'quitar_rol', 'reactivar_rol', 'habilitar_acceso', 'deshabilitar_acceso',
  'crear_producto', 'editar_producto', 'cambiar_precios', 'activar_producto', 'desactivar_producto',
  'crear_pedido_normal', 'configurar_recurrente', 'agregar_dia', 'cambio_vigente', 'solicitar_extra', 'aprobar_extra', 'rechazar_extra', 'registrar_entrega', 'recuperar_finanzas_extra',
  'agregar_linea_manual', 'editar_linea_manual', 'anular_linea_manual', 'crear_aclaracion', 'editar_aclaracion', 'activar_aclaracion', 'desactivar_aclaracion', 'actualizar_configuracion',
  'derivar_revision', 'atender_revision', 'soporte_tomar', 'soporte_resolver', 'solicitar_soporte', 'registro_aprobar', 'registro_rechazar',
  // Etapa 4: habitual multiproducto por día, 'Hoy no pedir' y 'Volver al habitual' / 'Cancelar pedido' (cliente: anular; Admin General: anular_pedido_fecha).
  'editar_habitual_dia', 'hoy_no_pedir', 'anular', 'anular_pedido_fecha'].concat(ACCIONES_FINANZAS);
// Tipo de la Web API con el que se envió cada operación (se guarda para reintentarla en el MISMO panel). Las entradas viejas sin tipo
// se asignan como antes: escrituras de Finanzas -> admin_finanzas; el resto -> admin_general.
const TIPOS = ['admin_general', 'admin_finanzas', 'pedido', 'recurrente', 'extra', 'soporte'];
const tipoPorDefecto = (accion) => (ACCIONES_FINANZAS.includes(accion) ? 'admin_finanzas' : 'admin_general');
// Panel con el que se envió (cliente y repartidor comparten tipos de la Web API): el reintento se ofrece solo en ese mismo panel.
const PANELES = ['admin_general', 'admin_finanzas', 'cliente', 'repartidor'];
const panelPorDefecto = (tipo) => (tipo === 'admin_general' || tipo === 'admin_finanzas' ? tipo : 'cliente');
const PROHIBIDOS = ['token', 'codigo_acceso', 'tipo', 'panel_activo', 'operacion_id', 'accion', 'actor', 'persona_id_actor', 'rol_actor'];
const OP_RE = /^WEB-[0-9a-f-]{32,36}$/;
const PID = /^PER-[A-Z0-9]+-[A-Z0-9]+$/;

const pendientes = new Map(); // clave (accion + campos canónicos) -> { accion, tipo, operacion_id, campos, huella, actor, desde }
let actor = null;
const oyentes = new Set();
// La UI se suscribe para repintar el aviso global de pendientes cuando cambia el estado.
export function suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }

function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}
function nuevoId() {
  const u = (crypto && crypto.randomUUID) ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  return 'WEB-' + u; // cumple el formato aceptado por el backend: [A-Za-z0-9._:-]{8,80}
}
export function clave(accion, campos) { return accion + '|' + canon(campos); }
async function huellaDe(accion, campos) {
  const datos = new TextEncoder().encode('v' + VERSION + '|' + clave(accion, campos));
  const h = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(h), b => b.toString(16).padStart(2, '0')).join('');
}
const camposValidos = (c) => c && typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).some(k => PROHIBIDOS.includes(k))
  && !/GLD-/i.test(JSON.stringify(c));

function guardar() {
  const lista = [...pendientes.values()].filter(e => e.actor === actor && e.huella).map(e => ({ accion: e.accion, tipo: e.tipo, panel: e.panel, operacion_id: e.operacion_id, campos: e.campos, huella: e.huella, actor: e.actor, desde: e.desde }));
  try {
    if (lista.length) sessionStorage.setItem(K, JSON.stringify({ v: VERSION, ops: lista }));
    else sessionStorage.removeItem(K);
  } catch (e) { /* sin almacenamiento: el pendiente vive solo en memoria (comportamiento anterior) */ }
  for (const fn of [...oyentes]) { try { fn(); } catch (e) { /* nada */ } }
}

// Se llama al tener una sesión válida. Carga los pendientes de ESTA pestaña y de ESTE actor, verificando cada huella.
export async function cargar(personaActor) {
  actor = typeof personaActor === 'string' && PID.test(personaActor) ? personaActor : null;
  pendientes.clear();
  let crudo = null;
  try { crudo = JSON.parse(sessionStorage.getItem(K) || 'null'); } catch (e) { crudo = null; }
  const ops = crudo && crudo.v === VERSION && Array.isArray(crudo.ops) ? crudo.ops : [];
  for (const e of ops) {
    if (!e || typeof e !== 'object' || !actor || e.actor !== actor) continue;
    if (!ACCIONES.includes(e.accion) || typeof e.operacion_id !== 'string' || !OP_RE.test(e.operacion_id) || !camposValidos(e.campos)) continue;
    if (typeof e.huella !== 'string' || e.huella !== await huellaDe(e.accion, e.campos)) continue; // no se puede demostrar igualdad
    const tipo = TIPOS.includes(e.tipo) ? e.tipo : tipoPorDefecto(e.accion);
    const panel = PANELES.includes(e.panel) ? e.panel : panelPorDefecto(tipo);
    pendientes.set(clave(e.accion, e.campos), { accion: e.accion, tipo, panel, operacion_id: e.operacion_id, campos: e.campos, huella: e.huella, actor, desde: e.desde || null, estado: 'sin_confirmar' });
  }
  guardar(); // reescribe solo las entradas verificadas (descarta las inválidas o de otro actor)
}
// Logout explícito: se descartan todas las operaciones pendientes de la pestaña.
export function limpiarTodo() { pendientes.clear(); actor = null; try { sessionStorage.removeItem(K); } catch (e) { /* nada */ } }

// Solo las que quedaron sin confirmar (no las que están en vuelo en este momento).
// filtro(accion, tipo, panel): cada panel lista y reintenta solo las suyas.
export function listar(filtro) { return [...pendientes.values()].filter(e => !filtro || filtro(e.accion, e.tipo || tipoPorDefecto(e.accion), e.panel || panelPorDefecto(e.tipo || tipoPorDefecto(e.accion)))).filter(e => e.actor === actor && e.estado === 'sin_confirmar').map(e => ({ accion: e.accion, tipo: e.tipo || tipoPorDefecto(e.accion), panel: e.panel || panelPorDefecto(e.tipo || tipoPorDefecto(e.accion)), operacion_id: e.operacion_id, campos: JSON.parse(JSON.stringify(e.campos)), desde: e.desde })); }
// Admin Finanzas: previsualizar -> confirmar usan el MISMO operacion_id. Se reserva (solo en memoria, sin persistir) el id que usara
// ejecutar() para esa accion + campos exactos; si la previsualizacion y el registro coinciden, los identificadores mostrados son los reales.
export function operacionPara(accion, campos) {
  const k = clave(accion, campos);
  let e = pendientes.get(k);
  if (!e) { e = { accion, operacion_id: nuevoId(), campos: JSON.parse(JSON.stringify(campos)), huella: null, actor, desde: new Date().toISOString(), estado: 'reservada' }; pendientes.set(k, e); }
  return e.operacion_id;
}
export function hayPendiente(accion, campos) { return pendientes.has(clave(accion, campos)); }
// Cancelación voluntaria por el usuario.
export function descartar(accion, campos) { pendientes.delete(clave(accion, campos)); guardar(); }

// base = { tipo, token, panel_activo }. Devuelve { r } | { falla, sinConfirmar: true }, más operacion_id usado.
export async function ejecutar(base, accion, campos) {
  const k = clave(accion, campos);
  let e = pendientes.get(k);
  if (!e) {
    const persistible = ACCIONES.includes(accion) && camposValidos(campos) && !!actor;
    e = { accion, operacion_id: nuevoId(), campos: JSON.parse(JSON.stringify(campos)), huella: persistible ? await huellaDe(accion, campos) : null, actor, desde: new Date().toISOString(), estado: 'enviando' };
    pendientes.set(k, e);
  } else if (!e.huella && ACCIONES.includes(accion) && camposValidos(campos) && !!actor) e.huella = await huellaDe(accion, campos); // reservada por operacionPara
  if (TIPOS.includes(base && base.tipo)) e.tipo = base.tipo;
  if (PANELES.includes(base && base.panel_activo)) e.panel = base.panel_activo;
  e.estado = 'enviando';
  if (e.huella) guardar(); // se guarda ANTES de enviar: un refresh durante el envío no pierde el operacion_id
  const res = await llamar(Object.assign({}, base, { accion, operacion_id: e.operacion_id }, campos));
  // OPERACION_EN_CURSO (candado financiero ocupado): NO se escribio nada y la operacion debe reintentarse con el MISMO operacion_id.
  if (res.r && res.r.codigo === 'OPERACION_EN_CURSO') e.estado = 'sin_confirmar';
  else if (res.r) pendientes.delete(k); // respuesta del backend (incluye OPERACION_YA_PROCESADA): se limpia
  else e.estado = 'sin_confirmar';
  guardar();
  return Object.assign({ operacion_id: e.operacion_id, sinConfirmar: !res.r }, res);
}
