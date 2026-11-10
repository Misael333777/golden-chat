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
function resumen(d) {
  const previo = Math.round(((d.saldo_anterior || 0) + (d.pagos_periodo || 0) + (d.ajustes_periodo || 0)) * 100) / 100;
  const filas = [[d.fecha_desde === d.fecha_hasta ? 'Pedidos del día' : 'Pedidos del período', plata(d.total_pedidos), '']];
  if (previo < 0) filas.push(['A favor de antes', '− ' + plata(previo), 'favor']);
  else filas.push(['Deuda anterior', previo === 0 && movsDe(d).length ? 'Pagada ✓' : (previo > 0 ? '+ ' : '') + plata(previo), previo > 0 ? 'deuda' : previo === 0 && movsDe(d).length ? 'favor' : '']);
  const t = d.total_a_pagar;
  const final = t < 0 ? { txt: 'Le queda a favor', val: plata(t), cls: 'favorfin' } : { txt: 'Total a pagar', val: plata(t), cls: 'pagar' };
  // 05/11 (pedido del usuario): debajo, el detalle de lo que incluye la deuda anterior (lo de antes + pagos y ajustes del período).
  const movs = movsDe(d);
  const sig = (v) => (v > 0 ? '+ ' : v < 0 ? '− ' : '') + plata(v);
  // 10/11 (pedido del usuario): si la deuda anterior quedó pagada, solo dice 'Pagada' (sin detalle).
  const detalle = movs.length && previo !== 0 ? [['Saldo antes del ' + dm(d.fecha_desde), sig(d.saldo_anterior || 0)]].concat(movs.map(m => [dm(m.fecha) + ' ' + m.detalle, sig(m.importe)])) : [];
  // 10/11 (pedido del usuario): se aclara cuánto quedó (si se pagó todo, dice 'pagada').
  if (detalle.length) detalle.push([previo > 0 ? 'Queda debiendo' : previo < 0 ? 'Queda a favor' : 'Queda pagada', previo === 0 ? '$0' : plata(previo)]);
  const tituloDet = movs.length ? (previo < 0 ? 'Saldo a favor de antes' : previo === 0 ? 'Deuda anterior (ya pagada)' : 'Deuda anterior') + ':' : '';
  const notas = [];
  if (previo !== 0 && !movs.length) notas.push((previo > 0 ? 'Deuda anterior' : 'A favor de antes') + ' = lo que quedaba de antes del ' + dmy(d.fecha_desde) + '.');
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
    (r.detalle.length ? '<div class="gb-det"><div class="gb-det-t">' + esc(r.tituloDet) + '</div>' + r.detalle.map(([a, b], i) => '<div class="gb-dl' + (i === r.detalle.length - 1 ? ' gb-q' : '') + '"><span>' + esc(a) + '</span><span>' + esc(b) + '</span></div>').join('') + '</div>' : '') +
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

// Imagen PNG dibujada a mano (sin librerías externas) para compartir por WhatsApp. 10/11: mismo diseño que la pantalla.
async function imagenBoleta(d) {
  const r = resumen(d);
  const S = 2, W = 520, P = 22, IN = 12;
  const logo = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = LOGO; });
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (err) { /* sin fuentes: usa las del sistema */ }
  const F = (peso, tam, serif) => peso + ' ' + tam + 'px ' + (serif ? 'Fraunces, Georgia, serif' : 'Manrope, system-ui, sans-serif');
  const filas = d.dias.map(filasDia);
  const altoFila = (f) => (f.sub ? 42 : 28);
  const H = 400 + filas.reduce((a, fs) => a + 46 + fs.reduce((b, f) => b + altoFila(f), 0), 0) + (r.detalle.length + 1) * 18 + r.notas.length * 40 + 140;
  const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
  const g = cv.getContext('2d'); g.scale(S, S);
  const caja = (x, y, w, h, rad, fill, stroke, lw) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, rad); else g.rect(x, y, w, h); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); } };
  const recorta = (t, max) => { let s = String(t); while (s.length > 1 && g.measureText(s).width > max) s = s.slice(0, -2) + '…'; return s; };
  const txt = (t, x, y, font, color, align, max) => { g.font = font; g.fillStyle = color; g.textAlign = align || 'left'; g.fillText(max ? recorta(t, max) : t, x, y); };
  const COL = { mas: '#A63D2F', menos: '#2F6B46', '': '#241F16', deuda: '#A63D2F', favor: '#2F6B46' };
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  // Cabecera
  const gr = g.createLinearGradient(0, 0, W, 90); gr.addColorStop(0, '#2B2418'); gr.addColorStop(1, '#4A3B22');
  g.fillStyle = gr; g.fillRect(0, 0, W, 90);
  caja(P, 16, 104, 58, 10, '#fff');
  if (logo) { const lw = 88, lh = lw * logo.height / logo.width; g.drawImage(logo, P + 8, 16 + (58 - lh) / 2, lw, lh); }
  txt('Boleta de pedidos', W - P, 42, F('600', 19, true), '#F1D79C', 'right');
  txt('Emitida ' + dmy(hoyART()), W - P, 62, F('400', 12), '#D9CBA8', 'right');
  // Cliente y período
  let y = 112;
  txt('Cliente', P, y, F('400', 11), '#8A7F66'); txt(d.fecha_desde === d.fecha_hasta ? 'Fecha' : 'Período', W - P, y, F('400', 11), '#8A7F66', 'right');
  y += 19; txt(d.persona.nombre, P, y, F('800', 15), '#241F16', 'left', W / 2 - P); txt(periodoTxt(d), W - P, y, F('800', 15), '#241F16', 'right');
  y += 14; g.fillStyle = '#EFE6D0'; g.fillRect(0, y, W, 1);
  // Total grande
  y += 16; const fav = r.final.cls === 'favorfin';
  caja(P, y, W - 2 * P, 62, 14, fav ? '#E6F2EA' : '#FBF1DC', fav ? '#3F7D57' : '#C9994A', 2);
  txt(r.final.txt, P + 18, y + 38, F('400', 16), '#241F16'); txt(r.final.val, W - P - 18, y + 41, F('800', 27), '#241F16', 'right');
  // Cajitas
  y += 74; const cw = (W - 2 * P - 8) / 2;
  r.filas.forEach(([a, b, c], i) => { const x = P + i * (cw + 8); caja(x, y, cw, 46, 10, '#FAF7EF'); txt(a, x + 10, y + 18, F('400', 12), '#6B6350', 'left', cw - 20); txt(b, x + 10, y + 36, F('800', 14), COL[c] || '#241F16', 'left', cw - 20); });
  y += 46;
  if (r.detalle.length) {
    y += 22; txt(r.tituloDet, P, y, F('700', 12), '#6B6350');
    r.detalle.forEach(([a, b], i) => { y += 18; const ult = i === r.detalle.length - 1; if (ult) { g.fillStyle = '#EFE6D0'; g.fillRect(P, y - 13, W - 2 * P, 1); } txt(a, P, y, F(ult ? '700' : '400', 12), '#241F16', 'left', W - 2 * P - 110); txt(b, W - P, y, F(ult ? '700' : '400', 12), '#241F16', 'right'); });
  }
  if (d.dias.length) {
    y += 30; txt('DÍA POR DÍA', P, y, F('700', 12), '#8A7F66'); y += 10;
    d.dias.forEach((x, k) => {
      const fs = filas[k], h = 34 + fs.reduce((a, f) => a + altoFila(f), 0);
      g.save(); caja(P, y, W - 2 * P, h, 12, '#fff', '#EFE6D0', 1); g.clip();
      g.fillStyle = '#FBF3E3'; g.fillRect(P, y, W - 2 * P, 34); g.restore();
      caja(P, y, W - 2 * P, h, 12, null, '#EFE6D0', 1);
      txt(diaTxt(x.fecha), P + IN, y + 22, F('700', 14), '#241F16'); txt(plata(x.importe), W - P - IN, y + 22, F('800', 14), '#241F16', 'right');
      let yy = y + 34;
      fs.forEach((f, i) => {
        if (i) { g.fillStyle = '#F0E7D2'; for (let z = P + IN; z < W - P - IN; z += 6) g.fillRect(z, yy, 3, 1); }
        let xx = P + IN;
        if (f.tag) {
          g.font = F('800', 9); const tw = g.measureText(f.tag).width + 10;
          caja(xx, yy + 8, tw, 15, 5, f.tagCls === 'ext' ? '#FBE3DE' : f.tagCls === 'dev' ? '#DDEFE3' : '#EEE9DD');
          txt(f.tag, xx + 5, yy + 19, F('800', 9), f.tagCls === 'ext' ? '#A63D2F' : f.tagCls === 'dev' ? '#2F6B46' : '#6B6350'); xx += tw + 6;
        }
        g.font = F('600', 13); const vw = g.measureText(f.val).width;
        txt(f.nom, xx, yy + 20, F('700', 13.5), '#241F16', 'left', W - P - IN - vw - 14 - xx);
        txt(f.val, W - P - IN, yy + 20, F('600', 13.5), COL[f.cls] || '#241F16', 'right');
        if (f.sub) txt(f.sub, P + IN, yy + 36, F('400', 12), '#8A7F66', 'left', W - 2 * P - 2 * IN);
        yy += altoFila(f);
      });
      y += h + 10;
    });
    y += 6; g.textAlign = 'left'; g.font = F('400', 11.5);
    let xl = P; [['+', '#A63D2F'], [' suma a su cuenta · ', '#8A7F66'], ['−', '#2F6B46'], [' se descuenta', '#8A7F66']].forEach(([t, c]) => { g.fillStyle = c; g.fillText(t, xl, y); xl += g.measureText(t).width; });
  }
  g.textAlign = 'left'; g.fillStyle = '#6B6350'; g.font = F('400', 12);
  for (const t of r.notas) {
    y += 6; const pal = t.split(' '); let lin = '';
    for (const p of pal) { const prueba = lin ? lin + ' ' + p : p; if (g.measureText(prueba).width > W - 2 * P) { y += 16; g.fillText(lin, P, y); lin = p; } else lin = prueba; }
    if (lin) { y += 16; g.fillText(lin, P, y); }
  }
  y += 24; g.fillStyle = '#EFE6D0'; g.fillRect(0, y - 12, W, 1);
  txt('Comprobante interno · No válido como factura', W / 2, y + 6, F('400', 10.5), '#9A917B', 'center');
  const final = document.createElement('canvas'); final.width = W * S; final.height = Math.min(H, y + 20) * S;
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
