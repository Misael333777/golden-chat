// Íconos del panel Cliente (trazos estilo lucide). Se arman con createElementNS: nunca se inserta HTML.
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
