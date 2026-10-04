// Panel Cliente → Hablar con Golden. soporte/solicitar_soporte (crea un caso para Admin General) y soporte/mis_casos (solo lectura).
// El caso llega a Admin General → Pendientes → Consultas de clientes con persona, rol, tema, mensaje, fecha y estado.
// Si el tema requiere Finanzas, Admin General lo deriva (circuito General → Finanzas → General). El cliente nunca entra a Admin Finanzas.
import { el, montar, aviso, conBloqueo, toast } from '../../ui.js';
import { leer, escribir, cabecera, vacio, fmtHora, textoOk } from './comun.js';

export const TEMA_TXT = { pedido: 'Mi pedido', extra: 'Un extra', cuenta: 'Mi cuenta / pagos', otro: 'Otra cosa' };
export const EST_SOP = { pendiente: ['Recibida', 'warn'], en_atencion: ['Golden la está viendo', 'gold'], resuelto: ['Respondida', 'ok'] };

export function vistaSoporte(ctx, cont) {
  const sTema = el('select', { class: 'select', id: 'sop-tema' }, Object.entries(TEMA_TXT).map(([v, t]) => el('option', { value: v, text: t })));
  const iMsj = el('textarea', { class: 'input', id: 'sop-mensaje', maxlength: '500', rows: '4', placeholder: 'Contanos qué pasó o qué necesitás.' });
  const zona = el('div', { class: 'stack', id: 'sop-aviso' });
  const b = el('button', { type: 'submit', class: 'btn btn-primary', id: 'sop-enviar' }, 'Enviar a Golden');
  const form = el('form', { class: 'card stack', id: 'sop-form', novalidate: true, autocomplete: 'off' },
    el('div', { class: 'field' }, el('label', { for: 'sop-tema', text: 'Sobre qué es' }), sTema),
    el('div', { class: 'field' }, el('label', { for: 'sop-mensaje', text: 'Mensaje' }), iMsj, el('span', { class: 'hint', text: 'Entre 3 y 500 caracteres. No escribas tu código de acceso.' })), b, zona);
  const lista = el('div', { class: 'stack', id: 'sop-casos', 'data-estado': 'cargando' });
  montar(cont, cabecera('Hablar con Golden', 'Escribinos y una persona de Golden te responde. Podés ver acá el estado de tus consultas.'), form,
    el('div', { class: 'card stack' }, el('h3', { text: 'Mis consultas' }), lista));
  const cargar = () => leer(ctx, lista, 'mis_casos', {}, (d) => {
    const l = d.casos || [];
    if (!l.length) return montar(lista, vacio('Todavía no hiciste consultas.'));
    montar(lista, l.map(k => el('div', { class: 'card pend-card stack', 'data-caso': k.caso_id, 'data-estado-caso': k.estado },
      el('div', { class: 'card-head' }, el('strong', { text: TEMA_TXT[k.tema] || 'Consulta' }), el('span', { class: 'spacer' }), el('span', { class: 'chip ' + (EST_SOP[k.estado] || ['', ''])[1], text: (EST_SOP[k.estado] || [k.estado])[0] })),
      el('p', { class: 'small', text: k.mensaje }),
      k.resolucion ? el('p', { class: 'small', 'data-resolucion': 'true' }, el('strong', { text: 'Respuesta de Golden: ' }), k.resolucion) : null,
      el('p', { class: 'muted small', text: 'Enviada ' + fmtHora(k.fecha_creacion) + (k.fecha_resolucion ? ' · respondida ' + fmtHora(k.fecha_resolucion) : '') }))));
  });
  form.addEventListener('submit', conBloqueo(b, async () => {
    montar(zona);
    const mensaje = iMsj.value.trim();
    if (mensaje.length < 3) return montar(zona, aviso('error', 'Escribí tu mensaje (al menos 3 caracteres).', 'DATOS_INCOMPLETOS'));
    if (/GLD-/i.test(mensaje)) return montar(zona, aviso('error', 'No escribas tu código de acceso en el mensaje.', 'DATOS_INCOMPLETOS'));
    await escribir(ctx, zona, 'solicitar_soporte', { tema: sTema.value, mensaje }, async (r) => {
      iMsj.value = '';
      montar(zona, el('div', { class: 'notice ok', role: 'status', 'data-codigo': r.codigo }, r.codigo === 'OPERACION_YA_PROCESADA' ? textoOk(r) : 'Consulta enviada. Golden te va a responder.', el('span', { class: 'code', text: r.codigo })));
      toast('Consulta enviada a Golden.');
      await cargar();
    });
  }, 'Enviando…'));
  cargar();
}
