// Admin Finanzas → Boleta por período (SOLO LECTURA). Desde la ficha de Cuentas por cobrar.
// Se pide al backend SOLO cuando se toca "Ver boleta" (1 ejecución). Imprimir y compartir se hacen en el dispositivo, sin volver a consultar.
// Los importes y saldos los calcula el backend; acá solo se formatean. Comprobante interno: no es factura.
import { el, montar, aviso, conBloqueo, modal, toast } from '../../ui.js';
import { TIPO, hoyART, campo, entrada } from './comun.js';
import { avisoFalla } from '../admin/personas.js';

const LOGO = 'assets/img/logo.png';
const MAX_DIAS = 31;
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const ENT = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const plata = (v) => (typeof v === 'number' && Number.isFinite(v) ? '$' + ENT.format(Math.abs(v)) : 'A confirmar');
const dm = (f) => f.slice(8, 10) + '/' + f.slice(5, 7);
const dmy = (f) => dm(f) + '/' + f.slice(0, 4);
const diaTxt = (f) => DIAS[new Date(f + 'T12:00:00Z').getUTCDay()] + ' ' + dm(f);
const cant = (l) => (l.cantidad === null || l.cantidad === undefined ? '' : ENT.format(l.cantidad) + (l.unidad ? ' ' + l.unidad : ''));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sumarDias = (f, n) => new Date(Date.parse(f + 'T12:00:00Z') + n * 86400e3).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400e3) + 1;

// Filas de totales (texto, importe con signo, clase). Una sola fuente para pantalla, impresión e imagen.
function resumen(d) {
  const filas = [['Total de pedidos del período', plata(d.total_pedidos), '']];
  if (d.saldo_anterior > 0) filas.push(['Deuda anterior', '+ ' + plata(d.saldo_anterior), 'deuda']);
  if (d.saldo_anterior < 0) filas.push(['Saldo a favor anterior', '− ' + plata(d.saldo_anterior), 'favor']);
  if (d.pagos_periodo !== 0) filas.push(['Pagos del período' + (d.fechas_pagos.length ? ' (' + d.fechas_pagos.map(dm).join(', ') + ')' : ''), (d.pagos_periodo < 0 ? '− ' : '+ ') + plata(d.pagos_periodo), d.pagos_periodo < 0 ? 'favor' : 'deuda']);
  if (d.ajustes_periodo !== 0) filas.push(['Ajustes del período', (d.ajustes_periodo < 0 ? '− ' : '+ ') + plata(d.ajustes_periodo), d.ajustes_periodo < 0 ? 'favor' : 'deuda']);
  const t = d.total_a_pagar;
  const final = t < 0 ? { txt: 'Le queda a favor', val: plata(t), cls: 'favorfin' } : { txt: 'Total a pagar', val: plata(t), cls: 'pagar' };
  const notas = [];
  if (d.saldo_anterior > 0) notas.push('Deuda anterior = lo que debía antes del ' + dmy(d.fecha_desde) + '.');
  if (t < 0) notas.push('No tiene nada para pagar. El saldo a favor se descuenta de los próximos pedidos.');
  if (d.dias_sin_importe > 0) notas.push('Hay ' + d.dias_sin_importe + (d.dias_sin_importe === 1 ? ' día' : ' días') + ' con importe a confirmar (no suman al total).');
  if (!d.dias.length) notas.push('No hay pedidos en planillas cerradas de este período.');
  return { filas, final, notas };
}
const periodoTxt = (d) => (d.fecha_desde === d.fecha_hasta ? dmy(d.fecha_desde) : dm(d.fecha_desde) + ' al ' + dmy(d.fecha_hasta));

// Los estilos de la boleta estan en assets/css/boleta.css (la CSP de la pagina bloquea estilos inline).
const CSS_URL = 'assets/css/boleta.css';

export function htmlBoleta(d, logoSrc) {
  const r = resumen(d);
  const filasDias = d.dias.map(x => '<tr><td class="f">' + esc(diaTxt(x.fecha)) + '</td><td>' +
    (x.lineas.length ? x.lineas.map(l => '<div class="gb-it"><span>' + esc(l.detalle) + '</span><span>' + esc(cant(l)) + '</span></div>').join('') : '<div class="gb-it"><span>Pedido del día</span><span></span></div>') +
    '</td><td class="n">' + esc(plata(x.importe)) + '</td></tr>').join('');
  return '<div class="gb">' +
    '<div class="gb-head"><img src="' + esc(logoSrc || LOGO) + '" alt="Golden"><div class="gb-hd"><div class="gb-t">Boleta de pedidos</div><div class="gb-m">Emitida ' + esc(dmy(hoyART())) + '</div></div></div>' +
    '<div class="gb-datos"><div><span>Cliente</span><b>' + esc(d.persona.nombre) + '</b></div><div><span>' + (d.fecha_desde === d.fecha_hasta ? 'Fecha' : 'Período') + '</span><b>' + esc(periodoTxt(d)) + '</b></div></div>' +
    '<table><thead><tr><th>Fecha</th><th>Pedido</th><th class="n">Importe</th></tr></thead><tbody>' + filasDias + '</tbody></table>' +
    '<div class="gb-tot">' + r.filas.map(([a, b, c]) => '<div class="gb-r ' + c + '"><span>' + esc(a) + '</span><b>' + esc(b) + '</b></div>').join('') +
    '<div class="gb-r gb-final ' + r.final.cls + '"><span>' + esc(r.final.txt) + '</span><b>' + esc(r.final.val) + '</b></div></div>' +
    r.notas.map(t => '<p class="gb-nota">' + esc(t) + '</p>').join('') +
    '<p class="gb-leg">Comprobante interno · No válido como factura</p></div>';
}

function cssEnPagina() {
  if (document.getElementById('gb-css')) return;
  document.head.appendChild(el('link', { id: 'gb-css', rel: 'stylesheet', href: CSS_URL }));
}

export function abrirBoleta(ctx, quien) {
  const hoy = hoyART();
  const maxF = sumarDias(hoy, 1); // la planilla de mañana ya está cerrada desde las 22:01
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
  montar(zona, vista, el('div', { class: 'row' }, bImp, bWsp),
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

// Imagen PNG dibujada a mano (sin librerías externas) para compartir por WhatsApp.
async function imagenBoleta(d) {
  const r = resumen(d);
  const S = 2, W = 420, P = 22;
  const logo = await new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = LOGO; });
  try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (err) { /* sin fuentes: usa las del sistema */ }
  const F = (peso, tam, serif) => peso + ' ' + tam + 'px ' + (serif ? 'Fraunces, Georgia, serif' : 'Manrope, system-ui, sans-serif');
  // Alto: cabecera + datos + encabezado tabla + filas + totales + notas
  const altoDia = (x) => Math.max(1, x.lineas.length) * 18 + 14;
  const H = 70 + 60 + 26 + d.dias.reduce((a, x) => a + altoDia(x), 0) + 16 + r.filas.length * 26 + 52 + r.notas.length * 34 + 46;
  const cv = document.createElement('canvas'); cv.width = W * S; cv.height = H * S;
  const g = cv.getContext('2d'); g.scale(S, S);
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  let y = P;
  if (logo) g.drawImage(logo, P, y, 96, 96 * logo.height / logo.width);
  g.textAlign = 'right'; g.fillStyle = '#241F16'; g.font = F('600', 17, true); g.fillText('Boleta de pedidos', W - P, y + 20);
  g.fillStyle = '#6B6350'; g.font = F('400', 11); g.fillText('Emitida ' + dmy(hoyART()), W - P, y + 36);
  y += 62; g.fillStyle = '#C9994A'; g.fillRect(P, y, W - 2 * P, 2);
  y += 22; g.textAlign = 'left'; g.fillStyle = '#6B6350'; g.font = F('400', 11);
  g.fillText('Cliente', P, y); g.fillText(d.fecha_desde === d.fecha_hasta ? 'Fecha' : 'Período', W / 2, y);
  y += 18; g.fillStyle = '#241F16'; g.font = F('800', 14);
  const recorta = (t, max) => { let s = String(t); while (s.length > 1 && g.measureText(s).width > max) s = s.slice(0, -2) + '…'; return s; };
  g.fillText(recorta(d.persona.nombre, W / 2 - P - 8), P, y); g.fillText(periodoTxt(d), W / 2, y);
  y += 26; g.fillStyle = '#6B6350'; g.font = F('600', 11); g.fillText('Fecha', P, y); g.fillText('Pedido', P + 82, y); g.textAlign = 'right'; g.fillText('Importe', W - P, y);
  y += 7; g.fillStyle = '#C9B37C'; g.fillRect(P, y, W - 2 * P, 1);
  for (const x of d.dias) {
    let yy = y + 18;
    g.textAlign = 'left'; g.fillStyle = '#241F16'; g.font = F('600', 13); g.fillText(diaTxt(x.fecha), P, yy);
    g.textAlign = 'right'; g.font = F('400', 13); g.fillText(plata(x.importe), W - P, yy);
    const ls = x.lineas.length ? x.lineas : [{ detalle: 'Pedido del día', cantidad: null }];
    for (const l of ls) {
      g.textAlign = 'left'; g.fillStyle = '#241F16'; g.fillText(recorta(l.detalle, 150), P + 82, yy);
      g.textAlign = 'right'; g.fillStyle = '#6B6350'; g.fillText(cant(l), W - P - 92, yy); yy += 18;
    }
    y += altoDia(x);
    g.fillStyle = '#E2D6B8'; for (let i = P; i < W - P; i += 6) g.fillRect(i, y, 3, 1);
  }
  y += 10;
  for (const [a, b, c] of r.filas) {
    y += 22; g.textAlign = 'left'; g.fillStyle = '#241F16'; g.font = F('400', 14); g.fillText(recorta(a, W - 2 * P - 120), P, y);
    g.textAlign = 'right'; g.fillStyle = c === 'deuda' ? '#A63D2F' : c === 'favor' ? '#3F7D57' : '#241F16'; g.font = F('800', 14); g.fillText(b, W - P, y); y += 4;
  }
  y += 12;
  const fav = r.final.cls === 'favorfin';
  g.fillStyle = fav ? 'rgba(63,125,87,0.10)' : '#FBF3E3'; g.strokeStyle = fav ? '#3F7D57' : '#C9994A'; g.lineWidth = 1.5;
  if (g.roundRect) { g.beginPath(); g.roundRect(P, y, W - 2 * P, 44, 10); g.fill(); g.stroke(); } else { g.fillRect(P, y, W - 2 * P, 44); g.strokeRect(P, y, W - 2 * P, 44); }
  g.textAlign = 'left'; g.fillStyle = '#241F16'; g.font = F('400', 16); g.fillText(r.final.txt, P + 12, y + 28);
  g.textAlign = 'right'; g.font = F('800', 20); g.fillText(r.final.val, W - P - 12, y + 29);
  y += 52;
  g.textAlign = 'left'; g.fillStyle = '#6B6350'; g.font = F('400', 12);
  for (const t of r.notas) {
    const pal = t.split(' '); let lin = '';
    for (const p of pal) { const prueba = lin ? lin + ' ' + p : p; if (g.measureText(prueba).width > W - 2 * P) { y += 16; g.fillText(lin, P, y); lin = p; } else lin = prueba; }
    if (lin) { y += 16; g.fillText(lin, P, y); }
  }
  y += 22; g.fillStyle = '#EFE6D0'; g.fillRect(P, y - 12, W - 2 * P, 1);
  g.textAlign = 'center'; g.fillStyle = '#9A917B'; g.font = F('400', 10); g.fillText('Comprobante interno · No válido como factura', W / 2, y + 4);
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
