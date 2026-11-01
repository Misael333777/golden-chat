// Panel Producción → Clientes (inicio) y día de un cliente.
// Lecturas (tipo produccion): prod_clientes, prod_dia_cliente (planilla cerrada del día: hoy y hasta 60 días atrás), prod_catalogo (con el precio del cliente).
// Escrituras (ops.ejecutar, operacion_id idempotente): prod_registrar_extra (solo hoy; queda para que Finanzas lo confirme) y
// prod_registrar_devolucion (solo "descontar", al precio del sistema; Producción no repone). El backend valida todo.
// Nunca se muestra el saldo de la cuenta del cliente.
import * as ops from '../../ops.js';
import { llamar } from '../../api.js';
import { el, montar, aviso, modal, confirmar, conBloqueo, toast } from '../../ui.js';
import { avisoFalla, avisoSinConfirmar } from '../admin/personas.js';
import { icono } from '../cliente/iconos.js';
import { tarjetaInstalar } from '../../instalar.js';
import { TIPO, FECHA_RE, hoyART, minFecha, pesos, str, nOk, fnum, redondo, uTxt, cant, leerCant, sinTilde, fmtFecha, listaDe, normProducto, ordenarProductos,
  cabecera, vacio, avisoR, leer, memoria, nombreCliente } from './comun.js';

const iniciales = (n) => { const w = String(n || '').trim().split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };
const TXT_CREDITO = { aplicado: 'descontado de la cuenta', pendiente_finanzas: 'pendiente para Finanzas', error: 'no se pudo descontar', pendiente: 'pendiente', no_aplica: null };
const SIN_DATOS = ['SIN_ENTREGA', 'SIN_PLANILLA', 'PLANILLA_NO_ENCONTRADA', 'PLANILLA_ABIERTA', 'SIN_LINEAS', 'SIN_PEDIDO'];

// ======================= LISTADO DE CLIENTES =======================
export function vistaClientes(ctx, cont) {
  const input = el('input', { class: 'input', id: 'prod-buscar', type: 'search', maxlength: '100', placeholder: 'Buscar cliente por nombre…', 'aria-label': 'Buscar cliente', autocomplete: 'off', value: memoria.busqueda });
  const total = el('p', { class: 'muted small', id: 'prod-total' });
  const zona = el('div', { class: 'stack', id: 'prod-clientes', 'data-estado': 'cargando' });
  const instalar = tarjetaInstalar();
  montar(cont, cabecera('Clientes', 'Tocá un cliente para ver lo que lleva, cargar un extra o una devolución.'),
    el('div', { class: 'card stack prod-buscador' }, el('div', { class: 'field' }, input), total), zona, instalar);

  let lista = memoria.clientes || [];
  const pintar = () => {
    const q = sinTilde(input.value.trim());
    memoria.busqueda = input.value;
    const vis = q ? lista.filter(c => sinTilde(c.nombre).includes(q)) : lista;
    total.textContent = vis.length + (vis.length === 1 ? ' cliente' : ' clientes') + (q ? ' para “' + input.value.trim() + '”' : '');
    if (!lista.length) return montar(zona, vacio('Todavía no hay clientes activos.'));
    if (!vis.length) return montar(zona, vacio('No hay clientes con ese nombre.'));
    montar(zona, el('div', { class: 'prod-lista', id: 'prod-lista-clientes' }, vis.map(c =>
      el('a', { class: 'prod-cli', href: '#/produccion/cliente/' + encodeURIComponent(c.persona_id), 'data-persona': c.persona_id },
        el('span', { class: 'avatar', 'aria-hidden': 'true', text: iniciales(c.nombre) }),
        el('span', { class: 'prod-cli-nombre', text: c.nombre }),
        icono('chevron', 16)))));
  };
  input.addEventListener('input', pintar);
  leer(ctx, zona, 'prod_clientes', {}, (d) => {
    lista = listaDe(d, 'clientes', 'personas').filter(c => c && typeof c.persona_id === 'string')
      .map(c => ({ persona_id: c.persona_id, nombre: str(c.nombre) || '(sin nombre)' }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    memoria.clientes = lista;
    pintar();
  });
}

// ======================= DÍA DE UN CLIENTE =======================
export function vistaDiaCliente(ctx, cont, pid) {
  const hoy = hoyART();
  let fecha = memoria.fechas[pid];
  if (!FECHA_RE.test(fecha || '') || fecha > hoy || fecha < minFecha()) fecha = hoy;
  let nombre = nombreCliente(pid) || '';
  let dia = null; // última respuesta de prod_dia_cliente para la fecha elegida

  const avatar = el('span', { class: 'avatar avatar-md', 'aria-hidden': 'true', id: 'prod-dia-avatar', text: iniciales(nombre) });
  const titulo = el('h2', { class: 'section-title', id: 'prod-dia-nombre', text: nombre || 'Cliente' });
  const iFecha = el('input', { class: 'input', id: 'prod-fecha', type: 'date', value: fecha, max: hoy, min: minFecha(), 'aria-label': 'Día' });
  const bHoy = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'prod-btn-hoy' }, 'Hoy');
  const bExtra = el('button', { type: 'button', class: 'btn btn-gold', id: 'prod-btn-extra', 'data-accion': 'registrar-extra' }, icono('mas', 16), el('span', { text: 'Registrar extra' }));
  const bDev = el('button', { type: 'button', class: 'btn btn-primary', id: 'prod-btn-devolucion', 'data-accion': 'registrar-devolucion' }, el('span', { text: 'Registrar devolución' }));
  const ayuda = el('p', { class: 'muted small', id: 'prod-ayuda-extra' });
  const fechaTxt = el('p', { class: 'muted small', id: 'prod-fecha-txt' });
  const avisos = el('div', { class: 'stack', id: 'prod-dia-aviso' });
  const zona = el('div', { class: 'stack', id: 'prod-dia', 'data-estado': 'cargando' });

  montar(cont,
    el('a', { class: 'btn btn-ghost btn-sm btn-back prod-volver', href: '#/produccion/inicio' }, 'Volver a clientes'),
    el('div', { class: 'card stack prod-dia-head' },
      el('div', { class: 'prod-dia-titulo' }, avatar, titulo),
      el('div', { class: 'prod-fecha-row' }, el('div', { class: 'field' }, el('label', { for: 'prod-fecha', text: 'Día' }), iFecha), bHoy),
      fechaTxt,
      el('div', { class: 'prod-acciones' }, bExtra, bDev), ayuda),
    avisos, zona);

  const ponerNombre = (n) => { if (!n) return; nombre = n; titulo.textContent = n; avatar.textContent = iniciales(n); };
  const sincronizar = () => {
    const esHoy = fecha === hoyART();
    bExtra.disabled = !esHoy;
    ayuda.textContent = esHoy ? 'El extra es lo que se le entregó hoy además de su pedido. Lo confirma Finanzas.' : 'Los extras se registran solo en el día de hoy.';
    const conLineas = !!(dia && Array.isArray(dia.lineas) && dia.lineas.some(l => l.disponible > 0));
    bDev.disabled = !conLineas;
    fechaTxt.textContent = fmtFecha(fecha) + (esHoy ? ' (hoy)' : '');
  };

  function cargar() {
    dia = null; sincronizar();
    return leer(ctx, zona, 'prod_dia_cliente', { persona_id: pid, fecha }, (d) => {
      dia = d;
      if (d.persona && str(d.persona.nombre)) ponerNombre(d.persona.nombre);
      sincronizar();
      pintarDia(zona, d);
    }, (r) => {
      // Sin planilla cerrada / sin entrega ese día: no es un error de la persona, solo no hay nada que mostrar.
      if (!SIN_DATOS.includes(r.codigo)) return false;
      montar(zona, el('div', { class: 'notice info', role: 'status', 'data-codigo': r.codigo }, r.mensaje || 'No hay nada cargado para ese día.', el('span', { class: 'code', text: r.codigo })));
      return true;
    });
  }
  const cambiarFecha = (f) => {
    if (!FECHA_RE.test(f || '')) return;
    if (f > hoyART()) f = hoyART();
    if (f < minFecha()) f = minFecha();
    fecha = f; iFecha.value = f; memoria.fechas[pid] = f; montar(avisos); cargar();
  };
  iFecha.addEventListener('change', () => cambiarFecha(iFecha.value));
  bHoy.addEventListener('click', () => cambiarFecha(hoyART()));
  bExtra.addEventListener('click', () => { if (!bExtra.disabled) { montar(avisos); abrirExtra(ctx, { pid, nombre: nombre || 'Cliente' }, (r) => { montar(avisos, avisoR(r)); cargar(); }); } });
  bDev.addEventListener('click', () => { if (!bDev.disabled && dia) { montar(avisos); abrirDevolucion(ctx, { pid, nombre: nombre || 'Cliente' }, dia, (r) => { if (r) montar(avisos, avisoR(r)); cargar(); }); } });
  cargar();
}

function pintarDia(zona, d) {
  const lineas = Array.isArray(d.lineas) ? d.lineas : [];
  const previas = Array.isArray(d.devoluciones_previas) ? d.devoluciones_previas : [];
  let total = 0; let faltaPrecio = false;
  const filas = lineas.map(l => {
    const imp = nOk(l.cantidad) && nOk(l.precio_sistema) ? redondo(l.cantidad * l.precio_sistema) : null;
    if (imp === null) faltaPrecio = true; else total += imp;
    return el('div', { class: 'prod-linea', 'data-clave': l.clave || '', 'data-producto': l.producto_id === null || l.producto_id === undefined ? '' : String(l.producto_id) },
      el('span', { class: 'prod-linea-prod', text: str(l.detalle) || 'Producto' }),
      el('span', { class: 'prod-linea-cant' }, el('span', { class: 'pc-label', text: 'Cantidad: ' }), cant(l.cantidad, l.unidad)),
      el('span', { class: 'prod-linea-precio' }, el('span', { class: 'pc-label', text: 'Precio: ' }), pesos(l.precio_sistema)),
      el('span', { class: 'prod-linea-imp' }, el('span', { class: 'pc-label', text: 'Importe: ' }), pesos(imp)),
      l.ya_devuelto > 0 ? el('span', { class: 'prod-linea-nota', text: 'Ya devolvió ' + cant(l.ya_devuelto, l.unidad) }) : null);
  });
  montar(zona,
    el('div', { class: 'card stack', id: 'prod-planilla' },
      el('div', { class: 'card-head' }, el('h3', { text: 'Lo que lleva ese día' }), el('span', { class: 'spacer' }),
        el('span', { class: 'muted small', text: 'Según la planilla' })),
      lineas.length ? el('div', { class: 'prod-lineas' },
        el('div', { class: 'prod-linea prod-linea-head', 'aria-hidden': 'true' }, el('span', { text: 'Producto' }), el('span', { text: 'Cantidad' }), el('span', { text: 'Precio' }), el('span', { text: 'Importe' })),
        filas)
        : el('p', { class: 'muted', id: 'prod-sin-lineas', text: 'No tiene productos en la planilla de ese día.' }),
      lineas.length ? el('div', { class: 'prod-total', id: 'prod-total-dia' }, el('span', { text: 'Total del día' }), el('strong', { text: pesos(redondo(total)) })) : null,
      faltaPrecio ? el('p', { class: 'muted small', text: 'Algún producto no tiene precio cargado: no entra en el total.' }) : null),
    previas.length ? el('div', { class: 'card stack', id: 'prod-dev-previas' },
      el('h3', { text: 'Devoluciones de ese día' }),
      el('ul', { class: 'pp-lineas' }, previas.map(v => el('li', null,
        el('span', { class: 'pp-prod', text: str(v.detalle) || 'Producto' }),
        el('span', { class: 'muted small', text: [v.descontado > 0 ? 'devolvió ' + cant(v.descontado, v.unidad) + (nOk(v.importe_credito) ? ' (' + pesos(v.importe_credito) + ')' : '') : null,
          v.repuesto > 0 ? 'se le repuso ' + cant(v.repuesto, v.unidad) + ' sin cargo' : null,
          TXT_CREDITO[v.estado_credito] || null].filter(Boolean).join(' · ') }))))) : null);
}

// ======================= REGISTRAR EXTRA (solo hoy) =======================
async function abrirExtra(ctx, cli, alTerminar) {
  const hoy = hoyART();
  const cuerpo = el('div', { class: 'stack', id: 'pex-cuerpo' }, el('div', { class: 'skeleton' }));
  const m = modal('Extra — ' + cli.nombre, cuerpo);
  const res = await ctx.pedir(TIPO, 'prod_catalogo', { persona_id: cli.pid });
  if (!cuerpo.isConnected) return;
  if (res.falla) return montar(cuerpo, avisoFalla(res.falla, () => { m.cerrar(); abrirExtra(ctx, cli, alTerminar); }));
  if (ctx.revisarFinSesion(res.r)) return m.cerrar();
  if (!res.r.success) return montar(cuerpo, avisoR(res.r));
  const productos = ordenarProductos(listaDe(res.r.datos, 'productos', 'catalogo').map(normProducto).filter(Boolean));
  if (!productos.length) return montar(cuerpo, aviso('info', 'No hay productos activos para cargar.'));
  const porId = new Map(productos.map(p => [p.producto_id, p]));
  const categorias = [...new Set(productos.map(p => p.categoria || 'Otros'))];

  const filas = [];
  const ed = el('div', { class: 'stack lin-editor', id: 'pex-lineas' });
  const zTotal = el('div', { class: 'prod-total', id: 'pex-total' });
  const iObs = el('textarea', { class: 'input', id: 'pex-obs', maxlength: '300', rows: '2', placeholder: 'Opcional (ej. se lo llevó al mediodía)' });
  const zAviso = el('div', { class: 'stack', id: 'pex-aviso' });
  const bOk = el('button', { type: 'submit', class: 'btn btn-gold', id: 'pex-registrar' }, 'Registrar extra');
  const opciones = () => [el('option', { value: '', text: 'Elegí un producto…' }), ...categorias.map(cat => el('optgroup', { label: cat },
    productos.filter(p => (p.categoria || 'Otros') === cat).map(p => el('option', { value: String(p.producto_id), text: p.nombre + (p.unidad ? ' (' + uTxt(p.unidad) + ')' : '') + (p.precio !== null ? ' · ' + pesos(p.precio) : '') }))))];
  const recalcular = () => {
    let t = 0; let sinPrecio = false; let algo = false;
    for (const f of filas) {
      const p = porId.get(Number(f.sProd.value)); const q = leerCant(f.iCant.value);
      f.det.textContent = p && q > 0 ? (p.precio !== null ? fnum(q) + ' × ' + pesos(p.precio) + ' = ' + pesos(redondo(q * p.precio)) : 'Sin precio cargado') : '';
      if (p && q > 0) { algo = true; if (p.precio !== null) t += q * p.precio; else sinPrecio = true; }
    }
    montar(zTotal, el('span', { text: 'Total del extra' }), el('strong', { text: algo ? pesos(redondo(t)) : pesos(0) }));
    if (sinPrecio) zTotal.appendChild(el('small', { class: 'muted', text: 'Hay productos sin precio: el importe final lo calcula el sistema.' }));
    return redondo(t);
  };
  const agregar = () => {
    const k = filas.length ? Math.max(...filas.map(f => f.k)) + 1 : 0;
    const sProd = el('select', { class: 'select', id: 'pex-prod-' + k, 'aria-label': 'Producto' }, opciones());
    const iCant = el('input', { class: 'input input-num', id: 'pex-cant-' + k, type: 'number', min: '0', step: 'any', inputmode: 'decimal', placeholder: 'Cantidad', 'aria-label': 'Cantidad' });
    const quitar = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'data-accion': 'quitar-linea' }, 'Quitar');
    const det = el('span', { class: 'muted small pex-det' });
    const nodo = el('div', { class: 'lin-fila', 'data-fila': String(k) }, sProd, iCant, det, quitar);
    const f = { k, nodo, sProd, iCant, det };
    quitar.addEventListener('click', () => { if (filas.length <= 1) { sProd.value = ''; iCant.value = ''; return recalcular(); } filas.splice(filas.indexOf(f), 1); nodo.remove(); recalcular(); });
    filas.push(f); ed.insertBefore(nodo, bAg);
  };
  const bAg = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'pex-agregar', 'data-accion': 'agregar-linea', onclick: () => { agregar(); recalcular(); } }, 'Agregar otro producto');
  ed.appendChild(bAg); agregar();
  const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' },
    el('p', { class: 'muted small', text: 'Cargá lo que se llevó hoy además de su pedido. Queda como entregado y Finanzas lo confirma.' }),
    ed, el('div', { class: 'field' }, el('label', { for: 'pex-obs', text: 'Observación' }), iObs), zTotal, bOk, zAviso);
  form.addEventListener('input', recalcular); form.addEventListener('change', recalcular);
  montar(cuerpo, form);
  recalcular();

  async function enviar(campos) {
    montar(zAviso);
    const r0 = await ops.ejecutar(ctx.base(TIPO), 'prod_registrar_extra', campos);
    const enCurso = r0.r && r0.r.codigo === 'OPERACION_EN_CURSO';
    if (r0.sinConfirmar || enCurso) return montar(zAviso, avisoSinConfirmar(enCurso ? 'EN_CURSO' : r0.falla, r0.operacion_id, () => enviar(campos), () => { ops.descartar('prod_registrar_extra', campos); montar(zAviso); }));
    if (ctx.revisarFinSesion(r0.r)) return m.cerrar();
    if (!r0.r.success) return montar(zAviso, avisoR(r0.r));
    m.cerrar();
    toast(r0.r.codigo === 'OPERACION_YA_PROCESADA' ? 'Ese extra ya estaba registrado. No se duplicó.' : 'Extra registrado. Queda para que Finanzas lo confirme.');
    if (alTerminar) alTerminar(r0.r);
  }
  form.addEventListener('submit', conBloqueo(bOk, async () => {
    montar(zAviso);
    const lineas = []; const vistos = new Set();
    for (const f of filas) {
      const id = Number(f.sProd.value); const q = leerCant(f.iCant.value);
      if (!f.sProd.value && !(q > 0)) continue; // fila vacía
      if (!Number.isInteger(id) || !porId.has(id)) return montar(zAviso, aviso('error', 'Elegí el producto de cada renglón.'));
      if (vistos.has(id)) return montar(zAviso, aviso('error', porId.get(id).nombre + ' está repetido: juntalo en un solo renglón.'));
      if (!(q > 0)) return montar(zAviso, aviso('error', porId.get(id).nombre + ': poné una cantidad mayor que 0.'));
      vistos.add(id); lineas.push({ producto_id: id, cantidad: q });
    }
    if (!lineas.length) return montar(zAviso, aviso('error', 'Elegí al menos un producto y su cantidad.'));
    const total = recalcular();
    const resumen = lineas.map(l => porId.get(l.producto_id).nombre + ': ' + cant(l.cantidad, porId.get(l.producto_id).unidad)).join(' · ');
    if (!(await confirmar('Confirmar extra', cli.nombre + ' — hoy. ' + resumen + '. Total: ' + pesos(total) + '. ¿Lo registramos?', 'Registrar'))) return;
    const campos = { persona_id: cli.pid, fecha: hoy, lineas };
    if (iObs.value.trim()) campos.observacion = iObs.value.trim().slice(0, 300);
    await enviar(campos);
  }, 'Registrando…'));
}

// ======================= REGISTRAR DEVOLUCIÓN (solo descontar, precio del sistema) =======================
function abrirDevolucion(ctx, cli, d, alTerminar) {
  const zona = el('div', { class: 'stack', id: 'pdv-zona' });
  const m = modal('Devolución — ' + cli.nombre, zona);
  const cerrar = (r) => { m.cerrar(); if (alTerminar) alTerminar(r); };
  const lineas = (d.lineas || []).filter(l => l && str(l.clave));
  const filas = lineas.map((l, k) => {
    const u = uTxt(l.unidad);
    const iDes = l.disponible > 0 ? el('input', { class: 'input input-num', id: 'pdv-des-' + k, type: 'number', min: '0', max: String(l.disponible), step: 'any', inputmode: 'decimal', placeholder: '0' }) : null;
    const det = el('span', { class: 'muted small' });
    const nodo = el('div', { class: 'card stack dev-linea', 'data-clave': l.clave },
      el('div', { class: 'card-head' }, el('strong', { text: str(l.detalle) || 'Producto' }), el('span', { class: 'spacer' }),
        el('span', { class: 'muted small', text: 'Se llevó ' + cant(l.cantidad, l.unidad) + (l.ya_devuelto > 0 ? ' · ya devolvió ' + fnum(l.ya_devuelto) : '') })),
      iDes ? el('div', { class: 'field' }, el('label', { for: 'pdv-des-' + k, text: 'Devuelve (' + (u || 'cantidad') + '), hasta ' + fnum(l.disponible) }), iDes, det)
        : el('p', { class: 'muted small', text: 'Ya devolvió todo lo que se llevó.' }));
    return { l, iDes, det, nodo };
  });
  const iNota = el('input', { class: 'input', id: 'pdv-nota', type: 'text', maxlength: '300', placeholder: 'Opcional (ej. pan duro)' });
  const total = el('div', { class: 'prod-total', id: 'pdv-total' });
  const zAviso = el('div', { class: 'stack', id: 'pdv-aviso' });
  const bOk = el('button', { type: 'submit', class: 'btn btn-gold', id: 'pdv-registrar' }, 'Registrar devolución');
  const leerFilas = () => filas.filter(f => f.iDes).map(f => ({ f, des: leerCant(f.iDes.value) }));
  const recalcular = () => {
    let t = 0;
    for (const x of leerFilas()) {
      const pre = x.f.l.precio_sistema;
      x.f.det.textContent = x.des > 0 && nOk(pre) ? fnum(x.des) + ' × ' + pesos(pre) + ' = ' + pesos(redondo(x.des * pre)) : '';
      if (x.des > 0 && nOk(pre)) t += x.des * pre;
    }
    montar(total, el('span', { text: 'Se descuenta de la cuenta' }), el('strong', { text: pesos(redondo(t)) }));
    return redondo(t);
  };
  const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' },
    el('p', { class: 'muted small', text: 'Entrega del ' + fmtFecha(d.fecha_entrega) + '. Cargá solo lo que devolvió; lo demás dejalo vacío. Se descuenta al precio que se le cobró ese día.' }),
    filas.map(f => f.nodo),
    el('div', { class: 'field' }, el('label', { for: 'pdv-nota', text: 'Nota' }), iNota),
    total, bOk, zAviso);
  form.addEventListener('input', recalcular);
  montar(zona, form);
  recalcular();

  async function enviar(campos) {
    montar(zAviso);
    const res = await ops.ejecutar(ctx.base(TIPO), 'prod_registrar_devolucion', campos);
    const enCurso = res.r && res.r.codigo === 'OPERACION_EN_CURSO';
    if (res.sinConfirmar || enCurso) return montar(zAviso, avisoSinConfirmar(enCurso ? 'EN_CURSO' : res.falla, res.operacion_id, () => enviar(campos), () => { ops.descartar('prod_registrar_devolucion', campos); montar(zAviso); }));
    if (ctx.revisarFinSesion(res.r)) return m.cerrar();
    if (!res.r.success && res.r.codigo !== 'DEVOLUCION_INCOMPLETA') return montar(zAviso, avisoR(res.r));
    pintarResultado(ctx, zona, res.r, res.operacion_id, campos, cerrar);
  }
  form.addEventListener('submit', conBloqueo(bOk, async () => {
    montar(zAviso);
    const v = leerFilas();
    if (v.some(x => !(x.des >= 0))) return montar(zAviso, aviso('error', 'Revisá las cantidades (números de 0 en adelante).'));
    const usados = v.filter(x => x.des > 0);
    if (!usados.length) return montar(zAviso, aviso('error', 'No cargaste ninguna cantidad.'));
    for (const x of usados) {
      if (Math.round(x.des * 1000) > Math.round(x.f.l.disponible * 1000)) return montar(zAviso, aviso('error', (str(x.f.l.detalle) || 'Producto') + ': devuelve más de lo que se llevó (hasta ' + cant(x.f.l.disponible, x.f.l.unidad) + ').'));
    }
    const t = recalcular();
    const resumen = usados.map(x => (str(x.f.l.detalle) || 'Producto') + ': ' + cant(x.des, x.f.l.unidad)).join(' · ');
    if (!(await confirmar('Confirmar devolución', cli.nombre + ' — entrega del ' + fmtFecha(d.fecha_entrega) + '. ' + resumen + '. Se descuenta de la cuenta: ' + pesos(t) + '. ¿Confirmás?', 'Registrar'))) return;
    // Sin precio_unitario: el backend usa el precio del sistema (lo que se le cobró ese día).
    const campos = { persona_id: cli.pid, fecha_entrega: d.fecha_entrega, lineas: usados.map(x => ({ clave: x.f.l.clave, descontar: x.des })) };
    if (iNota.value.trim()) campos.nota = iNota.value.trim().slice(0, 300);
    await enviar(campos);
  }, 'Registrando…'));
}

// Resultado. Si algo quedó incompleto, "Reintentar" reenvía la MISMA operación (mismo operacion_id): el backend no duplica, solo completa lo que faltó.
function pintarResultado(ctx, zona, r, operacionId, campos, cerrar) {
  const d = r.datos || {};
  const det = Array.isArray(d.lineas) ? d.lineas : [];
  const bRe = r.success ? null : el('button', { type: 'button', class: 'btn btn-gold', id: 'pdv-reintentar' }, 'Reintentar lo que faltó');
  montar(zona, el('div', { class: 'stack', id: 'pdv-resultado', 'data-codigo': r.codigo },
    avisoR(r),
    det.length ? el('ul', { class: 'pp-lineas' }, det.map(x => el('li', null, el('span', { class: 'pp-prod', text: str(x.detalle) || 'Producto' }),
      el('span', { class: 'muted small', text: [x.descontado > 0 ? cant(x.descontado, x.unidad) : null, nOk(x.importe_credito) ? pesos(x.importe_credito) : null,
        TXT_CREDITO[x.estado_credito] || null, str(x.error)].filter(Boolean).join(' · ') })))) : null,
    nOk(d.total_descontado) ? el('div', { class: 'prod-total' }, el('span', { text: 'Total descontado' }), el('strong', { text: pesos(d.total_descontado) })) : null,
    el('div', { class: 'row' }, bRe, el('button', { type: 'button', class: 'btn btn-primary', id: 'pdv-listo', onclick: () => cerrar(r) }, 'Listo'))));
  if (r.success) toast(r.codigo === 'OPERACION_YA_PROCESADA' ? 'Esa devolución ya estaba registrada. No se duplicó.' : 'Devolución registrada.');
  if (bRe) bRe.addEventListener('click', conBloqueo(bRe, async () => {
    const res = await llamar(Object.assign({}, ctx.base(TIPO), { accion: 'prod_registrar_devolucion', operacion_id: operacionId }, campos));
    if (!res.r) return toast('No pudimos conectar. Probá de nuevo.');
    if (ctx.revisarFinSesion(res.r)) return;
    pintarResultado(ctx, zona, res.r, operacionId, campos, cerrar);
  }, 'Reintentando…'));
}
