// Admin General → Historial. Solo lectura. Acciones existentes: historial_listar (filtros + paginado) e historial_detalle.
// El backend ya devuelve los movimientos sanitizados (sin GLD, tokens ni datos personales sensibles).
import { el, montar, aviso, modal } from '../../ui.js';
import { avisoFalla } from './personas.js';

const TIPO = 'admin_general';
const TIPOS = { personas: 'Personas', roles_accesos: 'Roles y accesos', pedidos: 'Pedidos', recurrentes: 'Pedidos habituales', extras: 'Extras', catalogo: 'Catálogo',
  lineas_manuales: 'Líneas manuales', aclaraciones: 'Aclaraciones', configuracion: 'Configuración' };
const ESTADOS = { completada: 'Completada', rechazada: 'Rechazada', iniciada: 'Incompleta', requiere_revision: 'Requiere revisión', no_aplicada: 'No aplicada' };
const CHIP = { completada: 'ok', rechazada: 'off', iniciada: 'warn', requiere_revision: 'off', no_aplicada: '' };
const f = { texto: '', fecha_desde: '', fecha_hasta: '', tipo: '', estado: '', pagina: 1 };
const val = (v) => v === null || v === undefined || v === '' ? '—' : (typeof v === 'object' ? JSON.stringify(v) : String(v));

export function vistaHistorial(ctx, cont) {
  const iT = el('input', { class: 'input', id: 'his-texto', type: 'search', maxlength: '100', placeholder: 'Buscar…', 'aria-label': 'Buscar', value: f.texto });
  const iD = el('input', { class: 'input', id: 'his-desde', type: 'date', value: f.fecha_desde, 'aria-label': 'Desde' });
  const iH = el('input', { class: 'input', id: 'his-hasta', type: 'date', value: f.fecha_hasta, 'aria-label': 'Hasta' });
  const sT = el('select', { class: 'select', id: 'his-tipo', 'aria-label': 'Tipo' }, el('option', { value: '', text: 'Todos los tipos' }), Object.entries(TIPOS).map(([k, v]) => el('option', { value: k, text: v })));
  const sE = el('select', { class: 'select', id: 'his-estado', 'aria-label': 'Estado' }, el('option', { value: '', text: 'Todos los estados' }), Object.entries(ESTADOS).map(([k, v]) => el('option', { value: k, text: v })));
  sT.value = f.tipo; sE.value = f.estado;
  const bBuscar = el('button', { type: 'button', class: 'btn btn-primary btn-sm', id: 'his-buscar' }, 'Buscar');
  const cuerpo = el('div', { class: 'stack', id: 'his-lista', 'data-estado': 'cargando' });
  montar(cont, el('div', { class: 'card stack section-card' }, el('div', { class: 'card-head' }, el('div', null, el('h2', { class: 'section-title', text: 'Historial' }),
    el('p', { class: 'card-sub', text: 'Todas las operaciones registradas: quién hizo qué y cuándo. Solo lectura.' })))),
    el('div', { class: 'ped-filtros his-filtros' }, el('div', { class: 'field search-field' }, iT), sT, sE, iD, iH, bBuscar), cuerpo);
  const aplicar = () => { f.texto = iT.value.trim(); f.tipo = sT.value; f.estado = sE.value; f.fecha_desde = iD.value; f.fecha_hasta = iH.value; f.pagina = 1; cargar(); };
  bBuscar.addEventListener('click', aplicar);
  iT.addEventListener('keydown', (e) => { if (e.key === 'Enter') aplicar(); });
  async function cargar() {
    cuerpo.dataset.estado = 'cargando';
    montar(cuerpo, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
    const filtros = {};
    for (const k of ['texto', 'fecha_desde', 'fecha_hasta', 'tipo', 'estado']) if (f[k]) filtros[k] = f[k];
    const res = await ctx.pedir(TIPO, 'historial_listar', { filtros, pagina: f.pagina, tam_pagina: 20 });
    if (!cuerpo.isConnected) return;
    cuerpo.dataset.estado = 'listo';
    if (res.falla) return montar(cuerpo, avisoFalla(res.falla, cargar));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(cuerpo, el('div', { class: 'notice error', 'data-codigo': res.r.codigo }, res.r.mensaje || 'No se pudo leer el historial.', el('span', { class: 'code', text: res.r.codigo })));
    const d = res.r.datos;
    const items = d.items || [];
    const bAnt = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'his-anterior', disabled: f.pagina <= 1, onclick: () => { f.pagina--; cargar(); } }, 'Anterior');
    const bSig = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'his-siguiente', disabled: f.pagina >= (d.total_paginas || 1), onclick: () => { f.pagina++; cargar(); } }, 'Siguiente');
    montar(cuerpo, el('p', { class: 'muted small', id: 'his-total', text: (d.total || 0) + ' movimientos · página ' + (d.pagina || 1) + ' de ' + (d.total_paginas || 1) }),
      !items.length ? el('div', { class: 'card empty', 'data-vacio': 'true' }, el('p', { text: 'No hay movimientos con esos filtros.' })) :
        el('div', { class: 'tabla' }, el('div', { class: 'list' }, items.map(m => el('button', { type: 'button', class: 'person-card his-row', 'data-movimiento': m.movimiento_id, onclick: () => detalle(m.movimiento_id) },
          el('span', { class: 'pc-cell his-fecha', text: m.fecha_hora || '' }),
          el('span', { class: 'pc-cell his-resumen' }, el('span', { class: 'person-name', text: m.resumen || m.accion_label || m.accion }),
            el('span', { class: 'person-also', text: [m.categoria_label, m.realizado_por && (m.realizado_por.nombre || m.realizado_por.persona_id)].filter(Boolean).join(' · ') })),
          el('span', { class: 'pc-cell chips' }, el('span', { class: 'chip ' + (CHIP[m.estado] || ''), text: m.estado_label || ESTADOS[m.estado] || m.estado })),
          el('span', { class: 'pc-cell pc-acciones' }, el('span', { class: 'pc-ver', 'aria-hidden': 'true', text: 'Ver' })))))),
      el('div', { class: 'row' }, bAnt, el('span', { class: 'spacer' }), bSig),
      (d.avisos || []).length ? aviso('info', 'Avisos: ' + d.avisos.join(', ')) : null);
  }
  async function detalle(id) {
    const cuerpoM = el('div', { class: 'stack', id: 'his-detalle', 'data-estado': 'cargando' }, el('div', { class: 'skeleton' }));
    modal('Detalle del movimiento', cuerpoM);
    const res = await ctx.pedir(TIPO, 'historial_detalle', { movimiento_id: id });
    if (!cuerpoM.isConnected) return;
    cuerpoM.dataset.estado = 'listo';
    if (res.falla) return montar(cuerpoM, avisoFalla(res.falla));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(cuerpoM, el('div', { class: 'notice error', 'data-codigo': res.r.codigo }, res.r.mensaje || '', el('span', { class: 'code', text: res.r.codigo })));
    const m = res.r.datos.movimiento || {};
    const info = Object.entries(m.info || {}).filter(([, v]) => v !== null && v !== undefined);
    montar(cuerpoM,
      el('div', { class: 'chips' }, el('span', { class: 'chip ' + (CHIP[m.estado] || ''), text: m.estado_label || m.estado }), el('span', { class: 'chip', text: m.categoria_label || m.categoria || '' })),
      el('p', { class: 'small' }, el('strong', { text: m.resumen || m.accion_label || '' })),
      el('dl', { class: 'dl' },
        el('div', { class: 'dl-item', 'data-ico': 'cal' }, el('dt', { text: 'Fecha' }), el('dd', { text: m.fecha_hora || '—' })),
        el('div', { class: 'dl-item', 'data-ico': 'tag' }, el('dt', { text: 'Realizado por' }), el('dd', { text: m.realizado_por ? (m.realizado_por.nombre || m.realizado_por.persona_id) + (m.realizado_por.rol ? ' (' + m.realizado_por.rol + ')' : '') : '—' })),
        m.persona_afectada ? el('div', { class: 'dl-item', 'data-ico': 'tag' }, el('dt', { text: 'Persona' }), el('dd', { text: m.persona_afectada.nombre || m.persona_afectada.persona_id })) : null,
        el('div', { class: 'dl-item', 'data-ico': 'tag' }, el('dt', { text: 'Operación' }), el('dd', { text: (m.operacion_id || '—') + (m.intentos > 1 ? ' · ' + m.intentos + ' intentos' : '') }))),
      (m.cambios || []).length ? el('div', { class: 'stack' }, el('strong', { text: 'Cambios' }), el('ul', { class: 'pp-lineas', id: 'his-cambios' }, m.cambios.map(c => el('li', null,
        el('span', { class: 'pp-prod', text: c.campo_label || c.campo || '' }), el('span', { class: 'muted small', text: val(c.antes) + ' → ' + val(c.despues) }))))) : null,
      (m.eventos || []).length ? el('div', { class: 'stack' }, el('strong', { text: 'Eventos' }), el('ul', { class: 'lista-simple' }, m.eventos.map(e => el('li', { text: typeof e === 'string' ? e : (e.label || e.evento || JSON.stringify(e)) })))) : null,
      m.rechazo ? el('div', { class: 'notice error small', 'data-codigo': m.rechazo.codigo }, (m.rechazo.mensaje || '') + ' ', el('span', { class: 'code', text: m.rechazo.codigo || '' })) : null,
      m.revision ? aviso('info', 'Requiere revisión: ' + val(m.revision)) : null,
      info.length ? el('p', { class: 'muted small', text: info.map(([k, v]) => k.replace(/_/g, ' ') + ': ' + val(v)).join(' · ') }) : null);
  }
  cargar();
}
