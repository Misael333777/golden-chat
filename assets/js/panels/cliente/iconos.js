// Íconos de todos los paneles (trazos estilo lucide). Se arman con createElementNS: nunca se inserta HTML.
const NS = 'http://www.w3.org/2000/svg';
const TRAZOS = {
  inicio: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  pedido: ['M6 8h12l-1 12H7z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  pedidos: ['M9 5h11', 'M9 12h11', 'M9 19h11', 'M4 5h.01', 'M4 12h.01', 'M4 19h.01'],
  cuenta: ['M3 7a2 2 0 0 1 2-2h13v4', 'M3 7v11a2 2 0 0 0 2 2h15V9H5a2 2 0 0 1-2-2z', 'M16 14.5h.01'],
  soporte: ['M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z'],
  calendario: ['M4 6h16v14H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  repetir: ['M17 2l3 3-3 3', 'M4 11V9a4 4 0 0 1 4-4h12', 'M7 22l-3-3 3-3', 'M20 13v2a4 4 0 0 1-4 4H4'],
  mas: ['M12 5v14', 'M5 12h14'],
  flecha: ['M5 12h14', 'M13 6l6 6-6 6'],
  chevron: ['M9 6l6 6-6 6'],
  diagonal: ['M7 17 17 7', 'M8 7h9v9'],
  reloj: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 7v5l3 2'],
  salir: ['M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4', 'M10 17l5-5-5-5', 'M15 12H4'],
  cambiar: ['M4 8h13l-3-3', 'M20 16H7l3 3'],
  trigo: ['M12 21V9', 'M12 13c-3 0-4-2-4-4 3 0 4 2 4 4z', 'M12 13c3 0 4-2 4-4-3 0-4 2-4 4z', 'M12 9c-2.5 0-3.5-2-3.5-3.5C11 5.5 12 7.5 12 9z', 'M12 9c2.5 0 3.5-2 3.5-3.5C13 5.5 12 7.5 12 9z'],
  persona: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5'],
  etiqueta: ['M3 12V4h8l10 10-8 8z', 'M7.5 8.5h.01'],
  personas: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M2 21c0-3.5 3-6 7-6s7 2.5 7 6', 'M16 3.5a4 4 0 0 1 0 7', 'M22 21c0-3-2-5.2-5-5.8'],
  camion: ['M2 6h12v10H2z', 'M14 9h4l3 3.5V16h-7', 'M6.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', 'M17.5 19.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z'],
  caja: ['M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z', 'M3 7.5 12 12l9-4.5', 'M12 12v9'],
  produccion: ['M6 13.5a4 4 0 0 1 1.3-7.8 5 5 0 0 1 9.4 0A4 4 0 0 1 18 13.5V20H6z', 'M6 16.5h12'],
  alerta: ['M12 3.5 2.5 20h19z', 'M12 10v4', 'M12 17h.01'],
  grafico: ['M3 20h18', 'M6 16v-5', 'M11 16V6', 'M16 16V9', 'M21 16v-3'],
  ajustes: ['M4 6h9', 'M17 6h3', 'M15 4v4', 'M4 12h3', 'M11 12h9', 'M9 10v4', 'M4 18h11', 'M19 18h1', 'M17 16v4'],
  banco: ['M3 10l9-6 9 6', 'M5 10v8', 'M9.5 10v8', 'M14.5 10v8', 'M19 10v8', 'M3 20.5h18'],
  entrada: ['M12 4v11', 'M7 10.5l5 5 5-5', 'M5 20h14'],
  salida: ['M12 20V9', 'M7 13.5l5-5 5 5', 'M5 4h14'],
  documento: ['M6 3h9l4 4v14H6z', 'M15 3v4h4', 'M9 12h7', 'M9 16h7'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  cerrar: ['M6 6l12 12', 'M18 6 6 18'],
  llave: ['M8 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M11 11h10', 'M18 11v3', 'M21 11v2'],
};
export function icono(nombre, tam) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('width', String(tam || 18)); s.setAttribute('height', String(tam || 18));
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.7');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false'); s.setAttribute('class', 'cg-ico');
  for (const d of (TRAZOS[nombre] || [])) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.appendChild(p); }
  return s;
}
