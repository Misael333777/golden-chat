// Admin General → Configuración. Datos generales de Golden (no de personas).
// Acciones existentes de Web API PROD: ver_configuracion y actualizar_configuracion (Admin Configuracion PROD).
// El backend valida y normaliza (teléfono, logo https). El logo se elige como archivo (imagenes.js): nunca se pega una URL. Solo se envían los campos que cambian; vacío = borrar (null).
import * as ops from '../../ops.js';
import { el, montar, aviso, modal, conBloqueo, toast } from '../../ui.js';
import { avisoFalla, avisoSinConfirmar } from './personas.js';
import { selectorImagen, mostrarImagen } from './imagenes.js';

const TIPO = 'admin_general';
const CAMPOS = [['nombre_comercial', 'Nombre comercial', 120], ['telefono', 'Teléfono', 40], ['direccion', 'Dirección', 200]];
const MSJ = { TELEFONO_INVALIDO: 'El teléfono no es válido.', LOGO_URL_INVALIDA: 'No se pudo guardar el logo.', SIN_CAMBIOS: 'No hay cambios para guardar.',
  CONFIGURACION_MODIFICADA: 'La configuración cambió mientras tanto. Recargá y volvé a intentar.', OPERACION_ID_REUTILIZADO: 'Esa operación ya se había usado con otros datos. Volvé a intentarlo.',
  CONFIGURACION_ACTUALIZADA: 'Configuración guardada.', OPERACION_YA_PROCESADA: 'La operación ya estaba registrada. No se duplicó.' };
const avisoR = (r) => el('div', { class: 'notice ' + (r.success ? 'ok' : 'error'), role: r.success ? 'status' : 'alert', 'data-codigo': r.codigo }, MSJ[r.codigo] || r.mensaje || '', el('span', { class: 'code', text: r.codigo }));
const fmtHora = (iso) => { const t = Date.parse(iso || ''); return isNaN(t) ? '—' : new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date(t)); };

export function vistaConfiguracion(ctx, cont) {
  const avisos = el('div', { class: 'stack', id: 'cfg-aviso' });
  const cuerpo = el('div', { class: 'stack', id: 'cfg', 'data-estado': 'cargando' });
  montar(cont, el('div', { class: 'card stack section-card' }, el('div', { class: 'card-head' }, el('div', null, el('h2', { class: 'section-title', text: 'Configuración' }),
    el('p', { class: 'card-sub', text: 'Datos generales de Golden. Cada cambio queda en el historial.' })))), avisos, cuerpo,
    el('div', { class: 'card stack', id: 'cfg-admin-finanzas' },
      el('div', { class: 'card-head' }, el('div', null, el('h3', { class: 'h-ico h-ico-roles', text: 'Admin Finanzas' }),
        el('p', { class: 'muted small', text: 'Crear una persona con rol Admin Finanzas o asignar el rol a una persona existente (mantiene su mismo código de acceso).' })),
        el('span', { class: 'spacer' }), el('a', { class: 'btn btn-ghost btn-sm', id: 'btn-gestionar-af', href: '#/admin/configuracion/admin-finanzas' }, 'Gestionar Admin Finanzas'))));
  async function cargar() {
    cuerpo.dataset.estado = 'cargando';
    montar(cuerpo, el('div', { class: 'skeleton' }));
    const res = await ctx.pedir(TIPO, 'ver_configuracion', {});
    if (!cuerpo.isConnected) return;
    cuerpo.dataset.estado = 'listo';
    if (res.falla) return montar(cuerpo, avisoFalla(res.falla, cargar));
    if (ctx.revisarFinSesion(res.r)) return;
    if (!res.r.success) return montar(cuerpo, avisoR(res.r));
    const c = (res.r.datos && res.r.datos.configuracion) || {};
    const b = el('button', { type: 'button', class: 'btn btn-gold btn-sm', id: 'btn-editar-config', onclick: () => editar(c) }, 'Editar datos');
    const logoCaja = el('div', { class: 'img-caja', id: 'cfg-logo-ver' });
    mostrarImagen(ctx, c.logo_url || null, logoCaja, 'Logo');
    montar(cuerpo, el('div', { class: 'card stack', id: 'cfg-datos' },
      el('div', { class: 'card-head' }, el('h3', { class: 'h-ico h-ico-estado', text: 'Datos generales' }), el('span', { class: 'spacer' }), b),
      res.r.datos.configurada === false ? aviso('info', 'Todavía no se cargaron los datos generales.') : null,
      el('dl', { class: 'dl' }, CAMPOS.map(([k, t]) => el('div', { class: 'dl-item', 'data-ico': k === 'telefono' ? 'phone' : k === 'direccion' ? 'pin' : 'tag', 'data-campo': k },
        el('dt', { text: t }), el('dd', { text: c[k] || 'Sin cargar' }))),
        el('div', { class: 'dl-item', 'data-ico': 'img', 'data-campo': 'logo_url' }, el('dt', { text: 'Logo' }), el('dd', null, logoCaja))),
      c.actualizado_en ? el('p', { class: 'muted small', text: 'Última actualización: ' + fmtHora(c.actualizado_en) }) : null));
  }
  function editar(c) {
    const inputs = CAMPOS.map(([k, t, max]) => ({ k, i: el('input', { class: 'input', id: 'cfg-' + k, maxlength: String(max), value: c[k] || '', inputmode: k === 'telefono' ? 'tel' : k === 'logo_url' ? 'url' : null }), t }));
    const zona = el('div', { class: 'stack', id: 'cfg-form-aviso' });
    const logo = selectorImagen(ctx, { id: 'cfg-logo', actual: c.logo_url || null, destino: 'logo', etiqueta: 'Logo' });
    const b = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-guardar-config' }, 'Guardar');
    const form = el('form', { class: 'stack', novalidate: true, autocomplete: 'off' },
      el('div', { class: 'form-grid two' }, inputs.map(x => el('div', { class: 'field' }, el('label', { for: 'cfg-' + x.k, text: x.t }), x.i))),
      el('div', { class: 'field' }, el('span', { class: 'field-label', text: 'Logo' }), logo.nodo),
      el('p', { class: 'muted small', text: 'Dejá un campo vacío para borrarlo. El teléfono se guarda en formato internacional.' }), b, zona);
    const m = modal('Editar datos generales', form);
    async function enviar(campos) {
      const res = await ops.ejecutar(ctx.base(TIPO), 'actualizar_configuracion', campos);
      if (res.sinConfirmar) return montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => enviar(campos), () => { ops.descartar('actualizar_configuracion', campos); montar(zona); }));
      if (ctx.revisarFinSesion(res.r)) return m.cerrar();
      if (res.r.success) { m.cerrar(); montar(avisos, avisoR(res.r)); toast(MSJ[res.r.codigo] || 'Listo.'); return cargar(); }
      montar(zona, avisoR(res.r));
    }
    form.addEventListener('submit', conBloqueo(b, async () => {
      montar(zona);
      const datos = {};
      for (const x of inputs) { const v = x.i.value.trim(); const nuevo = v === '' ? null : v; if (nuevo !== (c[x.k] || null)) datos[x.k] = nuevo; }
      const img = await logo.resolver();
      if (img.error) return montar(zona, aviso('error', img.error));
      if ((img.url || null) !== (c.logo_url || null)) datos.logo_url = img.url;
      if (!Object.keys(datos).length) return montar(zona, aviso('info', 'No hay cambios para guardar.'));
      await enviar({ datos });
    }, 'Guardando…'));
  }
  cargar();
}
