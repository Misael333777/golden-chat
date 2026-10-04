// Panel Cliente → Inicio. Resumen REAL (sin datos inventados): habitual, pedido de mañana, extras de hoy, cuenta y consultas abiertas.
// Cada bloque se lee por separado: si uno falla, los demás se muestran igual.
import { el, montar } from '../../ui.js';
import { avisoFalla } from '../admin/personas.js';
import { RUTA, avisoCli, pesos, hoyART, sumarDias, fmtFecha, fmtCorta, ORIGEN_TXT, DIA_TXT, tile, raiz, esRepartidor } from './comun.js';

export function vistaInicio(ctx, cont) {
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
