// Admin General → Inicio: "Cierre de pedidos de hoy" (22/10/2026).
// Normal: los pedidos para mañana se aceptan hasta las 22:00 y la planilla se arma 22:01.
// Si se extiende, esa noche se aceptan hasta las 22:15 y la planilla se arma 22:16. Al día siguiente vuelve sola a 22:00.
// Se guarda con la acción existente actualizar_configuracion (datos.cierre_extendido true/false). Solo se puede cambiar antes de las 22:00.
import * as ops from '../../ops.js';
import { el, montar, aviso, confirmar, conBloqueo, toast } from '../../ui.js';
import { avisoSinConfirmar } from './personas.js';

const TIPO = 'admin_general';
const MSJ = { CIERRE_YA_EN_CURSO: 'El cierre de hoy solo se puede cambiar antes de las 22:00.', SIN_CAMBIOS: 'Ya estaba así.',
  OPERACION_YA_PROCESADA: 'La operación ya estaba registrada. No se duplicó.' };
const minutosART = () => { const p = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' }).formatToParts(new Date());
  const v = (t) => Number((p.find(x => x.type === t) || {}).value); return v('hour') * 60 + v('minute'); };

export function tarjetaCierre(ctx) {
  const caja = el('div', { class: 'card stack', id: 'cierre-hoy', 'data-estado': 'cargando' });
  const zona = el('div', { class: 'stack', id: 'cierre-aviso' });
  async function cargar() {
    caja.dataset.estado = 'cargando';
    const res = await ctx.pedir(TIPO, 'ver_configuracion', {});
    if (!caja.isConnected) return;
    if (res.falla || !res.r || !res.r.success) { caja.dataset.estado = 'error'; return montar(caja); } // no molesta en el inicio si falla
    if (ctx.revisarFinSesion(res.r)) return;
    pintar((res.r.datos && res.r.datos.configuracion) || {});
  }
  function pintar(c) {
    const ext = c.cierre_extendido_hoy === true;
    const pasado = minutosART() >= 22 * 60;
    caja.dataset.estado = 'listo';
    caja.dataset.extendido = ext ? 'si' : 'no';
    const b = pasado ? null : el('button', { type: 'button', class: ext ? 'btn btn-ghost btn-sm' : 'btn btn-gold btn-sm', id: ext ? 'btn-cierre-volver' : 'btn-cierre-extender' },
      ext ? 'Volver a las 22:00' : 'Extender hasta las 22:15');
    if (b) {
      const correr = conBloqueo(b, () => enviar(!ext), 'Guardando…');
      b.addEventListener('click', async () => {
        const ok = ext
          ? await confirmar('Volver a las 22:00', 'Los pedidos para mañana se cierran a las 22:00 y la planilla se arma a las 22:01.', 'Volver a las 22:00')
          : await confirmar('Extender el cierre de hoy', 'Solo por hoy: los pedidos para mañana se aceptan hasta las 22:15 y la planilla se arma a las 22:16. Mañana vuelve solo a las 22:00.', 'Extender hasta las 22:15');
        if (ok) await correr();
      });
    }
    montar(caja,
      el('div', { class: 'card-head' },
        el('div', null, el('h3', { class: 'h-ico h-ico-estado', text: 'Cierre de pedidos de hoy: ' + (ext ? '22:15' : '22:00') }),
          el('p', { class: 'muted small', text: ext
            ? 'Extendido solo por hoy. La planilla se arma a las 22:16. Mañana vuelve a las 22:00.'
            : (pasado ? 'La planilla de hoy ya se está armando.' : 'Si hoy la producción viene demorada, podés extender el cierre hasta las 22:15.') })),
        el('span', { class: 'spacer' }), b),
      zona);
  }
  async function enviar(valor) {
    const campos = { datos: { cierre_extendido: valor } };
    const res = await ops.ejecutar(ctx.base(TIPO), 'actualizar_configuracion', campos);
    if (res.sinConfirmar) return montar(zona, avisoSinConfirmar(res.falla, res.operacion_id, () => enviar(valor), () => { ops.descartar('actualizar_configuracion', campos); montar(zona); }));
    if (ctx.revisarFinSesion(res.r)) return;
    if (res.r.success) {
      toast(valor ? 'Cierre de hoy extendido hasta las 22:15.' : 'Cierre de hoy: 22:00.');
      const c = res.r.datos && res.r.datos.configuracion;
      return c ? pintar(c) : cargar();
    }
    montar(zona, aviso('error', MSJ[res.r.codigo] || res.r.mensaje || 'No se pudo guardar.', res.r.codigo));
  }
  cargar();
  return caja;
}
