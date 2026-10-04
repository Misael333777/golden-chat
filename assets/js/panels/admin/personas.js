// Admin General → Clientes / Repartidores.
// Usa SOLO acciones existentes de Web API PROD (tipo admin_general): listar_personas, ver_persona, crear_persona, editar_persona,
// agregar_rol, quitar_rol, reactivar_rol, habilitar_acceso, deshabilitar_acceso.
// No hay reglas de negocio acá: el backend valida todo y su respuesta se muestra tal cual (mensaje + código).
// GLD: solo se muestra en la ficha individual (ver_persona). El listado no recibe ni muestra GLD, teléfono ni dirección.
import { TEXTO_FALLA } from '../../api.js';
import * as ops from '../../ops.js';
import { el, montar, aviso, avisoBackend, modal, confirmar, conBloqueo, toast, chipsRol, textoRol, textoLista } from '../../ui.js';

const TIPO = 'admin_general';
const ROLES_SECCION = ['cliente', 'repartidor']; // roles gestionables desde Clientes / Repartidores (admin nunca)
// Configuración → Admin Finanzas: misma lógica de personas; ahí solo se gestiona el rol admin_finanzas (crear_persona / agregar_rol existentes).
const rolesSeccion = (s) => (s.rol === 'admin_finanzas' ? ['admin_finanzas'] : ROLES_SECCION);
const ultimaBusqueda = { clientes: '', repartidores: '', 'configuracion/admin-finanzas': '' };

const str = (v) => (typeof v === 'string' ? v : null);
// Presentación: iniciales decorativas a partir del nombre que ya vino del backend (no se envía ni se guarda nada).
const iniciales = (n) => { const w = (str(n) || '').trim().split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };
const avatar = (n, extra) => el('span', { class: 'avatar' + (extra ? ' ' + extra : ''), 'aria-hidden': 'true', text: iniciales(n) });
const rolesDe = (p) => (Array.isArray(p && p.roles) ? p.roles.filter(r => r && typeof r === 'object') : []);

// ---------- avisos de transporte / operación sin confirmar ----------
export function avisoFalla(falla, alReintentar) {
  return el('div', { class: 'notice error stack', role: 'alert', 'data-falla': falla },
    el('span', { text: TEXTO_FALLA[falla] || 'No se pudo completar la solicitud.' }),
    alReintentar ? el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'reintentar-lectura', onclick: alReintentar }, 'Reintentar')) : null);
}
export function avisoSinConfirmar(falla, operacion_id, alReintentar, alDescartar) {
  const b = el('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-accion': 'reintentar-operacion' }, 'Reintentar la misma operación');
  b.addEventListener('click', conBloqueo(b, alReintentar, 'Reintentando…'));
  return el('div', { class: 'notice pending stack', role: 'alert', 'data-sin-confirmar': 'true', 'data-operacion-id': operacion_id },
    el('strong', { text: 'No pudimos confirmar si la operación se registró.' }),
    el('span', { text: (TEXTO_FALLA[falla] || '') + ' Reintentá la misma operación: si ya se había registrado, no se duplica.' }),
    el('div', { class: 'row' }, b,
      el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'descartar-operacion', onclick: alDescartar }, 'Descartar')));
}

// ======================= LISTADO =======================
export function vistaPersonas(ctx, cont, s) {
  const input = el('input', { class: 'input', id: 'buscar', type: 'search', maxlength: '100', placeholder: 'Buscar por nombre, teléfono o ID…', 'aria-label': 'Buscar', value: ultimaBusqueda[s.id] });
  const bBuscar = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-buscar' }, 'Buscar');
  const bNueva = el('button', { type: 'button', class: 'btn btn-gold', id: 'btn-nueva', onclick: () => abrirCrear(ctx, s) }, 'Nueva persona');
  const bAsignar = s.rol === 'admin_finanzas' ? el('button', { type: 'button', class: 'btn btn-ghost', id: 'btn-asignar-existente', onclick: () => abrirAsignar(ctx, s) }, 'Asignar a persona existente') : null;
  const zona = el('div', { class: 'stack', id: 'listado', 'data-seccion': s.id, 'data-estado': 'cargando' });
  const form = el('form', { class: 'row search-row', role: 'search' }, el('div', { class: 'field search-field', style: null }, input), bBuscar);
  form.firstChild.style.flex = '1 1 220px';
  form.addEventListener('submit', conBloqueo(bBuscar, async () => { ultimaBusqueda[s.id] = input.value.trim(); await cargar(); }, 'Buscando…'));

  montar(cont,
    el('div', { class: 'card stack section-card' },
      el('div', { class: 'card-head' },
        el('div', null, el('h2', { class: 'section-title', text: s.titulo }), el('p', { class: 'card-sub', text: 'Personas con rol ' + s.singular + '. El código de acceso, el teléfono y la dirección se ven en la ficha.' })),
        el('span', { class: 'spacer' }), bAsignar, bNueva),
      form),
    zona);

  async function cargar() {
    zona.dataset.estado = 'cargando';
    montar(zona, el('div', { class: 'list' }, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' })));
    const q = ultimaBusqueda[s.id];
    const res = await ctx.pedir(TIPO, 'listar_personas', q ? { buscar: q } : {});
    if (!zona.isConnected) return;
    zona.dataset.estado = 'listo';
    if (res.falla) return montar(zona, avisoFalla(res.falla, cargar));
    const r = res.r;
    if (!r.success) return montar(zona, avisoBackend(r));
    if (r.codigo !== 'PERSONAS_OK' || !r.datos || !Array.isArray(r.datos.personas)) return montar(zona, aviso('error', 'Respuesta inesperada del servidor.', r.codigo));
    // Filtro de PRESENTACIÓN por sección (qué personas tienen el rol de la sección). No es control de acceso.
    const lista = r.datos.personas.filter(p => p && rolesDe(p).some(x => x.rol === s.rol));
    if (!lista.length) {
      return montar(zona, el('div', { class: 'card empty', 'data-vacio': 'true' },
        el('span', { class: 'empty-ico empty-ico-search', 'aria-hidden': 'true' }),
        el('p', { text: q ? 'No hay ' + s.titulo.toLowerCase() + ' que coincidan con la búsqueda.' : 'Todavía no hay ' + s.titulo.toLowerCase() + '.' })));
    }
    montar(zona,
      el('p', { class: 'muted small', id: 'total', text: lista.length + (lista.length === 1 ? ' persona' : ' personas') + (q ? ' para “' + q + '”' : '') }),
      el('div', { class: 'tabla' },
        el('div', { class: 'tabla-head', 'aria-hidden': 'true' },
          el('span', { text: 'Nombre' }), el('span', { text: 'Lista de precio' }), el('span', { text: 'Estado' }), el('span', { text: 'Acceso' }), el('span', { text: 'Acciones' })),
        el('div', { class: 'list', id: 'lista-personas' }, lista.map(p => tarjetaPersona(ctx, s, p)))));
  }
  cargar();
}

function tarjetaPersona(ctx, s, p) {
  const pid = str(p.persona_id) || '';
  // Fila de tabla (presentación). Estado y acceso son los del rol de esta sección; los otros roles se nombran debajo del nombre.
  // Sin teléfono, dirección ni GLD (no vienen en el listado). "Ver" es decorativo: toda la fila abre la ficha, como antes.
  const roles = rolesDe(p);
  const r = roles.find(x => x.rol === s.rol);
  const otros = roles.filter(x => x.rol !== s.rol).map(x => textoRol(x.rol));
  const [chEstado, chAcceso] = r ? chipsRol(r) : [null, null];
  return el('button', { type: 'button', class: 'person-card', 'data-persona': pid, onclick: () => ctx.ir('#/admin/' + s.id + '/' + encodeURIComponent(pid)) },
    el('span', { class: 'pc-cell pc-nombre' },
      avatar(p.nombre),
      el('span', { class: 'person-id' },
        el('span', { class: 'person-name', text: str(p.nombre) || '(sin nombre)' }),
        otros.length ? el('span', { class: 'person-also', text: 'También: ' + otros.join(', ') }) : null)),
    el('span', { class: 'pc-cell pc-lista' }, el('span', { class: 'pc-label', text: 'Lista de precio: ' }), textoLista(p.lista_precio)),
    el('span', { class: 'pc-cell pc-estado', 'data-rol': r ? r.rol : null }, chEstado),
    el('span', { class: 'pc-cell pc-acceso' }, chAcceso),
    el('span', { class: 'pc-cell pc-acciones' }, el('span', { class: 'pc-ver', 'aria-hidden': 'true', text: 'Ver' })));
}

// ======================= CREAR =======================
function abrirCrear(ctx, s) {
  const nombre = el('input', { class: 'input', id: 'crear-nombre', maxlength: '120', autocomplete: 'off' });
  const telefono = el('input', { class: 'input', id: 'crear-telefono', maxlength: '30', autocomplete: 'off', inputmode: 'tel', placeholder: 'Con código de área' });
  const lista = s.rol === 'cliente' ? el('select', { class: 'select', id: 'crear-lista' },
    el('option', { value: '', text: 'Sin indicar (la define el sistema)' }), el('option', { value: 'minorista', text: 'Minorista' }), el('option', { value: 'mayorista', text: 'Mayorista' })) : null;
  const zona = el('div', { class: 'stack', id: 'crear-aviso' });
  const boton = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-crear' }, 'Crear persona');
  const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' },
    el('div', { class: 'form-grid' },
      el('div', { class: 'field' }, el('label', { for: 'crear-nombre', text: 'Nombre' }), nombre),
      el('div', { class: 'field' }, el('label', { for: 'crear-telefono', text: 'Teléfono (opcional)' }), telefono),
      lista ? el('div', { class: 'field' }, el('label', { for: 'crear-lista', text: 'Lista de precio' }), lista) : null,
      el('p', { class: 'muted small', text: 'Rol inicial: ' + textoRol(s.rol) + '.' })),
    boton, zona);
  const m = modal('Nueva persona — ' + s.singular, form);

  const camposBase = () => {
    const c = { nombre: nombre.value.trim(), rol_inicial: s.rol };
    if (telefono.value.trim()) c.telefono = telefono.value.trim();
    if (lista && lista.value) c.lista_precio = lista.value;
    return c;
  };
  async function enviar(extra) {
    const campos = Object.assign(camposBase(), extra || {});
    const res = await ops.ejecutar(ctx.base(TIPO), 'crear_persona', campos);
    if (res.sinConfirmar) {
      return montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => enviar(extra), () => { ops.descartar('crear_persona', campos); montar(zona); }));
    }
    const r = res.r;
    if (ctx.revisarFinSesion(r)) return m.cerrar();
    if (r.success && (r.codigo === 'PERSONA_CREADA' || r.codigo === 'OPERACION_YA_PROCESADA') && r.datos && str(r.datos.persona_id)) {
      m.cerrar();
      toast(r.mensaje || 'Persona creada.');
      return ctx.ir('#/admin/' + s.id + '/' + encodeURIComponent(r.datos.persona_id));
    }
    if (!r.success && r.codigo === 'POSIBLE_DUPLICADO' && r.datos && Array.isArray(r.datos.candidatos)) {
      const ids = r.datos.candidatos.map(c => str(c.persona_id)).filter(Boolean);
      const bDistinta = el('button', { type: 'button', class: 'btn btn-gold btn-sm', 'data-accion': 'crear-distinta' }, 'Crear igual, es otra persona');
      bDistinta.addEventListener('click', conBloqueo(bDistinta, () => enviar({ confirmar_persona_distinta: true, candidatos_revisados: ids }), 'Creando…'));
      return montar(zona, avisoBackend(r), listaCandidatos(ctx, s, r.datos.candidatos, m), el('div', { class: 'row' }, bDistinta));
    }
    if (!r.success && r.datos && Array.isArray(r.datos.personas) && r.datos.personas.length) {
      return montar(zona, avisoBackend(r), listaCandidatos(ctx, s, r.datos.personas, m));
    }
    montar(zona, avisoBackend(r));
  }
  form.addEventListener('submit', conBloqueo(boton, async () => {
    montar(zona);
    if (!nombre.value.trim()) { montar(zona, aviso('error', 'Ingresá el nombre.')); nombre.focus(); return; }
    await enviar();
  }, 'Creando…'));
}

function listaCandidatos(ctx, s, personas, m) {
  return el('div', { class: 'stack', 'data-candidatos': 'true' }, personas.filter(p => p && typeof p === 'object').map(p =>
    el('div', { class: 'card stack candidate-card', style: null },
      el('strong', { text: str(p.nombre) || '(sin nombre)' }),
      el('span', { class: 'small muted', text: 'Teléfono: ' + (str(p.telefono) || 'sin teléfono') }),
      el('div', { class: 'chips' }, rolesDe(p).map(r => el('span', { class: 'chip', text: textoRol(r.rol) + (r.estado ? ' · ' + r.estado : '') }))),
      el('div', { class: 'row' }, el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'ver-candidato',
        onclick: () => { m.cerrar(); ctx.ir('#/admin/' + s.id + '/' + encodeURIComponent(p.persona_id)); } }, 'Ver ficha (usar esta persona)')))));
}

// ======================= ASIGNAR ADMIN FINANZAS A UNA PERSONA EXISTENTE =======================
// Busca entre todas las personas (listar_personas) y usa agregar_rol: misma persona, mismo persona_id y mismo código de acceso.
function abrirAsignar(ctx, s) {
  const iBus = el('input', { class: 'input', id: 'asignar-buscar', type: 'search', maxlength: '100', placeholder: 'Nombre o teléfono…', autocomplete: 'off', 'aria-label': 'Buscar persona' });
  const bBus = el('button', { type: 'submit', class: 'btn btn-primary', id: 'asignar-btn-buscar' }, 'Buscar');
  const zona = el('div', { class: 'stack', id: 'asignar-resultados' });
  const form = el('form', { class: 'row search-row', role: 'search', novalidate: true }, el('div', { class: 'field search-field' }, iBus), bBus);
  form.firstChild.style.flex = '1 1 220px';
  const m = modal('Asignar ' + s.singular + ' a una persona existente', el('div', { class: 'stack' },
    el('p', { class: 'muted small', text: 'La persona conserva sus datos, sus otros roles y su mismo código de acceso.' }), form, zona));
  async function asignar(p, b, aviso1) {
    const campos = { persona_id: p.persona_id, rol: s.rol };
    const res = await ops.ejecutar(ctx.base(TIPO), 'agregar_rol', campos);
    if (res.sinConfirmar) return montar(aviso1, avisoSinConfirmar(res.falla, res.operacion_id, () => asignar(p, b, aviso1), () => { ops.descartar('agregar_rol', campos); montar(aviso1); }));
    if (ctx.revisarFinSesion(res.r)) return m.cerrar();
    if (res.r.success) { m.cerrar(); toast(res.r.mensaje || 'Rol asignado.'); return ctx.ir('#/admin/' + s.id + '/' + encodeURIComponent(p.persona_id)); }
    montar(aviso1, avisoBackend(res.r));
  }
  form.addEventListener('submit', conBloqueo(bBus, async () => {
    const q = iBus.value.trim();
    if (!q) return montar(zona, aviso('error', 'Escribí un nombre o un teléfono.'));
    montar(zona, el('div', { class: 'skeleton' }));
    const res = await ctx.pedir(TIPO, 'listar_personas', { buscar: q });
    if (!zona.isConnected) return;
    if (res.falla) return montar(zona, avisoFalla(res.falla));
    if (ctx.revisarFinSesion(res.r)) return m.cerrar();
    if (!res.r.success) return montar(zona, avisoBackend(res.r));
    const lista = ((res.r.datos || {}).personas || []).filter(p => p && str(p.persona_id));
    if (!lista.length) return montar(zona, el('p', { class: 'muted small', text: 'No hay personas que coincidan.' }));
    montar(zona, lista.map(p => {
      const r = rolesDe(p).find(x => x.rol === s.rol);
      const aviso1 = el('div', { class: 'stack' });
      const b = el('button', { type: 'button', class: 'btn btn-gold btn-sm', 'data-accion': 'asignar-rol' }, 'Asignar ' + s.singular);
      b.addEventListener('click', conBloqueo(b, () => asignar(p, b, aviso1), 'Asignando…'));
      const verFicha = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'ver-ficha', onclick: () => { m.cerrar(); ctx.ir('#/admin/' + s.id + '/' + encodeURIComponent(p.persona_id)); } }, 'Ver ficha');
      return el('div', { class: 'card stack candidate-card', 'data-persona': p.persona_id },
        el('strong', { text: str(p.nombre) || '(sin nombre)' }),
        el('div', { class: 'chips' }, rolesDe(p).map(x => el('span', { class: 'chip', text: textoRol(x.rol) + (x.estado ? ' · ' + x.estado : '') }))),
        el('div', { class: 'row' }, r ? el('span', { class: 'small muted', text: r.estado === 'activo' ? 'Ya tiene este rol.' : 'Tiene el rol inactivo: reactivalo desde la ficha.' }) : b, verFicha),
        aviso1);
    }));
  }, 'Buscando…'));
}

// ======================= FICHA =======================
export function vistaFicha(ctx, cont, s, pid) {
  const avisos = el('div', { class: 'stack', id: 'ficha-aviso' });
  const cuerpo = el('div', { class: 'stack', id: 'ficha', 'data-ficha': pid, 'data-estado': 'cargando' });
  montar(cont, el('a', { class: 'btn btn-ghost btn-sm btn-back', href: '#/admin/' + s.id, style: null }, 'Volver a ' + s.titulo.toLowerCase()), avisos, cuerpo);
  cont.firstChild.style.alignSelf = 'flex-start';
  let ocupado = false;

  function bloquear(v) {
    ocupado = v;
    for (const b of cuerpo.querySelectorAll('[data-op]')) b.disabled = v;
  }

  async function cargar() {
    cuerpo.dataset.estado = 'cargando';
    montar(cuerpo, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
    const res = await ctx.pedir(TIPO, 'ver_persona', { persona_id: pid });
    if (!cuerpo.isConnected) return;
    cuerpo.dataset.estado = 'listo';
    if (res.falla) return montar(cuerpo, avisoFalla(res.falla, cargar));
    const r = res.r;
    if (!r.success) return montar(cuerpo, avisoBackend(r));
    const p = r.datos && r.datos.persona;
    if (r.codigo !== 'PERSONA_OK' || !p || typeof p !== 'object') return montar(cuerpo, aviso('error', 'Respuesta inesperada del servidor.', r.codigo));
    pintar(p);
  }

  // Ejecuta una escritura y muestra el resultado del backend tal cual. Tras un éxito recarga la ficha.
  async function operar(accion, campos) {
    if (ocupado) return;
    bloquear(true);
    montar(avisos);
    try {
      const res = await ops.ejecutar(ctx.base(TIPO), accion, campos);
      if (res.sinConfirmar) {
        montar(avisos, avisoSinConfirmar(res.falla, res.operacion_id, () => operar(accion, campos), () => { ops.descartar(accion, campos); montar(avisos); }));
        return res;
      }
      if (ctx.revisarFinSesion(res.r)) return res;
      montar(avisos, avisoBackend(res.r));
      if (res.r.success) await cargar();
      return res;
    } finally { if (cuerpo.isConnected) bloquear(false); }
  }

  function pintar(p) {
    const roles = rolesDe(p);
    // --- datos ---
    const bEditar = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-op': 'editar', id: 'btn-editar', onclick: () => { montar(avisos); abrirEditar(p); } }, 'Editar datos');
    // Presentación: cabecera con roles activos e ID; datos en dos columnas; "Estado" = estado del rol de esta sección (dato del backend).
    const dato = (ico, dt, dd) => el('div', { class: 'dl-item', 'data-ico': ico }, dt, dd);
    const activos = roles.filter(r => r.estado === 'activo').map(r => textoRol(r.rol));
    const rSec = roles.find(r => r.rol === s.rol);
    const datos = el('div', { class: 'card stack', id: 'ficha-datos' },
      el('div', { class: 'card-head ficha-head' },
        avatar(p.nombre, 'avatar-lg'),
        el('div', { class: 'ficha-title' }, el('h2', { id: 'ficha-nombre', text: str(p.nombre) || '(sin nombre)' }),
          el('span', { class: 'ficha-sub' }, (activos.length ? activos.join(', ') : 'Sin roles activos') + ' · ID: ' + (str(p.persona_id) || ''))),
        el('span', { class: 'spacer' }), bEditar),
      el('div', { class: 'ficha-cols' },
        el('dl', { class: 'dl' },
          dato('phone', el('dt', { text: 'Teléfono' }), el('dd', { id: 'ficha-telefono', text: str(p.telefono) || 'Sin teléfono' })),
          dato('pin', el('dt', { text: 'Dirección' }), el('dd', { id: 'ficha-direccion', text: str(p.direccion) || 'Sin dirección' })),
          dato('tag', el('dt', { text: 'Lista de precio' }), el('dd', { id: 'ficha-lista', text: textoLista(p.lista_precio) }))),
        el('dl', { class: 'dl' },
          dato('cal', el('dt', { text: 'Fecha de alta' }), el('dd', { text: str(p.fecha_alta) ? fecha(p.fecha_alta) : '—' })),
          dato('estado', el('dt', { text: 'Estado' }), el('dd', null, rSec ? chipsRol(rSec)[0] : el('span', { class: 'muted', text: '—' }))))));
    // --- código GLD (solo ficha) ---
    const gld = str(p.codigo_acceso);
    const valor = el('span', { class: 'gld-code', id: 'gld-valor', text: gld || 'Sin código registrado' });
    const bCopiar = gld ? el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'btn-copiar-gld' }, 'Copiar código') : null;
    if (bCopiar) bCopiar.addEventListener('click', () => copiar(gld, valor));
    const codigo = el('div', { class: 'card stack card-gld', id: 'ficha-gld' },
      el('div', { class: 'gld-head' },
        el('div', null, el('h3', { class: 'h-ico h-ico-lock', text: 'Código de acceso' }),
          el('p', { class: 'muted small', text: 'Visible solo para Admin General. Entregalo únicamente a la persona.' }))),
      el('div', { class: 'gld-box' }, valor, el('span', { class: 'spacer' }), bCopiar));
    // --- roles ---
    const presentes = roles.map(r => r.rol);
    const agregables = rolesSeccion(s).filter(x => !presentes.includes(x));
    const bAgregar = agregables.length ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-op': 'agregar', id: 'btn-agregar-rol', onclick: () => { montar(avisos); abrirAgregar(p, agregables); } }, 'Agregar rol') : null;
    const filas = roles.map(r => filaRol(p, r));
    const rolesCard = el('div', { class: 'card stack', id: 'ficha-roles' },
      el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-roles', text: 'Roles y acceso' }), el('span', { class: 'spacer' }), bAgregar),
      filas.length ? el('div', { class: 'role-list' }, filas) : el('p', { class: 'muted', text: 'Sin roles.' }));
    montar(cuerpo, datos, codigo, rolesCard);
  }

  function filaRol(p, r) {
    const acciones = [];
    const gestionable = rolesSeccion(s).includes(r.rol);
    const boton = (txt, clase, accion, sensible) => {
      const b = el('button', { type: 'button', class: 'btn btn-sm ' + clase, 'data-op': accion, 'data-rol': r.rol });
      b.textContent = txt;
      b.addEventListener('click', conBloqueo(b, async () => {
        if (sensible && !(await confirmar(txt + ' — ' + textoRol(r.rol), '¿Confirmás ' + txt.toLowerCase() + ' de ' + textoRol(r.rol) + ' para ' + (str(p.nombre) || 'esta persona') + '?', txt))) return;
        await operar(accion, { persona_id: p.persona_id, rol: r.rol });
      }, 'Enviando…'));
      return b;
    };
    if (gestionable && r.estado === 'activo') {
      acciones.push(r.acceso_habilitado === true ? boton('Deshabilitar acceso', 'btn-danger', 'deshabilitar_acceso', true) : boton('Habilitar acceso', 'btn-primary', 'habilitar_acceso', false));
      acciones.push(boton('Quitar rol', 'btn-danger', 'quitar_rol', true));
    } else if (gestionable && r.estado === 'inactivo') {
      acciones.push(boton('Reactivar rol', 'btn-ghost', 'reactivar_rol', false));
    }
    return el('div', { class: 'role-row', 'data-fila-rol': r.rol },
      el('span', { class: 'role-main' }, el('span', { class: 'role-name', text: textoRol(r.rol) }), el('span', { class: 'chips' }, chipsRol(r))),
      el('span', { class: 'spacer' }),
      gestionable ? el('span', { class: 'role-actions' }, acciones) : el('span', { class: 'small muted', text: 'Se gestiona fuera de esta sección.' }),
      gestionable && r.estado === 'inactivo' ? el('span', { class: 'small muted', style: null, text: 'Reactivar no habilita el acceso: después usá “Habilitar acceso”.' }) : null);
  }

  function abrirEditar(p) {
    const iNombre = el('input', { class: 'input', id: 'editar-nombre', maxlength: '120', value: str(p.nombre) || '' });
    const iTel = el('input', { class: 'input', id: 'editar-telefono', maxlength: '30', inputmode: 'tel', value: str(p.telefono) || '' });
    const iDir = el('input', { class: 'input', id: 'editar-direccion', maxlength: '200', value: str(p.direccion) || '' });
    const zona = el('div', { class: 'stack', id: 'editar-aviso' });
    const boton = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-guardar' }, 'Guardar cambios');
    const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' },
      el('div', { class: 'form-grid' },
        el('div', { class: 'field' }, el('label', { for: 'editar-nombre', text: 'Nombre' }), iNombre),
        el('div', { class: 'field' }, el('label', { for: 'editar-telefono', text: 'Teléfono' }), iTel, el('span', { class: 'hint', text: 'Dejalo vacío para quitarlo.' })),
        el('div', { class: 'field' }, el('label', { for: 'editar-direccion', text: 'Dirección' }), iDir, el('span', { class: 'hint', text: 'Dejala vacía para quitarla.' })),
        el('p', { class: 'muted small', text: 'La lista de precio y el código de acceso no se modifican desde acá.' })),
      boton, zona);
    const m = modal('Editar datos', form);
    async function enviar(campos) {
      const res = await ops.ejecutar(ctx.base(TIPO), 'editar_persona', campos);
      if (res.sinConfirmar) return montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => enviar(campos), () => { ops.descartar('editar_persona', campos); montar(zona); }));
      if (ctx.revisarFinSesion(res.r)) return m.cerrar();
      if (res.r.success) { m.cerrar(); montar(avisos, avisoBackend(res.r)); return cargar(); }
      montar(zona, avisoBackend(res.r));
    }
    form.addEventListener('submit', conBloqueo(boton, async () => {
      montar(zona);
      const campos = { persona_id: p.persona_id };
      const cambio = (k, nuevo) => { const viejo = str(p[k]) || ''; if (nuevo !== viejo) campos[k] = nuevo === '' ? null : nuevo; };
      cambio('nombre', iNombre.value.trim()); cambio('telefono', iTel.value.trim()); cambio('direccion', iDir.value.trim());
      if (Object.keys(campos).length === 1) { montar(zona, aviso('info', 'No hay cambios para guardar.')); return; }
      await enviar(campos);
    }, 'Guardando…'));
  }

  function abrirAgregar(p, agregables) {
    const sel = el('select', { class: 'select', id: 'agregar-rol' }, agregables.map(x => el('option', { value: x, text: textoRol(x) })));
    const lista = el('select', { class: 'select', id: 'agregar-lista' },
      el('option', { value: '', text: 'Sin indicar (la define el sistema)' }), el('option', { value: 'minorista', text: 'Minorista' }), el('option', { value: 'mayorista', text: 'Mayorista' }));
    const campoLista = el('div', { class: 'field' }, el('label', { for: 'agregar-lista', text: 'Lista de precio' }), lista);
    const sync = () => { campoLista.hidden = sel.value !== 'cliente'; };
    sel.addEventListener('change', sync); sync();
    const zona = el('div', { class: 'stack', id: 'agregar-aviso' });
    const boton = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-confirmar-rol' }, 'Agregar rol');
    const form = el('form', { class: 'stack', novalidate: true },
      el('div', { class: 'field' }, el('label', { for: 'agregar-rol', text: 'Rol' }), sel), campoLista, boton, zona);
    const m = modal('Agregar rol', form);
    async function enviar(campos) {
      const res = await ops.ejecutar(ctx.base(TIPO), 'agregar_rol', campos);
      if (res.sinConfirmar) return montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => enviar(campos), () => { ops.descartar('agregar_rol', campos); montar(zona); }));
      if (ctx.revisarFinSesion(res.r)) return m.cerrar();
      if (res.r.success) { m.cerrar(); montar(avisos, avisoBackend(res.r)); return cargar(); }
      montar(zona, avisoBackend(res.r));
    }
    form.addEventListener('submit', conBloqueo(boton, async () => {
      montar(zona);
      const campos = { persona_id: p.persona_id, rol: sel.value };
      if (sel.value === 'cliente' && lista.value) campos.lista_precio = lista.value;
      await enviar(campos);
    }, 'Agregando…'));
  }

  cargar();
}

async function copiar(texto, nodo) {
  try {
    await navigator.clipboard.writeText(texto);
    toast('Código copiado.');
  } catch (e) {
    // Sin permiso de portapapeles: se selecciona el código para copiarlo a mano.
    const rango = document.createRange(); rango.selectNodeContents(nodo);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rango);
    toast('No se pudo copiar automáticamente. El código quedó seleccionado.');
  }
}

function fecha(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return String(iso);
  return new Date(t).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' });
}
