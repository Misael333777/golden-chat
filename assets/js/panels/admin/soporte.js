// Admin General → Pendientes → Consultas de clientes (Soporte PROD: soporte_casos vía Admin Gestion PROD).
// Circuito: el cliente escribe (solicitar_soporte) → Admin General toma la consulta (soporte_tomar) → responde y la cierra (soporte_resolver).
// Si requiere Finanzas, se deriva con el circuito ya cerrado (derivar_revision, General → Finanzas → General) y la atención sigue acá.
import { el, montar, aviso, modal, toast, conBloqueo } from '../../ui.js';
import * as ops from '../../ops.js';
import { avisoFalla, avisoSinConfirmar } from './personas.js';
import { derivar } from './revisiones.js';

const TIPO = 'admin_general';
const TEMA = { pedido: 'Pedido', extra: 'Extra', cuenta: 'Cuenta / pagos', otro: 'Otro' };
const EST = { pendiente: ['Sin tomar', 'warn'], en_atencion: ['En atención', 'gold'], resuelto: ['Resuelta', 'ok'] };
const ROL = { cliente: 'Cliente', repartidor: 'Repartidor' };
const fmt = (f) => { const t = Date.parse(f || ''); return isNaN(t) ? '—' : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(t)); };
const filtro = { estado: 'abiertas' };

export function seccionSoporte(ctx) {
  const zona = el('div', { class: 'stack', id: 'ag-soporte', 'data-estado': 'cargando' });
  const sEst = el('select', { class: 'select', id: 'sop-filtro', 'aria-label': 'Estado' }, [['abiertas', 'Abiertas'], ['pendiente', 'Sin tomar'], ['en_atencion', 'En atención'], ['resuelto', 'Resueltas'], ['todas', 'Todas']].map(([v, t]) => el('option', { value: v, text: t })));
  sEst.value = filtro.estado;
  const card = el('div', { class: 'card stack section-card', id: 'ag-soporte-card' },
    el('div', { class: 'card-head' }, el('div', null, el('h2', { class: 'section-title', text: 'Consultas de clientes' }),
      el('p', { class: 'card-sub', text: 'Lo que escriben clientes y repartidores desde “Hablar con Golden”. Tomala, respondé y cerrala; si es de cuenta o pagos, derivala a Finanzas.' })),
      el('span', { class: 'spacer' }), sEst), zona);
  let casos = null;
  const pintar = () => {
    if (!casos) return;
    const l = casos.filter(k => filtro.estado === 'todas' || (filtro.estado === 'abiertas' ? k.estado !== 'resuelto' : k.estado === filtro.estado));
    if (!l.length) return montar(zona, el('p', { class: 'muted small', 'data-vacio': 'true', text: filtro.estado === 'abiertas' ? 'No hay consultas abiertas.' : 'No hay consultas con ese estado.' }));
    montar(zona, el('div', { class: 'stack', id: 'ag-soporte-lista' }, l.map(k => tarjeta(ctx, k, cargar))));
  };
  async function cargar() {
    zona.dataset.estado = 'cargando';
    montar(zona, el('div', { class: 'skeleton' }));
    const res = await ctx.pedir(TIPO, 'soporte_listar', {});
    if (!zona.isConnected) return;
    zona.dataset.estado = 'listo';
    if (res.falla) return montar(zona, avisoFalla(res.falla, cargar));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(zona, aviso('error', res.r.mensaje || 'No se pudieron leer las consultas.', res.r.codigo));
    casos = ((res.r.datos || {}).casos || []).slice().sort((a, b) => String(b.fecha_creacion).localeCompare(String(a.fecha_creacion)));
    pintar();
  }
  sEst.addEventListener('change', () => { filtro.estado = sEst.value; pintar(); });
  cargar();
  return card;
}

function tarjeta(ctx, k, recargar) {
  const zona = el('div', { class: 'stack', 'data-aviso-caso': k.caso_id });
  const botones = [];
  if (k.estado === 'pendiente') {
    const b = el('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-accion': 'tomar-caso' }, 'Tomar');
    b.addEventListener('click', conBloqueo(b, () => escribir(ctx, zona, 'soporte_tomar', { caso_id: k.caso_id }, 'Consulta tomada.', recargar), 'Tomando…'));
    botones.push(b);
  }
  if (k.estado === 'en_atencion') {
    const b = el('button', { type: 'button', class: 'btn btn-gold btn-sm', 'data-accion': 'resolver-caso', onclick: () => resolver(ctx, k, recargar) }, 'Responder y cerrar');
    botones.push(b);
  }
  if (k.estado !== 'resuelto' && k.persona_id) botones.push(el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'derivar-caso',
    onclick: () => derivar(ctx, { persona_id: k.persona_id, nombre: k.persona_nombre, rol: k.rol, motivo: 'Consulta de ' + (ROL[k.rol] || 'cliente').toLowerCase() + ': ' + (TEMA[k.tema] || k.tema), resumen: k.mensaje }) }, 'Derivar a Finanzas'));
  return el('div', { class: 'card pend-card stack', 'data-caso': k.caso_id, 'data-estado-caso': k.estado },
    el('div', { class: 'card-head' }, el('strong', { text: (k.persona_nombre || k.persona_id || 'Persona') + ' · ' + (ROL[k.rol] || k.rol || '—') }), el('span', { class: 'spacer' }),
      el('span', { class: 'chip ' + (EST[k.estado] || ['', ''])[1], text: (EST[k.estado] || [k.estado])[0] })),
    el('p', { class: 'small' }, el('strong', { text: (TEMA[k.tema] || k.tema) + ': ' }), k.mensaje),
    k.resolucion ? el('p', { class: 'small', 'data-resolucion': 'true', text: 'Respuesta: ' + k.resolucion }) : null,
    el('p', { class: 'muted small', text: 'Recibida ' + fmt(k.fecha_creacion) + (k.atendido_por ? ' · atiende ' + k.atendido_por : '') + (k.fecha_resolucion ? ' · resuelta ' + fmt(k.fecha_resolucion) + (k.resuelto_por ? ' por ' + k.resuelto_por : '') : '') }),
    botones.length ? el('div', { class: 'row' }, botones) : null, zona);
}

async function escribir(ctx, zona, accion, campos, ok, alExito) {
  const res = await ops.ejecutar(ctx.base(TIPO), accion, campos);
  if (res.sinConfirmar) return montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => escribir(ctx, zona, accion, campos, ok, alExito), () => { ops.descartar(accion, campos); montar(zona); }));
  if (ctx.revisarFinSesion(res.r)) return;
  if (!res.r.success) return montar(zona, aviso('error', res.r.mensaje || 'No se pudo completar.', res.r.codigo));
  toast(res.r.codigo === 'OPERACION_YA_PROCESADA' ? 'Ya estaba hecho. No se duplicó.' : ok);
  if (alExito) await alExito(res.r);
  return res.r;
}

function resolver(ctx, k, recargar) {
  const iRes = el('textarea', { class: 'input', id: 'sop-resolucion', maxlength: '500', rows: '4', placeholder: 'Qué le respondiste o cómo se resolvió (lo ve la persona).' });
  const zona = el('div', { class: 'stack', id: 'sop-res-aviso' });
  const b = el('button', { type: 'submit', class: 'btn btn-primary', id: 'sop-res-enviar' }, 'Cerrar consulta');
  const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' },
    el('p', { class: 'small' }, el('strong', { text: (k.persona_nombre || '') + ': ' }), k.mensaje),
    el('div', { class: 'field' }, el('label', { for: 'sop-resolucion', text: 'Respuesta' }), iRes), b, zona);
  const m = modal('Responder consulta', form);
  form.addEventListener('submit', conBloqueo(b, async () => {
    montar(zona);
    const t = iRes.value.trim();
    if (t.length < 3) return montar(zona, aviso('error', 'Escribí la respuesta (al menos 3 caracteres).', 'DATOS_INCOMPLETOS'));
    await escribir(ctx, zona, 'soporte_resolver', { caso_id: k.caso_id, resolucion: t }, 'Consulta cerrada.', async () => { m.cerrar(); await recargar(); });
  }, 'Cerrando…'));
}
