// Admin Finanzas → Boleta por período (SOLO LECTURA). Desde la ficha de Cuentas por cobrar.
// Se pide al backend SOLO cuando se toca "Ver boleta" (1 ejecución). Imprimir y compartir se hacen en el dispositivo, sin volver a consultar.
// Los importes y saldos los calcula el backend; acá solo se formatean. Comprobante interno: no es factura.
import { el, montar, aviso, conBloqueo, modal, toast } from '../../ui.js';
import { TIPO, hoyART, campo, entrada } from './comun.js';
import { avisoFalla } from '../admin/personas.js';

const LOGO = 'assets/img/logo.png';
const MAX_DIAS = 31;
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const ENT = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const plata = (v) => (typeof v === 'number' && Number.isFinite(v) ? '$' + ENT.format(Math.abs(v)) : 'A confirmar');
const dm = (f) => f.slice(8, 10) + '/' + f.slice(5, 7);
const dmy = (f) => dm(f) + '/' + f.slice(0, 4);
const diaTxt = (f) => DIAS[new Date(f + 'T12:00:00Z').getUTCDay()] + ' ' + dm(f);
// 10/11: una unidad que es solo un número (p. ej. '1') no se muestra: confundía ('2 1 × $3.500').
const cant = (l) => (l.cantidad === null || l.cantidad === undefined ? '' : ENT.format(l.cantidad) + (l.unidad && !/^\d+$/.test(l.unidad) ? ' ' + l.unidad : ''));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sumarDias = (f, n) => new Date(Date.parse(f + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
// 29/10: extras, devoluciones y ajustes del dia (items) con su importe; los extras sin confirmar se avisan solo en pantalla.
const items = (x) => (Array.isArray(x.items) ? x.items : []);
// 10/11 (pedido del usuario): cada linea muestra 'cantidad × precio' y su subtotal; extras y devoluciones igual, en su dia.
// El precio se muestra solo si cierra la cuenta (cantidad × precio = subtotal); si no, solo cantidad y subtotal.
const precioOk = (l) => typeof l.precio === 'number' && typeof l.importe === 'number' && typeof l.cantidad === 'number' && Math.abs(Math.abs(l.cantidad * l.precio) - Math.abs(l.importe)) < 0.01;
const cuenta = (l) => cant(l) + (precioOk(l) ? ' × ' + plata(l.precio) : '');
const linsDe = (i) => (Array.isArray(i.lineas) ? i.lineas : []);
// 10/11 (diseño nuevo, pedido del usuario): etiquetas de color para lo que suma o resta en el día.
const ETQ = { extra: ['EXTRA', 'ext'], devolucion: ['DEVOLUCIÓN', 'dev'], compra: ['COMPRA', 'dev'], pedido_manual: ['AGREGADO', 'ext'], ajuste: ['AJUSTE', 'aj'], repuesto: ['REPUESTO', 'aj'] };
const tipoItem = (i) => (/^Compra\b/.test(i.detalle || '') ? 'compra' : i.tipo);
const sinPref = (t) => String(t || '').replace(/^(Extra|Devolución|Compra|Repuesto sin cargo): ?/, '');
const valTxt = (v) => (v > 0 ? '+ ' : v < 0 ? '− ' : '') + (v ? plata(v) : 'sin cargo');
const valCls = (v) => (v > 0 ? 'mas' : v < 0 ? 'menos' : '');
// Filas de un dia: { tag, tagCls, nom, sub, val, cls }. Una sola fuente para pantalla, impresion e imagen.
function filasDia(x) {
  const esp = x.cuenta_especial;
  const out = [];
  // 10/11 (pedido del usuario): con cuenta especial (Hugo) el pan francés se muestra como su cuenta real, no a precio de lista.
  if (esp) {
    const kg = (v) => ENT.format(v) + ' kg', neto = Math.round((esp.kg_frances - esp.kg_descuento) * 100) / 100;
    out.push({ nom: 'Pan francés', sub: esp.kg_descuento > 0 ? kg(esp.kg_frances) + ' − ' + kg(esp.kg_descuento) + ' caserito y galleta = ' + kg(neto) + ' × ' + plata(esp.precio_kg) : kg(esp.kg_frances) + ' × ' + plata(esp.precio_kg),
      val: (esp.importe < 0 ? '− ' : '') + plata(esp.importe), cls: esp.importe < 0 ? 'menos' : '' });
    // 10/11 (pedido del usuario): caserito/galleta que otro cliente llevó como extra, debajo del pan francés: '− 3 kg extra que llevó Damián × $1.350'.
    (Array.isArray(esp.extras) ? esp.extras : []).forEach(x => out.push({ nom: '− ' + ENT.format(x.kg) + ' kg extra que llevó ' + x.nombre, sub: ENT.format(x.kg) + ' kg × ' + plata(esp.precio_kg), val: '− ' + plata(x.importe), cls: 'menos' }));
  }
  x.lineas.filter(l => !(esp && l.en_cuenta)).forEach(l => out.push({ nom: l.detalle, sub: typeof l.importe === 'number' ? cuenta(l) : cant(l), val: typeof l.importe === 'number' ? plata(l.importe) : '', cls: '' }));
  if (typeof x.ajuste === 'number' && Math.abs(x.ajuste) >= 0.01) out.push({ tag: 'AJUSTE', tagCls: 'aj', nom: 'Diferencia de precio', sub: '', val: valTxt(x.ajuste), cls: valCls(x.ajuste) });
  for (const i of items(x)) {
    const [tag, tagCls] = ETQ[tipoItem(i)] || ETQ.ajuste;
    const ls = linsDe(i);
    const cierra = (i.tipo === 'extra' || i.tipo === 'devolucion') && ls.length && ls.every(l => typeof l.importe === 'number') && Math.abs(ls.reduce((a, l) => a + Math.abs(l.importe), 0) - Math.abs(i.importe || 0)) < 0.01 && i.importe;
    if (cierra) ls.forEach(l => { const v = Math.abs(l.importe) * Math.sign(i.importe); out.push({ tag, tagCls, nom: l.detalle, sub: cuenta(l), val: valTxt(v), cls: valCls(v) }); });
    else out.push({ tag, tagCls, nom: sinPref(i.detalle), sub: '', val: valTxt(i.importe), cls: valCls(i.importe) });
  }
  if (!out.length) out.push({ nom: 'Pedido del día', sub: '', val: '', cls: '' });
  return out;
}
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400e3) + 1;

// Filas de totales (texto, importe con signo, clase). Una sola fuente para pantalla, impresión e imagen.
// 05/11 (pedido del usuario): resumen simple = pedidos del período + lo que quedaba de antes. "Deuda anterior" ya tiene descontados
// los pagos y los ajustes del período; abajo se detalla qué incluye (saldo de antes + cada pago/ajuste). Total = pedidos del período + deuda anterior (igual que antes).
const movsDe = (d) => (Array.isArray(d.movimientos_periodo) ? d.movimientos_periodo : []);
// 10/11 (pedido del usuario): la cuenta se lee de arriba hacia abajo: debía de antes + pedidos − pagos (y ajustes) = total.
// Antes los pagos se restaban de la deuda de antes y aparecía 'a favor de antes' aunque el cliente no tuviera plata a favor.
function resumen(d) {
  const movs = movsDe(d);
  const sig = (v) => (v > 0 ? '+ ' : v < 0 ? '− ' : '') + plata(v);
  const ant = Math.round((d.saldo_anterior || 0) * 100) / 100;
  const pag = Math.round(((d.pagos_periodo || 0) + (d.ajustes_periodo || 0)) * 100) / 100;
  const filas = [
    ant < 0 ? ['A favor de antes', '− ' + plata(ant), 'favor'] : ['Debía de antes', plata(ant), ant > 0 ? 'deuda' : ''],
    [d.fecha_desde === d.fecha_hasta ? 'Pedidos del día' : 'Pedidos del período', '+ ' + plata(d.total_pedidos), ''],
  ];
  if (movs.length || pag !== 0) filas.push([(d.ajustes_periodo || 0) !== 0 ? 'Pagos y ajustes' : 'Pagos', sig(pag), pag < 0 ? 'favor' : pag > 0 ? 'deuda' : '']);
  const t = d.total_a_pagar;
  const final = t < 0 ? { txt: 'Le queda a favor', val: plata(t), cls: 'favorfin' } : { txt: 'Total a pagar', val: plata(t), cls: 'pagar' };
  const detalle = movs.map(m => [dm(m.fecha) + ' ' + m.detalle, sig(m.importe)]);
  const tituloDet = movs.length ? ((d.ajustes_periodo || 0) !== 0 ? 'Pagos y ajustes:' : 'Pagos:') : '';
  const notas = [];
  if (t < 0) notas.push('No tiene nada para pagar. El saldo a favor se descuenta de los próximos pedidos.');
  if (d.dias_sin_importe > 0) notas.push('Hay ' + d.dias_sin_importe + (d.dias_sin_importe === 1 ? ' día' : ' días') + ' con importe a confirmar (no suman al total).');
  if (!d.dias.length) notas.push('No hay pedidos en planillas cerradas de este período.');
  return { filas, final, notas, detalle, tituloDet };
}
const periodoTxt = (d) => (d.fecha_desde === d.fecha_hasta ? dmy(d.fecha_desde) : dm(d.fecha_desde) + ' al ' + dmy(d.fecha_hasta));

// Los estilos de la boleta estan en assets/css/boleta.css (la CSP de la pagina bloquea estilos inline).
const CSS_URL = 'assets/css/boleta.css';

// 10/11 (diseño nuevo, pedido del usuario): cabecera oscura, total grande arriba, días en tarjetas y etiquetas de color. Sin resumen por producto.
export function htmlBoleta(d, logoSrc) {
  const r = resumen(d);
  const fila = (f) => '<div class="gb-ln"><div>' + (f.tag ? '<span class="gb-tag ' + f.tagCls + '">' + esc(f.tag) + '</span>' : '') + '<b>' + esc(f.nom) + '</b>' + (f.sub ? '<small>' + esc(f.sub) + '</small>' : '') + '</div><span class="' + f.cls + '">' + esc(f.val) + '</span></div>';
  const dias = d.dias.map(x => '<section class="gb-dia"><header><span>' + esc(diaTxt(x.fecha)) + '</span><b>' + esc(plata(x.importe)) + '</b></header>' + filasDia(x).map(fila).join('') + '</section>').join('');
  return '<div class="gb">' +
    '<div class="gb-top"><img src="' + esc(logoSrc || LOGO) + '" alt="Golden"><div class="gb-hd"><div class="gb-t">Boleta de pedidos</div><div class="gb-m">Emitida ' + esc(dmy(hoyART())) + '</div></div></div>' +
    '<div class="gb-datos"><div><span>Cliente</span><b>' + esc(d.persona.nombre) + '</b></div><div class="der"><span>' + (d.fecha_desde === d.fecha_hasta ? 'Fecha' : 'Período') + '</span><b>' + esc(periodoTxt(d)) + '</b></div></div>' +
    '<div class="gb-hero ' + r.final.cls + '"><span>' + esc(r.final.txt) + '</span><b>' + esc(r.final.val) + '</b></div>' +
    '<div class="gb-mini">' + r.filas.map(([a, b, c]) => '<div><span>' + esc(a) + '</span><b class="' + c + '">' + esc(b) + '</b></div>').join('') + '</div>' +
    (r.detalle.length ? '<div class="gb-det"><div class="gb-det-t">' + esc(r.tituloDet) + '</div>' + r.detalle.map(([a, b]) => '<div class="gb-dl"><span>' + esc(a) + '</span><span>' + esc(b) + '</span></div>').join('') + '</div>' : '') +
    (d.dias.length ? '<h3 class="gb-h3">DÍA POR DÍA</h3>' + dias + '<p class="gb-ley"><span class="mas">+</span> suma a su cuenta · <span class="menos">−</span> se descuenta</p>' : '') +
    r.notas.map(t => '<p class="gb-nota">' + esc(t) + '</p>').join('') +
    '<p class="gb-leg">Comprobante interno · No válido como factura</p></div>';
}

function cssEnPagina() {
  if (document.getElementById('gb-css')) return;
  document.head.appendChild(el('link', { id: 'gb-css', rel: 'stylesheet', href: CSS_URL }));
}

export function abrirBoleta(ctx, quien) {
  const hoy = hoyART();
  const maxF = sumarDias(hoy, 1); // la planilla de mañana ya está cerrada desde las 22:31
  const iDesde = entrada('bol-desde', { type: 'date', max: maxF }); iDesde.value = hoy;
  const iHasta = entrada('bol-hasta', { type: 'date', max: maxF }); iHasta.value = hoy;
  const bVer = el('button', { type: 'submit', class: 'btn btn-gold', id: 'bol-ver' }, 'Ver boleta');
  const zona = el('div', { class: 'stack', id: 'bol-zona' });
  const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off', id: 'bol-form' },
    el('p', { text: quien.nombre }),
    el('div', { class: 'form-grid two' }, campo('bol-desde', 'Desde', iDesde), campo('bol-hasta', 'Hasta', iHasta)),
    el('p', { class: 'muted small', text: 'Máximo 1 mes. La boleta se arma recién cuando tocás "Ver boleta".' }), bVer);
  const caja = el('div', { class: 'stack', id: 'op-boleta' }, form, zona);
  modal('Boleta', caja);
  form.addEventListener('submit', (e) => e.preventDefault());
  bVer.addEventListener('click', conBloqueo(bVer, async () => {
    montar(zona);
    const fd = iDesde.value, fh = iHasta.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fd) || !/^\d{4}-\d{2}-\d{2}$/.test(fh)) return montar(zona, aviso('error', 'Elegí las dos fechas.', 'FECHA_INVALIDA'));
    if (fd > fh) return montar(zona, aviso('error', 'La fecha "desde" no puede ser posterior a "hasta".', 'PERIODO_INVALIDO'));
    if (diasEntre(fd, fh) > MAX_DIAS) return montar(zona, aviso('error', 'El período puede ser de hasta 1 mes (31 días).', 'PERIODO_MUY_LARGO'));
    const res = await ctx.pedir(TIPO, 'boleta_persona', { persona_id: quien.persona_id, fecha_desde: fd, fecha_hasta: fh });
    if (!caja.isConnected) return;
    if (res.falla) return montar(zona, avisoFalla(res.falla));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(zona, el('div', { class: 'notice error', role: 'alert', 'data-codigo': res.r.codigo }, res.r.mensaje || 'No se pudo armar la boleta.', el('span', { class: 'code', text: res.r.codigo })));
    mostrar(zona, res.r.datos);
  }, 'Armando…'));
}

function mostrar(zona, d) {
  cssEnPagina();
  const vista = el('div', { id: 'bol-vista', 'data-total': String(d.total_a_pagar) });
  vista.innerHTML = htmlBoleta(d); // todo el texto va escapado en htmlBoleta
  const bImp = el('button', { type: 'button', class: 'btn btn-gold', id: 'bol-imprimir' }, 'Imprimir');
  const bWsp = el('button', { type: 'button', class: 'btn btn-wsp', id: 'bol-compartir' }, 'WhatsApp');
  bImp.addEventListener('click', () => imprimir(d));
  bWsp.addEventListener('click', conBloqueo(bWsp, () => compartir(d), 'Preparando…'));
  const pend = Array.isArray(d.extras_sin_confirmar) ? d.extras_sin_confirmar : [];
  const avisoPend = pend.length ? aviso('pending', 'Hay ' + pend.length + (pend.length === 1 ? ' extra entregado' : ' extras entregados') + ' sin confirmar en Finanzas → Extras (' + [...new Set(pend.map(p => dm(p.fecha)))].join(', ') + '). No están en esta boleta: confirmalos y volvé a armarla.', 'EXTRAS_SIN_CONFIRMAR') : null;
  montar(zona, avisoPend, vista, el('div', { class: 'row' }, bImp, bWsp),
    el('p', { class: 'muted small', text: 'Imprimir también permite "Guardar como PDF". WhatsApp comparte la boleta como imagen.' }));
}

// Impresión en un iframe oculto: no cambia la página ni necesita ventanas nuevas.
function imprimir(d) {
  const logo = new URL(LOGO, document.baseURI).href;
  const css = new URL(CSS_URL, document.baseURI).href;
  const doc = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Boleta ' + esc(d.persona.nombre) + '</title><link rel="stylesheet" href="' + esc(css) + '"></head><body class="gb-print">' + htmlBoleta(d, logo) + '</body></html>';
  const fr = el('iframe', { title: 'Impresión de boleta', 'aria-hidden': 'true', class: 'gb-frame' });
  document.body.appendChild(fr);
  const w = fr.contentWindow;
  w.document.open(); w.document.write(doc); w.document.close();
  let listo = false;
  const lanzar = () => { if (listo) return; listo = true; try { w.focus(); w.print(); } catch (err) { toast('No se pudo abrir la impresión.'); } setTimeout(() => fr.remove(), 60000); };
  // Espera la hoja de estilos y el logo (máximo 3 s) antes de imprimir.
  const esperas = [w.document.querySelector('link'), w.document.querySelector('img')].filter(Boolean).map(x => new Promise(ok => { if (x.tagName === 'IMG' && x.complete) return ok(); x.addEventListener('load', ok); x.addEventListener('error', ok); }));
  Promise.race([Promise.all(esperas), new Promise(ok => setTimeout(ok, 3000))]).then(() => setTimeout(lanzar, 100));
}
// Imagen PNG dibujada a mano (sin librerías externas) para compartir por WhatsApp. 24/11: la pantalla y la impresión siguen en vertical (como antes).
// 24/11 (pedido del usuario): formato HORIZONTAL como el modelo que mandaron: cabecera con cliente y período, total + cuadros,
// días en tarjetas de a 3 por fila (si el último queda solo, ocupa todo el ancho). Mismo contenido que antes; letra más grande.
export async function imagenBoleta(d) {
  const r = resumen(d);
  const S = 2, W = 1200, P = 28, GAP = 16, IN = 16;
  const logo = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = LOGO; });
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (err) { /* sin fuentes: usa las del sistema */ }
  const F = (peso, tam, serif) => peso + ' ' + tam + 'px ' + (serif ? 'Fraunces, Georgia, serif' : 'Manrope, system-ui, sans-serif');
  const COL = { mas: '#A63D2F', menos: '#2F6B46', '': '#241F16', deuda: '#A63D2F', favor: '#2F6B46' };
  const TAGC = { ext: ['#FBE3DE', '#A63D2F'], dev: ['#DDEFE3', '#2F6B46'], aj: ['#EEE9DD', '#6B6350'] };
  const filas = d.dias.map(filasDia);
  const HCAB = 52; // banda del día
  const LW = (W - 2 * P - 2 * GAP) / 3 - 2 * IN; // ancho útil de un renglón
  // Medición previa (para saber el alto antes de dibujar): nombres y aclaraciones largas pasan a 2 renglones en vez de cortarse.
  const mg = document.createElement('canvas').getContext('2d');
  const partir = (t, font, max, lineas) => {
    mg.font = font; const pal = String(t || '').split(' '); const out = []; let lin = '';
    for (const p of pal) { const pr = lin ? lin + ' ' + p : p; if (lin && mg.measureText(pr).width > max) { out.push(lin); lin = p; } else lin = pr; }
    if (lin) out.push(lin);
    if (out.length > lineas) { let u = out.slice(lineas - 1).join(' '); while (u.length > 1 && mg.measureText(u + '…').width > max) u = u.slice(0, -1); out.splice(lineas - 1, out.length, u.trimEnd() + '…'); }
    return out;
  };
  const anchoTag = (f) => { if (!f.tag) return 0; mg.font = F('800', 13); return mg.measureText(f.tag).width + 24; };
  const armar = (f) => { mg.font = F('700', 19); const vw = mg.measureText(f.val).width; const tg = anchoTag(f);
    return { ...f, tg, noms: partir(f.nom, F('700', 19), LW - vw - 14 - tg, 2), subs: f.sub ? partir(f.sub, F('400', 16.5), LW, 2) : [] }; };
  filas.forEach((fs, k) => { filas[k] = fs.map(armar); });
  const altoFila = (f) => 14 + 24 * f.noms.length + 21 * f.subs.length + (f.subs.length ? 4 : 0);
  const altoLista = (fs) => fs.reduce((a, f) => a + altoFila(f), 0);
  // Grilla: de a 3 por fila; un último día solo va a lo ancho con sus renglones en 3 columnas.
  const cw = (W - 2 * P - 2 * GAP) / 3;
  const grupos = [];
  for (let k = 0; k < d.dias.length; k += 3) grupos.push(d.dias.slice(k, k + 3).map((x, j) => k + j));
  const reparte = (fs) => { const cols = [[], [], []]; const per = Math.ceil(fs.length / 3); fs.forEach((f, i) => cols[Math.min(2, Math.floor(i / per))].push(f)); return cols; };
  const ancho = (g) => g.length === 1 && d.dias.length > 1;
  const altoGrupo = (g) => ancho(g) ? HCAB + Math.max(...reparte(filas[g[0]]).map(altoLista)) + 10 : HCAB + Math.max(...g.map(k => altoLista(filas[k]))) + 10;
  const H = 420 + Math.ceil(r.detalle.length / 3) * 26 + grupos.reduce((a, g) => a + altoGrupo(g) + GAP, 0) + r.notas.length * 54 + 120;
  const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
  const g = cv.getContext('2d'); g.scale(S, S);
  const caja = (x, y, w, h, rad, fill, stroke, lw) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, rad); else g.rect(x, y, w, h); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); } };
  const recorta = (t, max) => { let s = String(t); while (s.length > 1 && g.measureText(s).width > max) s = s.slice(0, -2) + '…'; return s; };
  const txt = (t, x, y, font, color, align, max) => { g.font = font; g.fillStyle = color; g.textAlign = align || 'left'; g.fillText(max ? recorta(t, max) : t, x, y); };
  const medir = (t, font) => { g.font = font; return g.measureText(t).width; };
  const calendario = (x, y, color) => { g.strokeStyle = color; g.lineWidth = 2; caja(x, y + 3, 20, 18, 3, null, color, 2); g.beginPath(); g.moveTo(x, y + 9); g.lineTo(x + 20, y + 9); g.moveTo(x + 6, y); g.lineTo(x + 6, y + 5); g.moveTo(x + 14, y); g.lineTo(x + 14, y + 5); g.stroke(); };
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);

  // Cabecera oscura: logo | título y emisión ··· cliente | período
  const HH = 112;
  const gr = g.createLinearGradient(0, 0, W, HH); gr.addColorStop(0, '#2B2418'); gr.addColorStop(1, '#3E3220');
  g.fillStyle = gr; g.fillRect(0, 0, W, HH);
  caja(P, 18, 150, 76, 12, '#fff');
  if (logo) { const lw = 128, lh = Math.min(64, lw * logo.height / logo.width); const lw2 = lh * logo.width / logo.height; g.drawImage(logo, P + (150 - lw2) / 2, 18 + (76 - lh) / 2, lw2, lh); }
  g.fillStyle = '#6B5A3A'; g.fillRect(P + 172, 24, 2, 64);
  txt('Boleta de pedidos', P + 194, 58, F('700', 34, true), '#F1D79C');
  txt('Emitida ' + dmy(hoyART()), P + 194, 88, F('400', 18), '#D9CBA8');
  const labP = d.fecha_desde === d.fecha_hasta ? 'Fecha' : 'Período', valP = periodoTxt(d);
  const wP = Math.max(medir(valP, F('800', 28)), medir(labP, F('400', 18)));
  const xP = W - P - wP;
  txt(labP, xP, 48, F('400', 18), '#D9CBA8'); txt(valP, xP, 84, F('800', 28), '#fff');
  g.fillStyle = '#6B5A3A'; g.fillRect(xP - 26, 24, 2, 64);
  const maxC = Math.max(120, xP - 52 - (P + 194 + medir('Boleta de pedidos', F('700', 34, true)) + 30));
  const nomC = (() => { g.font = F('800', 28); return recorta(d.persona.nombre, maxC); })();
  const wC = Math.max(medir(nomC, F('800', 28)), medir('Cliente', F('400', 18)));
  const xC = xP - 52 - wC;
  txt('Cliente', xC, 48, F('400', 18), '#D9CBA8'); txt(nomC, xC, 84, F('800', 28), '#fff');

  // Total grande + cuadros (debía de antes, pedidos, pagos)
  let y = HH + 22;
  const fav = r.final.cls === 'favorfin';
  const tw = Math.round((W - 2 * P) * 0.4), th = 92;
  caja(P, y, tw, th, 16, fav ? '#E6F2EA' : '#FBF1DC', fav ? '#3F7D57' : '#C9994A', 2);
  txt(r.final.txt, P + 26, y + 56, F('400', 24), '#241F16');
  txt(r.final.val, P + tw - 26, y + 62, F('800', 44), '#241F16', 'right');
  const nb = r.filas.length, bx0 = P + tw + GAP, bw = (W - P - bx0 - GAP * (nb - 1)) / nb;
  r.filas.forEach(([a, b, c], i) => {
    const x = bx0 + i * (bw + GAP), cx = x + bw / 2;
    caja(x, y, bw, th, 16, c === 'favor' ? '#E6F2EA' : '#FAF4E8');
    txt(a, cx, y + 38, F('500', 19), '#4A3F2C', 'center', bw - 24);
    txt(b, cx, y + 72, F('800', 28), COL[c] || '#241F16', 'center', bw - 24);
  });
  y += th;
  // Pagos y ajustes del período (detalle), en 3 columnas
  if (r.detalle.length) {
    y += 30; txt(r.tituloDet, P, y, F('700', 17), '#6B6350');
    const dcw = (W - 2 * P) / 3;
    r.detalle.forEach(([a, b], i) => {
      const x = P + (i % 3) * dcw, yy = y + 26 * (Math.floor(i / 3) + 1);
      const vb = medir(b, F('700', 17));
      txt(a, x, yy, F('400', 17), '#241F16', 'left', dcw - vb - 30);
      txt(b, x + dcw - 20, yy, F('700', 17), b.startsWith('−') ? COL.menos : '#241F16', 'right');
    });
    y += 26 * Math.ceil(r.detalle.length / 3);
  }

  // Un renglón de un día
  const renglon = (f, x0, w, yy, primero) => {
    if (!primero) { g.fillStyle = '#F0E7D2'; for (let z = x0; z < x0 + w; z += 7) g.fillRect(z, yy, 3, 1); }
    if (f.tag) {
      const [bg, fg] = TAGC[f.tagCls] || TAGC.aj;
      caja(x0, yy + 9, f.tg - 8, 24, 7, bg);
      txt(f.tag, x0 + 8, yy + 26, F('800', 13), fg);
    }
    f.noms.forEach((t, i) => txt(t, x0 + f.tg, yy + 28 + 24 * i, F('700', 19), '#241F16'));
    txt(f.val, x0 + w, yy + 28, F('700', 19), COL[f.cls] || '#241F16', 'right');
    const ys = yy + 28 + 24 * (f.noms.length - 1);
    f.subs.forEach((t, i) => txt(t, x0, ys + 21 + 21 * i, F('400', 16.5), '#6B6350'));
    return yy + altoFila(f);
  };
  // Banda del día: calendario, nombre y total en pastilla oscura
  const banda = (x, yy, w, dia) => {
    g.save(); caja(x, yy, w, HCAB, 14); g.clip(); g.fillStyle = '#FBF1DC'; g.fillRect(x, yy, w, HCAB); g.restore();
    calendario(x + IN, yy + 15, '#8A6A2E');
    txt(diaTxt(dia.fecha), x + IN + 32, yy + 34, F('800', 22), '#241F16');
    const imp = plata(dia.importe), pw = medir(imp, F('800', 21)) + 26;
    caja(x + w - IN - pw + 6, yy + 10, pw, 32, 10, '#4A3B22');
    txt(imp, x + w - IN + 6 - pw / 2, yy + 33, F('800', 21), '#fff', 'center');
  };

  if (d.dias.length) {
    y += 46; txt('DÍA POR DÍA', P, y, F('800', 20), '#6B5A3A');
    const lx = P + medir('DÍA POR DÍA', F('800', 20)) + 18; g.fillStyle = '#C9B48A'; g.fillRect(lx, y - 7, W - P - lx, 1.5);
    y += 18;
    for (const gr2 of grupos) {
      const h = altoGrupo(gr2);
      if (ancho(gr2)) {
        const k = gr2[0], w = W - 2 * P;
        caja(P, y, w, h, 14, '#fff', '#EADFC6', 1.5); banda(P, y, w, d.dias[k]);
        reparte(filas[k]).forEach((col, c) => { let yy = y + HCAB + 2; col.forEach((f, i) => { yy = renglon(f, P + IN + c * (cw + GAP), cw - 2 * IN, yy, i === 0); }); });
      } else {
        gr2.forEach((k, j) => {
          const x = P + j * (cw + GAP);
          caja(x, y, cw, h, 14, '#fff', '#EADFC6', 1.5); banda(x, y, cw, d.dias[k]);
          let yy = y + HCAB + 2; filas[k].forEach((f, i) => { yy = renglon(f, x + IN, cw - 2 * IN, yy, i === 0); });
        });
      }
      y += h + GAP;
    }
  }
  // Notas (a confirmar, saldo a favor, sin pedidos)
  g.textAlign = 'left'; g.fillStyle = '#6B6350'; g.font = F('400', 17);
  for (const t of r.notas) {
    y += 4; const pal = t.split(' '); let lin = '';
    for (const p of pal) { const prueba = lin ? lin + ' ' + p : p; if (g.measureText(prueba).width > W - 2 * P) { y += 24; g.fillText(lin, P, y); lin = p; } else lin = prueba; }
    if (lin) { y += 24; g.fillText(lin, P, y); }
  }
  // Pie: leyenda + comprobante interno
  y += 26;
  if (d.dias.length) {
    g.textAlign = 'left'; g.font = F('500', 17); let xl = P;
    [['+', '#A63D2F'], [' suma a su cuenta   ', '#6B6350'], ['−', '#2F6B46'], [' se descuenta', '#6B6350']].forEach(([t, c]) => { g.fillStyle = c; g.fillText(t, xl, y); xl += g.measureText(t).width; });
  }
  txt('Comprobante interno · No válido como factura', W - P, y, F('400', 17), '#6B6350', 'right');
  const alto = Math.min(H, y + 22);
  const final = document.createElement('canvas'); final.width = W * S; final.height = alto * S;
  final.getContext('2d').drawImage(cv, 0, 0);
  return new Promise((ok) => final.toBlob((b) => ok(b), 'image/png'));
}

async function compartir(d) {
  const blob = await imagenBoleta(d);
  if (!blob) return toast('No se pudo preparar la imagen.');
  const nombre = 'Boleta ' + (d.persona.nombre || 'cliente').replace(/[^\p{L}\p{N} ]/gu, '').trim() + ' ' + d.fecha_desde + (d.fecha_hasta !== d.fecha_desde ? ' al ' + d.fecha_hasta : '') + '.png';
  const archivo = new File([blob], nombre, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: 'Boleta Golden' }); } catch (err) { if (err && err.name !== 'AbortError') toast('No se pudo compartir.'); }
    return;
  }
  // Compu (sin menú de compartir): se descarga la imagen para adjuntarla en WhatsApp Web.
  const a = el('a', { href: URL.createObjectURL(blob), download: nombre });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  toast('Se descargó la imagen de la boleta. Adjuntala en WhatsApp.');
}
