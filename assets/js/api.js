// Cliente único de Web API PROD. Solo transporte: POST JSON y lectura del sobre {success, codigo, mensaje, datos}.
// No interpreta reglas de negocio. Nunca registra tokens ni respuestas en consola.
import { GATEWAY_URL, TIMEOUT_MS } from './config.js';

// Resultado:
//   { r: {success, codigo, mensaje, datos} }        respuesta válida del backend (éxito o rechazo)
//   { falla: 'RED' | 'TIMEOUT' | 'VACIA' | 'INVALIDA' }  no hay respuesta interpretable
export async function llamar(body, opciones = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opciones.timeoutMs || TIMEOUT_MS);
  let res;
  try {
    res = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
  } catch (e) {
    clearTimeout(timer);
    return { falla: e && e.name === 'AbortError' ? 'TIMEOUT' : 'RED' };
  }
  let texto;
  try { texto = await res.text(); } catch (e) { clearTimeout(timer); return { falla: e && e.name === 'AbortError' ? 'TIMEOUT' : 'RED' }; }
  clearTimeout(timer);
  if (typeof texto !== 'string' || texto.trim() === '') return { falla: 'VACIA' };
  let j;
  try { j = JSON.parse(texto); } catch (e) { return { falla: 'INVALIDA' }; }
  if (!j || typeof j !== 'object' || Array.isArray(j) || typeof j.success !== 'boolean' || typeof j.codigo !== 'string') return { falla: 'INVALIDA' };
  return { r: { success: j.success, codigo: j.codigo, mensaje: typeof j.mensaje === 'string' ? j.mensaje : '', datos: j.datos === undefined ? null : j.datos } };
}

// Textos para fallas de transporte (no son respuestas del backend).
export const TEXTO_FALLA = {
  RED: 'No pudimos conectar con Golden. Revisá la conexión y reintentá.',
  TIMEOUT: 'La respuesta tardó demasiado.',
  VACIA: 'El servidor respondió vacío.',
  INVALIDA: 'El servidor respondió algo que no se pudo interpretar.',
  EN_CURSO: 'Hay otra operación financiera en curso; no se registró nada todavía.',
};

// Códigos que invalidan la sesión local (la Web API ya no acepta el token).
export const CODIGOS_FIN_SESION = ['SESION_INVALIDA', 'SESION_EXPIRADA', 'SESION_REVOCADA', 'ACCESO_NO_HABILITADO'];
