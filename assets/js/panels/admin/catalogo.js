// Admin General → Catálogo.
// Usa SOLO acciones existentes de Web API PROD (tipo admin_general → Admin Gestion PROD, H10): listar_productos, ver_producto,
// crear_producto, editar_producto, cambiar_precios, activar_producto, desactivar_producto.
// Reglas: el backend valida todo y su respuesta se muestra tal cual (mensaje + código). El producto_id lo asigna el sistema.
// Conceptos SEPARADOS: visibilidad por rol (visible_clientes / visible_repartidores) ≠ precio por lista (minorista / mayorista).
// Búsqueda y filtros: se aplican sobre el listado completo que devuelve el backend (no hay datos sensibles en el catálogo).
import * as ops from '../../ops.js';
import { el, montar, aviso, avisoBackend, modal, confirmar, conBloqueo, toast } from '../../ui.js';
import { avisoFalla, avisoSinConfirmar } from './personas.js';
import { selectorImagen, mostrarImagen } from './imagenes.js';

const TIPO = 'admin_general';
const filtros = { texto: '', estado: 'todos', visibilidad: 'todas', categoria: '' };
let categoriasConocidas = [];

const str = (v) => (typeof v === 'string' ? v : null);
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const precio = (v) => (typeof v === 'number' && Number.isFinite(v) ? money.format(v) : '—');
const sinTilde = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const inicial = (n) => { const w = (str(n) || '?').trim().split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w.length > 1 ? w[1][0] : '')).toUpperCase(); };
const chipEstado = (p) => p.activo === true ? el('span', { class: 'chip ok', text: 'Activo' }) : el('span', { class: 'chip off', text: 'Inactivo' });
const chipVisible = (v) => v === true ? el('span', { class: 'chip ok', text: 'Visible' }) : el('span', { class: 'chip warn', text: 'Oculto' });
// Lista de quién VE el producto (no dice nada del precio).
function chipsVisibilidad(p) {
  const out = [];
  if (p.visible_clientes === true) out.push(el('span', { class: 'chip gold', text: 'Clientes' }));
  if (p.visible_repartidores === true) out.push(el('span', { class: 'chip gold', text: 'Repartidores' }));
  if (!out.length) out.push(el('span', { class: 'chip warn', text: 'Oculto para todos' }));
  return out;
}

// ======================= LISTADO =======================
export function vistaCatalogo(ctx, cont) {
  const bNuevo = el('button', { type: 'button', class: 'btn btn-gold', id: 'btn-nuevo-producto', onclick: () => abrirCrear(ctx) }, 'Nuevo producto');
  const iTexto = el('input', { class: 'input', id: 'cat-buscar', type: 'search', maxlength: '100', placeholder: 'Buscar por nombre o categoría…', 'aria-label': 'Buscar producto', value: filtros.texto });
  const sEstado = el('select', { class: 'select', id: 'cat-estado', 'aria-label': 'Estado' },
    el('option', { value: 'todos', text: 'Todos los estados' }), el('option', { value: 'activos', text: 'Activos' }), el('option', { value: 'inactivos', text: 'Inactivos' }));
  const sVis = el('select', { class: 'select', id: 'cat-visibilidad', 'aria-label': 'Visibilidad' },
    el('option', { value: 'todas', text: 'Toda visibilidad' }), el('option', { value: 'clientes', text: 'Visibles para clientes' }),
    el('option', { value: 'repartidores', text: 'Visibles para repartidores' }), el('option', { value: 'ocultos', text: 'Ocultos para todos' }));
  const sCat = el('select', { class: 'select', id: 'cat-categoria', 'aria-label': 'Categoría' }, el('option', { value: '', text: 'Todas las categorías' }));
  sEstado.value = filtros.estado; sVis.value = filtros.visibilidad;
  const zona = el('div', { class: 'stack', id: 'catalogo', 'data-estado': 'cargando' });
  montar(cont,
    el('div', { class: 'card stack section-card' },
      el('div', { class: 'card-head' },
        el('div', null, el('h2', { class: 'section-title', text: 'Catálogo' }),
          el('p', { class: 'card-sub', text: 'Productos, visibilidad por rol y precios por lista. Quién ve un producto y qué precio paga son cosas distintas.' })),
        el('span', { class: 'spacer' }), bNuevo),
      el('div', { class: 'cat-filtros' },
        el('div', { class: 'field search-field cat-buscar' }, iTexto), sEstado, sVis, sCat)),
    zona);

  let lista = null;
  const pintar = () => {
    if (!lista) return;
    const q = sinTilde(filtros.texto.trim());
    const vis = lista.filter(p =>
      (!q || sinTilde(p.producto).includes(q) || sinTilde(p.categoria).includes(q)) &&
      (filtros.estado === 'todos' || (filtros.estado === 'activos' ? p.activo === true : p.activo !== true)) &&
      (filtros.visibilidad === 'todas' || (filtros.visibilidad === 'clientes' && p.visible_clientes === true) ||
        (filtros.visibilidad === 'repartidores' && p.visible_repartidores === true) ||
        (filtros.visibilidad === 'ocultos' && p.visible_clientes !== true && p.visible_repartidores !== true)) &&
      (!filtros.categoria || p.categoria === filtros.categoria));
    const activos = lista.filter(p => p.activo === true).length;
    const resumen = el('p', { class: 'muted small', id: 'cat-total', text: lista.length + ' productos · ' + activos + ' activos · ' + (lista.length - activos) + ' inactivos' +
      (vis.length !== lista.length ? ' · mostrando ' + vis.length : '') });
    if (!vis.length) return montar(zona, resumen, el('div', { class: 'card empty', 'data-vacio': 'true' },
      el('span', { class: 'empty-ico empty-ico-search', 'aria-hidden': 'true' }),
      el('p', { text: lista.length ? 'No hay productos que coincidan con los filtros.' : 'Todavía no hay productos en el catálogo.' })));
    montar(zona, resumen, el('div', { class: 'tabla tabla-cat' },
      el('div', { class: 'tabla-head cat-row-grid', 'aria-hidden': 'true' },
        el('span', { text: 'Producto' }), el('span', { text: 'Minorista' }), el('span', { text: 'Mayorista' }), el('span', { text: 'Visible para' }), el('span', { text: 'Estado' }), el('span', { text: 'Acciones' })),
      el('div', { class: 'list', id: 'lista-productos' }, vis.map(p => filaProducto(ctx, p)))));
  };
  iTexto.addEventListener('input', () => { filtros.texto = iTexto.value; pintar(); });
  sEstado.addEventListener('change', () => { filtros.estado = sEstado.value; pintar(); });
  sVis.addEventListener('change', () => { filtros.visibilidad = sVis.value; pintar(); });
  sCat.addEventListener('change', () => { filtros.categoria = sCat.value; pintar(); });

  async function cargar() {
    zona.dataset.estado = 'cargando';
    montar(zona, el('div', { class: 'list' }, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' })));
    const res = await ctx.pedir(TIPO, 'listar_productos', {});
    if (!zona.isConnected) return;
    zona.dataset.estado = 'listo';
    if (res.falla) return montar(zona, avisoFalla(res.falla, cargar));
    const r = res.r;
    if (!r.success) return montar(zona, avisoBackend(r));
    if (r.codigo !== 'PRODUCTOS_OK' || !r.datos || !Array.isArray(r.datos.productos)) return montar(zona, aviso('error', 'Respuesta inesperada del servidor.', r.codigo));
    lista = r.datos.productos.filter(p => p && Number.isInteger(p.producto_id));
    categoriasConocidas = [...new Set(lista.map(p => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    montar(sCat, el('option', { value: '', text: 'Todas las categorías' }), categoriasConocidas.map(c => el('option', { value: c, text: c })));
    if (filtros.categoria && !categoriasConocidas.includes(filtros.categoria)) filtros.categoria = '';
    sCat.value = filtros.categoria;
    pintar();
  }
  cargar();
}

function filaProducto(ctx, p) {
  return el('button', { type: 'button', class: 'person-card prod-row cat-row-grid', 'data-producto': String(p.producto_id), onclick: () => ctx.ir('#/admin/catalogo/' + p.producto_id) },
    el('span', { class: 'pc-cell pc-nombre' }, el('span', { class: 'avatar avatar-prod', 'aria-hidden': 'true', text: inicial(p.producto) }),
      el('span', { class: 'person-id' }, el('span', { class: 'person-name', text: str(p.producto) || '(sin nombre)' }),
        el('span', { class: 'person-also', text: [str(p.categoria), str(p.unidad)].filter(Boolean).join(' · ') }))),
    el('span', { class: 'pc-cell cat-precio', 'data-precio': 'minorista' }, el('span', { class: 'pc-label', text: 'Minorista: ' }), precio(p.precio_minorista)),
    el('span', { class: 'pc-cell cat-precio', 'data-precio': 'mayorista' }, el('span', { class: 'pc-label', text: 'Mayorista: ' }), precio(p.precio_mayorista)),
    el('span', { class: 'pc-cell cat-vis chips' }, chipsVisibilidad(p)),
    el('span', { class: 'pc-cell cat-estado' }, chipEstado(p)),
    el('span', { class: 'pc-cell pc-acciones' }, el('span', { class: 'pc-ver', 'aria-hidden': 'true', text: 'Ver' })));
}

// ======================= helpers de formulario =======================
const numOrNull = (v) => { const t = String(v == null ? '' : v).trim(); if (t === '') return null; const n = Number(t.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const txtOrNull = (v) => { const t = String(v == null ? '' : v).trim(); return t === '' ? null : t; };
const campo = (id, label, input, hint) => el('div', { class: 'field' }, el('label', { for: id, text: label }), input, hint ? el('span', { class: 'hint', text: hint }) : null);
const check = (id, label, checked) => {
  const i = el('input', { type: 'checkbox', id, checked: !!checked });
  return { input: i, nodo: el('label', { class: 'check', for: id }, i, el('span', { text: label })) };
};
function resultadoNegocio(ctx, r) {
  const extra = [];
  const d = r.datos || {};
  if (r.codigo === 'PRODUCTO_EN_RECURRENTES_ACTIVOS' && Array.isArray(d.por_persona)) {
    extra.push(el('div', { class: 'notice info stack', 'data-recurrentes': String(d.cantidad_recurrentes || 0) },
      el('strong', { text: 'Lo usan ' + (d.cantidad_personas || d.por_persona.length) + ' persona(s) en su pedido habitual:' }),
      el('ul', { class: 'lista-simple' }, d.por_persona.map(x => el('li', { text: (x.nombre || x.persona_id) + (x.dias && x.dias.length ? ' — ' + x.dias.join(', ') : '') })))));
  }
  const existente = d.producto_existente;
  if (r.codigo === 'PRODUCTO_DUPLICADO' && existente && Number.isInteger(existente.producto_id)) {
    extra.push(el('div', { class: 'row' }, el('a', { class: 'btn btn-ghost btn-sm', href: '#/admin/catalogo/' + existente.producto_id, 'data-accion': 'ver-existente' },
      'Ver “' + (existente.producto || 'producto existente') + '”')));
  }
  return [avisoBackend(r)].concat(extra);
}

// ======================= ALTA =======================
function abrirCrear(ctx) {
  const lista = el('datalist', { id: 'cat-categorias' }, categoriasConocidas.map(c => el('option', { value: c })));
  const iCat = el('input', { class: 'input', id: 'crear-categoria', maxlength: '60', autocomplete: 'off', list: 'cat-categorias' });
  const iNom = el('input', { class: 'input', id: 'crear-producto', maxlength: '120', autocomplete: 'off' });
  const iUni = el('input', { class: 'input', id: 'crear-unidad', maxlength: '20', autocomplete: 'off', placeholder: 'u, kg, doc, porción…' });
  const iMin = el('input', { class: 'input', id: 'crear-minorista', type: 'number', min: '0', step: '0.01', inputmode: 'decimal' });
  const iMay = el('input', { class: 'input', id: 'crear-mayorista', type: 'number', min: '0', step: '0.01', inputmode: 'decimal' });
  const cCli = check('crear-visible-clientes', 'Visible para clientes', true);
  const cRep = check('crear-visible-repartidores', 'Visible para repartidores', true);
  const cAct = check('crear-activo', 'Activo', true);
  const iPres = el('input', { class: 'input', id: 'crear-presentacion', maxlength: '120', autocomplete: 'off' });
  const iPeso = el('input', { class: 'input', id: 'crear-peso', type: 'number', min: '0', step: '0.001', inputmode: 'decimal' });
  const selImg = selectorImagen(ctx, { id: 'crear-imagen', actual: null, destino: 'producto', etiqueta: 'Imagen del producto' }); // archivo, nunca URL
  const zona = el('div', { class: 'stack', id: 'crear-producto-aviso' });
  const boton = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-crear-producto' }, 'Crear producto');
  const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' }, lista,
    el('div', { class: 'form-grid two' },
      campo('crear-categoria', 'Categoría', iCat), campo('crear-producto', 'Nombre', iNom), campo('crear-unidad', 'Unidad', iUni),
      campo('crear-presentacion', 'Presentación (opcional)', iPres)),
    el('fieldset', { class: 'grupo' }, el('legend', { text: 'Precios por lista' }),
      el('div', { class: 'form-grid two' }, campo('crear-minorista', 'Precio minorista', iMin), campo('crear-mayorista', 'Precio mayorista', iMay))),
    el('fieldset', { class: 'grupo' }, el('legend', { text: 'Visibilidad por rol' }),
      el('div', { class: 'checks' }, cCli.nodo, cRep.nodo),
      el('span', { class: 'hint', text: 'Define quién ve el producto. No cambia qué precio paga cada persona.' })),
    el('div', { class: 'form-grid two' }, campo('crear-peso', 'Peso por unidad en kg (opcional)', iPeso), el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'Imagen (opcional)' }), selImg.nodo)),
    el('div', { class: 'checks' }, cAct.nodo),
    boton, zona);
  const m = modal('Nuevo producto', form);
  const datos = () => {
    const d = { categoria: iCat.value, producto: iNom.value, unidad: iUni.value, precio_minorista: numOrNull(iMin.value), precio_mayorista: numOrNull(iMay.value),
      visible_clientes: cCli.input.checked, visible_repartidores: cRep.input.checked, activo: cAct.input.checked };
    const pres = txtOrNull(iPres.value); if (pres !== null) d.presentacion = pres;
    const peso = numOrNull(iPeso.value); if (peso !== null) d.peso_kg_unidad = peso;
    return d;
  };
  async function enviar(campos) {
    const res = await ops.ejecutar(ctx.base(TIPO), 'crear_producto', campos);
    if (res.sinConfirmar) return montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => enviar(campos), () => { ops.descartar('crear_producto', campos); montar(zona); }));
    const r = res.r;
    if (ctx.revisarFinSesion(r)) return m.cerrar();
    if (r.success && r.datos && r.datos.producto && Number.isInteger(r.datos.producto.producto_id)) {
      m.cerrar(); toast(r.mensaje || 'Producto creado.');
      return ctx.ir('#/admin/catalogo/' + r.datos.producto.producto_id);
    }
    montar(zona, resultadoNegocio(ctx, r));
  }
  form.addEventListener('submit', conBloqueo(boton, async () => {
    montar(zona);
    const d = datos();
    if (!txtOrNull(d.categoria) || !txtOrNull(d.producto) || !txtOrNull(d.unidad)) return montar(zona, aviso('error', 'Completá categoría, nombre y unidad.'));
    if (d.precio_minorista === null || d.precio_mayorista === null || Number.isNaN(d.precio_minorista) || Number.isNaN(d.precio_mayorista) || d.precio_minorista < 0 || d.precio_mayorista < 0)
      return montar(zona, aviso('error', 'Indicá los dos precios con un número mayor o igual a 0.'));
    if (Number.isNaN(d.peso_kg_unidad)) return montar(zona, aviso('error', 'El peso debe ser un número.'));
    const img = await selImg.resolver();
    if (img.error) return montar(zona, aviso('error', img.error));
    if (img.url) d.imagen_url = img.url;
    await enviar(d);
  }, 'Creando…'));
}

// ======================= FICHA =======================
export function vistaProducto(ctx, cont, idTexto) {
  const id = /^\d{1,9}$/.test(idTexto) ? Number(idTexto) : null;
  const avisos = el('div', { class: 'stack', id: 'prod-aviso' });
  const cuerpo = el('div', { class: 'stack', id: 'prod-ficha', 'data-producto-id': idTexto, 'data-estado': 'cargando' });
  montar(cont, el('a', { class: 'btn btn-ghost btn-sm btn-back', href: '#/admin/catalogo' }, 'Volver a catálogo'), avisos, cuerpo);
  if (!id) { cuerpo.dataset.estado = 'listo'; return montar(cuerpo, aviso('error', 'Producto inválido.', 'PRODUCTO_INVALIDO')); }
  let ocupado = false;
  const bloquear = (v) => { ocupado = v; for (const b of cuerpo.querySelectorAll('[data-op]')) b.disabled = v; };

  async function cargar() {
    cuerpo.dataset.estado = 'cargando';
    montar(cuerpo, el('div', { class: 'skeleton' }), el('div', { class: 'skeleton' }));
    const res = await ctx.pedir(TIPO, 'ver_producto', { producto_id: id });
    if (!cuerpo.isConnected) return;
    cuerpo.dataset.estado = 'listo';
    if (res.falla) return montar(cuerpo, avisoFalla(res.falla, cargar));
    const r = res.r;
    if (!r.success) return montar(cuerpo, avisoBackend(r));
    if (r.codigo !== 'PRODUCTO_OK' || !r.datos || !r.datos.producto) return montar(cuerpo, aviso('error', 'Respuesta inesperada del servidor.', r.codigo));
    pintar(r.datos.producto);
  }

  // Escritura: muestra el resultado del backend tal cual. Tras un éxito pinta el producto devuelto (estado real de la tabla).
  async function operar(accion, campos) {
    if (ocupado) return;
    bloquear(true); montar(avisos);
    try {
      const res = await ops.ejecutar(ctx.base(TIPO), accion, campos);
      if (res.sinConfirmar) { montar(avisos, avisoSinConfirmar(res.falla, res.operacion_id, () => operar(accion, campos), () => { ops.descartar(accion, campos); montar(avisos); })); return res; }
      if (ctx.revisarFinSesion(res.r)) return res;
      montar(avisos, resultadoNegocio(ctx, res.r));
      if (res.r.success) { if (res.r.datos && res.r.datos.producto) pintar(res.r.datos.producto); else await cargar(); }
      return res;
    } finally { if (cuerpo.isConnected) bloquear(false); }
  }

  function pintar(p) {
    cuerpo.dataset.activo = String(p.activo === true);
    const bEditar = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-editar', 'data-op': 'editar', onclick: () => { montar(avisos); abrirEditar(p); } }, 'Editar datos');
    const dato = (ico, dt, dd) => el('div', { class: 'dl-item', 'data-ico': ico }, el('dt', { text: dt }), dd);
    const imgCaja = el('div', { class: 'img-caja', id: 'prod-imagen-prev' });
    const datos = el('div', { class: 'card stack', id: 'prod-datos' },
      el('div', { class: 'card-head ficha-head' }, el('span', { class: 'avatar avatar-lg avatar-prod', 'aria-hidden': 'true', text: inicial(p.producto) }),
        el('div', { class: 'ficha-title' }, el('h2', { id: 'prod-nombre', text: str(p.producto) || '(sin nombre)' }),
          el('span', { class: 'ficha-sub', text: (str(p.categoria) || 'Sin categoría') + ' · ID: ' + p.producto_id })),
        el('span', { class: 'spacer' }), bEditar),
      el('div', { class: 'ficha-cols' },
        el('dl', { class: 'dl' },
          dato('tag', 'Categoría', el('dd', { id: 'prod-categoria', text: str(p.categoria) || '—' })),
          dato('box', 'Unidad', el('dd', { id: 'prod-unidad', text: str(p.unidad) || '—' })),
          dato('box', 'Presentación', el('dd', { id: 'prod-presentacion', text: str(p.presentacion) || 'Sin presentación' }))),
        el('dl', { class: 'dl' },
          dato('peso', 'Peso por unidad', el('dd', { id: 'prod-peso', text: typeof p.peso_kg_unidad === 'number' ? String(p.peso_kg_unidad).replace('.', ',') + ' kg' : 'Sin peso' })),
          dato('img', 'Imagen', el('dd', { id: 'prod-imagen' }, imgCaja)))));
    mostrarImagen(ctx, str(p.imagen_url) || null, imgCaja, str(p.producto) || 'Producto');

    const bPrecios = el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'btn-precios', 'data-op': 'precios', onclick: () => { montar(avisos); abrirPrecios(p); } }, 'Cambiar precios');
    const precios = el('div', { class: 'card stack', id: 'prod-precios' },
      el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-precio', text: 'Precios por lista' }), el('span', { class: 'spacer' }), bPrecios),
      el('div', { class: 'precio-grid' },
        el('div', { class: 'precio-tile', 'data-lista': 'minorista' }, el('span', { class: 'precio-label', text: 'Minorista' }), el('span', { class: 'precio-valor', id: 'prod-minorista', text: precio(p.precio_minorista) }),
          el('span', { class: 'hint', text: 'Clientes con lista minorista.' })),
        el('div', { class: 'precio-tile', 'data-lista': 'mayorista' }, el('span', { class: 'precio-label', text: 'Mayorista' }), el('span', { class: 'precio-valor', id: 'prod-mayorista', text: precio(p.precio_mayorista) }),
          el('span', { class: 'hint', text: 'Clientes con lista mayorista y repartidores.' }))),
      el('p', { class: 'muted small', text: 'Un cambio de precio solo se aplica a operaciones nuevas. No modifica precios ya congelados en pedidos ni extras.' }));

    const filaVis = (clave, etiqueta) => {
      const v = p[clave] === true;
      const b = el('button', { type: 'button', class: 'btn btn-sm ' + (v ? 'btn-ghost' : 'btn-primary'), 'data-op': 'vis-' + clave, 'data-accion': v ? 'ocultar' : 'mostrar' }, v ? 'Ocultar para ' + etiqueta : 'Mostrar a ' + etiqueta);
      b.addEventListener('click', conBloqueo(b, () => operar('editar_producto', { producto_id: p.producto_id, [clave]: !v }), 'Guardando…'));
      return el('div', { class: 'role-row', 'data-visibilidad': clave === 'visible_clientes' ? 'clientes' : 'repartidores' },
        el('span', { class: 'role-main' }, el('span', { class: 'role-name', text: etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1) }), el('span', { class: 'chips' }, chipVisible(v))),
        el('span', { class: 'spacer' }), el('span', { class: 'role-actions' }, b));
    };
    const visibilidad = el('div', { class: 'card stack', id: 'prod-visibilidad' },
      el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-ojo', text: 'Visibilidad por rol' })),
      el('div', { class: 'role-list' }, filaVis('visible_clientes', 'clientes'), filaVis('visible_repartidores', 'repartidores')),
      el('p', { class: 'muted small', text: 'La visibilidad define quién ve el producto en su catálogo. No define el precio: eso depende de la lista de precio de cada persona.' }));

    const bEstado = p.activo === true
      ? el('button', { type: 'button', class: 'btn btn-danger btn-sm', 'data-op': 'desactivar', 'data-accion': 'desactivar-producto' }, 'Desactivar producto')
      : el('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-op': 'activar', 'data-accion': 'activar-producto' }, 'Activar producto');
    bEstado.addEventListener('click', conBloqueo(bEstado, async () => {
      if (p.activo === true) {
        if (!(await confirmar('Desactivar producto', '¿Confirmás desactivar “' + (str(p.producto) || 'este producto') + '”? Deja de estar disponible para pedidos nuevos; no se borra y se puede volver a activar.', 'Desactivar'))) return;
        return operar('desactivar_producto', { producto_id: p.producto_id });
      }
      return operar('activar_producto', { producto_id: p.producto_id });
    }, 'Enviando…'));
    const estado = el('div', { class: 'card stack', id: 'prod-estado-card' },
      el('div', { class: 'role-row', 'data-estado-producto': p.activo === true ? 'activo' : 'inactivo' },
        el('span', { class: 'role-main' }, el('h3', { class: 'h-ico h-ico-estado', text: 'Estado' }), el('span', { class: 'chips' }, chipEstado(p))),
        el('span', { class: 'spacer' }), el('span', { class: 'role-actions' }, bEstado)),
      el('p', { class: 'muted small', text: 'Los productos nunca se borran: se desactivan. Si un producto está en pedidos habituales activos, primero hay que cambiarlo ahí.' }));
    montar(cuerpo, datos, precios, visibilidad, estado);
  }

  function abrirEditar(p) {
    const iCat = el('input', { class: 'input', id: 'editar-categoria', maxlength: '60', value: str(p.categoria) || '', list: 'cat-categorias-ed' });
    const lista = el('datalist', { id: 'cat-categorias-ed' }, categoriasConocidas.map(c => el('option', { value: c })));
    const iNom = el('input', { class: 'input', id: 'editar-producto', maxlength: '120', value: str(p.producto) || '' });
    const iUni = el('input', { class: 'input', id: 'editar-unidad', maxlength: '20', value: str(p.unidad) || '' });
    const iPres = el('input', { class: 'input', id: 'editar-presentacion', maxlength: '120', value: str(p.presentacion) || '' });
    const iPeso = el('input', { class: 'input', id: 'editar-peso', type: 'number', min: '0', step: '0.001', inputmode: 'decimal', value: typeof p.peso_kg_unidad === 'number' ? String(p.peso_kg_unidad) : '' });
    const selImg = selectorImagen(ctx, { id: 'editar-imagen', actual: str(p.imagen_url) || null, destino: 'producto', etiqueta: 'Imagen del producto' });
    const zona = el('div', { class: 'stack', id: 'editar-producto-aviso' });
    const boton = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-guardar-producto' }, 'Guardar cambios');
    const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' }, lista,
      el('div', { class: 'form-grid two' },
        campo('editar-categoria', 'Categoría', iCat), campo('editar-producto', 'Nombre', iNom), campo('editar-unidad', 'Unidad', iUni),
        campo('editar-presentacion', 'Presentación', iPres, 'Dejala vacía para quitarla.'),
        campo('editar-peso', 'Peso por unidad en kg', iPeso, 'Vacío = sin peso.'), el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'Imagen' }), selImg.nodo)),
      el('p', { class: 'muted small', text: 'Los precios, la visibilidad y el estado se cambian desde su propio bloque en la ficha.' }),
      boton, zona);
    const m = modal('Editar producto', form);
    async function enviar(campos) {
      const res = await ops.ejecutar(ctx.base(TIPO), 'editar_producto', campos);
      if (res.sinConfirmar) return montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => enviar(campos), () => { ops.descartar('editar_producto', campos); montar(zona); }));
      if (ctx.revisarFinSesion(res.r)) return m.cerrar();
      if (res.r.success) { m.cerrar(); montar(avisos, avisoBackend(res.r)); return res.r.datos && res.r.datos.producto ? pintar(res.r.datos.producto) : cargar(); }
      montar(zona, resultadoNegocio(ctx, res.r));
    }
    form.addEventListener('submit', conBloqueo(boton, async () => {
      montar(zona);
      const campos = { producto_id: p.producto_id };
      const t = (k, nuevo) => { const viejo = str(p[k]) || ''; if (nuevo.trim() !== viejo) campos[k] = nuevo; };
      t('categoria', iCat.value); t('producto', iNom.value); t('unidad', iUni.value);
      const pres = txtOrNull(iPres.value); if (pres !== (str(p.presentacion) || null)) campos.presentacion = pres;
      const peso = numOrNull(iPeso.value);
      if (Number.isNaN(peso)) return montar(zona, aviso('error', 'El peso debe ser un número.'));
      const img = await selImg.resolver();
      if (img.error) return montar(zona, aviso('error', img.error));
      if ((img.url || null) !== (str(p.imagen_url) || null)) campos.imagen_url = img.url;
      if (peso !== (typeof p.peso_kg_unidad === 'number' ? p.peso_kg_unidad : null)) campos.peso_kg_unidad = peso;
      if (Object.keys(campos).length === 1) return montar(zona, aviso('info', 'No hay cambios para guardar.'));
      await enviar(campos);
    }, 'Guardando…'));
  }

  function abrirPrecios(p) {
    const iMin = el('input', { class: 'input', id: 'precio-minorista', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', value: typeof p.precio_minorista === 'number' ? String(p.precio_minorista) : '' });
    const iMay = el('input', { class: 'input', id: 'precio-mayorista', type: 'number', min: '0', step: '0.01', inputmode: 'decimal', value: typeof p.precio_mayorista === 'number' ? String(p.precio_mayorista) : '' });
    const zona = el('div', { class: 'stack', id: 'precios-aviso' });
    const boton = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-guardar-precios' }, 'Guardar precios');
    const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' },
      el('div', { class: 'form-grid two' }, campo('precio-minorista', 'Precio minorista', iMin), campo('precio-mayorista', 'Precio mayorista', iMay)),
      el('p', { class: 'muted small', text: 'Solo afecta operaciones nuevas. Los precios ya congelados en pedidos y extras no cambian.' }),
      boton, zona);
    const m = modal('Cambiar precios — ' + (str(p.producto) || ''), form);
    async function enviar(campos) {
      const res = await ops.ejecutar(ctx.base(TIPO), 'cambiar_precios', campos);
      if (res.sinConfirmar) return montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => enviar(campos), () => { ops.descartar('cambiar_precios', campos); montar(zona); }));
      if (ctx.revisarFinSesion(res.r)) return m.cerrar();
      if (res.r.success) { m.cerrar(); montar(avisos, avisoBackend(res.r)); return res.r.datos && res.r.datos.producto ? pintar(res.r.datos.producto) : cargar(); }
      montar(zona, resultadoNegocio(ctx, res.r));
    }
    form.addEventListener('submit', conBloqueo(boton, async () => {
      montar(zona);
      const mi = numOrNull(iMin.value), ma = numOrNull(iMay.value);
      if (mi === null || ma === null || Number.isNaN(mi) || Number.isNaN(ma) || mi < 0 || ma < 0) return montar(zona, aviso('error', 'Indicá los dos precios con un número mayor o igual a 0.'));
      const campos = { producto_id: p.producto_id };
      if (mi !== p.precio_minorista) campos.precio_minorista = mi;
      if (ma !== p.precio_mayorista) campos.precio_mayorista = ma;
      if (Object.keys(campos).length === 1) return montar(zona, aviso('info', 'No hay cambios para guardar.'));
      await enviar(campos);
    }, 'Guardando…'));
  }

  cargar();
}
