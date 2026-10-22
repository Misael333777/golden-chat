// Panel Cliente → Inicio. Resumen REAL (sin datos inventados): habitual, pedido de mañana, extras de hoy, cuenta y consultas abiertas.
// Cada bloque se lee por separado: si uno falla, los demás se muestran igual.
import { el, montar } from '../../ui.js';
import { avisoFalla } from '../admin/personas.js';
import { RUTA, avisoCli, pesos, hoyART, sumarDias, fmtFecha, fmtCorta, ORIGEN_TXT, DIA_TXT, tile, raiz, esRepartidor, cant, str, esAncla } from './comun.js';
import { icono } from './iconos.js';

export function vistaInicio(ctx, cont) {
  if (!esRepartidor()) return vistaInicioCliente(ctx, cont);
  const manana = sumarDias(hoyART(), 1);
  const nombre = (ctx.sesion && ctx.sesion().nombre) || '';
  const tiles = el('div', { class: 'prd-tiles', id: 'cli-tiles' });
  const notas = el('div', { class: 'stack', id: 'cli-inicio-notas' });
  const atajo = (id, titulo, texto, boton, clase) => el('div', { class: 'shortcut', 'data-atajo': 'cli-' + id },
    el('span', { class: 'shortcut-ico', 'aria-hidden': 'true' }), el('h3', { text: titulo }), el('p', { class: 'muted small', text: texto }),
    el('a', { class: 'btn ' + clase, href: raiz() + '/' + id }, boton));
  montar(cont, el('div', { class: 'card stack card-welcome', id: 'cli-inicio' },
    el('div', null, el('span', { class: 'eyebrow', text: 'Hola' }), el('h2', { id: 'cli-nombre', text: nombre || 'Bienvenido' }),
      el('p', { class: 'muted', text: 'Hoy es ' + fmtFecha(hoyART()).toLowerCase() + '. Los pedidos para mañana se pueden cambiar hasta las 22:00 de hoy.' })),
    tiles, notas,
    el('div', { class: 'shortcut-grid' },
      atajo('habitual', 'Mi pedido habitual', 'Lo que recibís cada semana. Podés cambiar cantidades o productos.', 'Ver habitual', 'btn-primary'),
      atajo('pedido', 'Pedido para una fecha', 'Cambiar solo un día o pedir para un día que no tenés habitual.', 'Pedir para una fecha', 'btn-ghost'),
      atajo('extras', 'Extras de hoy', 'Si te falta algo hoy, pedí un extra. Golden lo revisa.', 'Pedir extra', 'btn-ghost'),
      esRepartidor() ? atajo('clientes', 'Mis clientes', 'Tus clientes del reparto habitual, con días y salida.', 'Ver mis clientes', 'btn-ghost') : null,
      atajo('cuenta', 'Mi cuenta', 'Lo que falta pagar y tus movimientos.', 'Ver mi cuenta', 'btn-ghost'),
      atajo('soporte', 'Hablar con Golden', '¿Algo no está bien? Escribinos y te respondemos.', 'Escribir a Golden', 'btn-ghost'))));
  const slots = ['habitual', 'manana', 'extras'].concat(esRepartidor() ? ['clientes'] : [], ['cuenta', 'soporte']).map(k => { const t = tile('…', 'Cargando', k); tiles.appendChild(t); return [k, t]; });
  const T = Object.fromEntries(slots);
  const poner = (k, label, valor, link) => {
    const n = tile(label, valor, k);
    if (link) n.appendChild(el('a', { class: 'small', href: link, text: 'Ver' }));
    T[k].replaceWith(n); T[k] = n;
  };
  const pedir = async (accion, campos) => { const r = await ctx.pedir(RUTA[accion], accion, campos || {}); if (r.r && ctx.revisarFinSesion(r.r)) return null; return r; };
  const fallo = (k, label, r) => { poner(k, label, 'No disponible'); if (r && r.r && !r.r.success) notas.appendChild(avisoCli(r.r)); else if (r && r.falla && !notas.querySelector('[data-falla]')) notas.appendChild(avisoFalla(r.falla, () => ctx.ir(location.hash))); };
  (async () => {
    const [hab, ped, ext, cta, sop, cli] = await Promise.all([pedir('mi_habitual'), pedir('mi_pedido_fecha', { fecha: manana }), pedir('mis_extras'), pedir('mi_cuenta'), pedir('mis_casos'), esRepartidor() ? pedir('mis_clientes') : Promise.resolve(false)]);
    if (!cont.isConnected || [hab, ped, ext, cta, sop, cli].some(x => x === null)) return;
    if (cli) { if (cli.r && cli.r.success) { const n = ((cli.r.datos || {}).clientes || []).length; poner('clientes', 'Mis clientes', String(n), raiz() + '/clientes'); } else fallo('clientes', 'Mis clientes', cli); }
    if (hab.r && hab.r.success) { const d = hab.r.datos || {}; const dias = (d.dias || []).filter(x => !x.sin_pedido_hoy).map(x => DIA_TXT[x.dia] || x.dia);
      poner('habitual', 'Mi habitual', d.tiene_habitual ? (dias.length + (dias.length === 1 ? ' día' : ' días')) : 'Sin habitual', raiz() + '/habitual');
      if (d.tiene_habitual && dias.length) T.habitual.title = dias.join(', '); }
    else fallo('habitual', 'Mi habitual', hab);
    if (ped.r && ped.r.success) { const d = ped.r.datos || {}; poner('manana', 'Mañana (' + fmtCorta(manana) + ')', d.sin_entrega ? 'Sin entrega' : (ORIGEN_TXT[d.origen] || '—'), raiz() + '/pedido/' + manana);
      T.manana.dataset.origen = d.origen || ''; }
    else fallo('manana', 'Mañana', ped);
    if (ext.r && ext.r.success) { const l = (ext.r.datos || {}).extras || []; poner('extras', 'Extras de hoy', l.length ? String(l.length) : 'Ninguno', raiz() + '/extras'); }
    else fallo('extras', 'Extras de hoy', ext);
    if (cta.r && cta.r.success) { const d = cta.r.datos || {}; poner('cuenta', d.saldo_a_favor > 0 ? 'Saldo a favor' : 'Falta pagar', pesos(d.saldo_a_favor > 0 ? d.saldo_a_favor : (d.falta_pagar || 0)), raiz() + '/cuenta'); }
    else fallo('cuenta', 'Mi cuenta', cta);
    if (sop.r && sop.r.success) { const n = (sop.r.datos || {}).abiertos || 0; poner('soporte', 'Consultas abiertas', String(n), raiz() + '/soporte'); }
    else fallo('soporte', 'Consultas', sop);
  })();
}

// ---------- Inicio del panel Cliente (maqueta aprobada) ----------
// Mismas lecturas que el inicio anterior (habitual, pedido de mañana, extras, cuenta y consultas), cada una por separado.
// La foto es ilustrativa (pan de la portada de Golden); los textos fijos no son datos.
function vistaInicioCliente(ctx, cont) {
  const hoy = hoyART();
  const manana = sumarDias(hoy, 1);
  const nombre = (ctx.sesion && ctx.sesion().nombre) || '';
  const primerNombre = nombre.trim().split(/\s+/)[0] || '';
  const base = raiz();
  const notas = el('div', { class: 'stack', id: 'cli-inicio-notas' });
  const tarjetas = el('div', { class: 'cg-resumen', id: 'cli-tiles' });

  const accion = (id, ico, titulo, texto) => el('a', { class: 'cg-accion', href: base + '/' + id, 'data-atajo': 'cli-' + id },
    el('span', { class: 'cg-accion-ico' }, icono(ico, 20)), el('span', { class: 'cg-accion-txt' }, el('strong', { text: titulo }), el('small', { text: texto })), icono('chevron', 16));

  // Tarjeta de resumen: arranca "Cargando" y se reemplaza con el dato real (o "No disponible").
  const tarjeta = (k, o) => el(o.link ? 'a' : 'div', { class: 'cg-tarjeta' + (k === 'manana' ? ' cg-tarjeta-destacada' : ''), href: o.link || null, 'data-tile': k },
    el('div', { class: 'cg-tarjeta-top' }, el('span', { class: 'cg-tarjeta-ico' }, icono(o.ico, 19)),
      o.pill ? el('span', { class: 'cg-pill', text: o.pill }) : icono('diagonal', 17)),
    el('span', { class: 'cg-eyebrow', text: o.label }), el('h3', { text: o.valor }),
    o.desc ? el('p', { text: o.desc }) : null,
    o.link ? el('span', { class: 'cg-tarjeta-link' }, o.linkTxt || 'Ver', icono('flecha', 15)) : null);
  const ICO = { manana: 'calendario', cuenta: 'cuenta', habitual: 'repetir', extras: 'mas', soporte: 'soporte' };
  const T = {};
  for (const k of ['manana', 'cuenta', 'habitual', 'extras', 'soporte']) { T[k] = tarjeta(k, { ico: ICO[k], label: 'Cargando…', valor: '…' }); T[k].dataset.estado = 'cargando'; tarjetas.appendChild(T[k]); }
  const poner = (k, o) => { const n = tarjeta(k, Object.assign({ ico: ICO[k] }, o)); T[k].replaceWith(n); T[k] = n; return n; };

  montar(cont, el('div', { class: 'cg-home', id: 'cli-inicio' },
    el('div', { class: 'cg-encabezado' },
      el('div', null, el('span', { class: 'cg-eyebrow', text: 'TU PANADERÍA, MÁS CERCA' }),
        el('h1', null, primerNombre ? ['Qué bueno verte, ', el('span', { id: 'cli-nombre', text: primerNombre }), '.'] : el('span', { id: 'cli-nombre', text: 'Qué bueno verte.' })),
        el('p', { text: 'Todo lo de Golden, en un solo lugar.' })),
      el('span', { class: 'cg-hoy' }, el('span', { text: fmtFecha(hoy) }), el('small', { text: 'Pedidos para mañana hasta las 22:00' }))),
    el('section', { class: 'cg-banner', 'aria-label': 'Hacer un pedido' },
      el('div', { class: 'cg-banner-txt' }, el('span', { class: 'cg-eyebrow', text: 'PANADERÍA EN BUENAS MANOS' }),
        el('h2', null, 'Lo bueno de cada día.', el('br'), 'Lo de siempre, con vos.'),
        el('p', { text: 'Organizá tus pedidos y nosotros nos ocupamos del resto.' }),
        el('a', { class: 'cg-btn-oscuro', href: base + '/pedido' }, 'Hacer un pedido', icono('flecha', 16))),
      el('div', { class: 'cg-banner-foto' }, el('img', { src: 'assets/img/inicio-flautas.jpg', alt: '', decoding: 'async' }),
        el('span', { class: 'cg-sello', 'aria-hidden': 'true' }, 'HECHO CON DEDICACIÓN', icono('trigo', 18), 'TODOS LOS DÍAS'))),
    el('p', { class: 'cg-corte' }, icono('reloj', 16), el('span', { text: 'Hoy es ' + fmtFecha(hoy).toLowerCase() + '. Los pedidos para mañana se pueden cambiar hasta las 22:00 de hoy.' })),
    el('div', { class: 'cg-acciones' },
      accion('pedido', 'calendario', 'Pedido para una fecha', 'Cambiar un día o pedir uno nuevo'),
      accion('habitual', 'repetir', 'Mi pedido habitual', 'Lo que recibís cada semana'),
      accion('extras', 'mas', 'Extras de hoy', 'Si hoy te falta algo, Golden lo revisa')),
    el('div', { class: 'cg-titulo-seccion' }, el('h2', { text: 'Tu resumen' }), el('span', { text: 'Datos de tu cuenta' })),
    notas, tarjetas,
    el('div', { class: 'cg-contacto' },
      el('span', { class: 'cg-accion-ico' }, icono('soporte', 20)),
      el('div', null, el('h3', { text: '¿Algo no está bien?' }), el('p', { text: 'Escribinos y te respondemos. También podés consultar por tu cuenta o tus pedidos.' })),
      el('a', { class: 'btn btn-ghost', href: base + '/soporte', 'data-atajo': 'cli-soporte' }, 'Hablar con Golden'))));

  const pedir = async (accion, campos) => { const r = await ctx.pedir(RUTA[accion], accion, campos || {}); if (r.r && ctx.revisarFinSesion(r.r)) return null; return r; };
  const fallo = (k, label, r, link) => { poner(k, { label, valor: 'No disponible', link, linkTxt: 'Ver' });
    if (r && r.r && !r.r.success) notas.appendChild(avisoCli(r.r)); else if (r && r.falla && !notas.querySelector('[data-falla]')) notas.appendChild(avisoFalla(r.falla, () => ctx.ir(location.hash))); };
  (async () => {
    const [hab, ped, ext, cta, sop] = await Promise.all([pedir('mi_habitual'), pedir('mi_pedido_fecha', { fecha: manana }), pedir('mis_extras'), pedir('mi_cuenta'), pedir('mis_casos')]);
    if (!cont.isConnected || [hab, ped, ext, cta, sop].some(x => x === null)) return;
    if (ped.r && ped.r.success) { const d = ped.r.datos || {};
      const lineas = (d.lineas || []).filter(l => !esAncla(l));
      const detalle = d.origen === 'sin_pedido' || d.sin_entrega ? (d.sin_entrega ? 'Ese día no recibís productos.' : 'Todavía no tenés pedido para mañana.')
        : lineas.slice(0, 3).map(l => (str(l.producto) || str(l.detalle_libre) || 'Producto') + ' ' + cant(l.cantidad, l.unidad)).join(' · ') + (lineas.length > 3 ? ' y ' + (lineas.length - 3) + ' más' : '');
      const n = poner('manana', { label: 'MAÑANA · ' + fmtCorta(manana).toUpperCase(), valor: d.sin_entrega ? 'Sin entrega' : (d.origen === 'sin_pedido' ? 'Sin pedido' : 'Nos vemos mañana.'),
        pill: ORIGEN_TXT[d.origen] || null, desc: detalle, link: base + '/pedido/' + manana, linkTxt: d.modificable ? 'Ver o cambiar' : 'Ver pedido' });
      n.dataset.origen = d.origen || ''; }
    else fallo('manana', 'MAÑANA', ped, base + '/pedido/' + manana);
    if (cta.r && cta.r.success) { const d = cta.r.datos || {}; const aFavor = d.saldo_a_favor > 0;
      poner('cuenta', { label: aFavor ? 'SALDO A FAVOR' : 'FALTA PAGAR', valor: pesos(aFavor ? d.saldo_a_favor : (d.falta_pagar || 0)), desc: 'Tu cuenta, clara y al día.', link: base + '/cuenta', linkTxt: 'Ver movimientos' }); }
    else fallo('cuenta', 'MI CUENTA', cta, base + '/cuenta');
    if (hab.r && hab.r.success) { const d = hab.r.datos || {}; const dias = (d.dias || []).filter(x => !x.sin_pedido_hoy).map(x => DIA_TXT[x.dia] || x.dia);
      poner('habitual', { label: 'MI HABITUAL', valor: d.tiene_habitual ? (dias.length + (dias.length === 1 ? ' día' : ' días')) : 'Sin habitual',
        desc: d.tiene_habitual && dias.length ? dias.join(', ') : 'Lo configura Golden con vos.', link: base + '/habitual', linkTxt: 'Ver habitual' }); }
    else fallo('habitual', 'MI HABITUAL', hab, base + '/habitual');
    if (ext.r && ext.r.success) { const l = (ext.r.datos || {}).extras || [];
      poner('extras', { label: 'EXTRAS DE HOY', valor: l.length ? String(l.length) : 'Ninguno', desc: l.length ? 'Pedidos de extra de hoy.' : 'Hoy no pediste extras.', link: base + '/extras', linkTxt: 'Ver extras' }); }
    else fallo('extras', 'EXTRAS DE HOY', ext, base + '/extras');
    if (sop.r && sop.r.success) { const n = (sop.r.datos || {}).abiertos || 0;
      poner('soporte', { label: 'CONSULTAS ABIERTAS', valor: String(n), desc: n ? 'Golden las está viendo.' : 'No tenés consultas abiertas.', link: base + '/soporte', linkTxt: 'Hablar con Golden' }); }
    else fallo('soporte', 'CONSULTAS', sop, base + '/soporte');
  })();
}
