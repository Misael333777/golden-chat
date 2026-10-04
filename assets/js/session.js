// Sesión local. El token vive SOLO en sessionStorage (se borra al cerrar la pestaña). Nunca en localStorage, URL, DOM ni consola.
// Persona, roles y paneles quedan en memoria y se reconstruyen con tipo:"sesion" al abrir la página.
// persona_id NO se envía nunca: la identidad la decide la Web API a partir del token.
const K_TOKEN = 'golden_token';
const K_PANEL = 'golden_panel';

const estado = { token: null, persona_id: null, nombre: null, roles: [], paneles: [], expira: null, panel: null };
let timerExpira = null;
let alExpirar = null;

const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* sin almacenamiento: la sesión vive solo en memoria */ } },
  del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* nada */ } },
};

export function tokenGuardado() { return estado.token || ss.get(K_TOKEN); }
export function token() { return estado.token; }
export function datos() { return { persona_id: estado.persona_id, nombre: estado.nombre, roles: [...estado.roles], paneles: [...estado.paneles], panel: estado.panel, expira: estado.expira }; }
export function onExpira(fn) { alExpirar = fn; }

// d = datos de LOGIN_OK o SESION_OK (sobre de Web API).
export function iniciar(tok, d) {
  estado.token = tok;
  ss.set(K_TOKEN, tok);
  actualizar(d);
}
export function actualizar(d) {
  estado.persona_id = d && d.persona && typeof d.persona.persona_id === 'string' ? d.persona.persona_id : null; // solo en memoria, nunca se envía
  estado.nombre = d && d.persona && typeof d.persona.nombre === 'string' ? d.persona.nombre : '';
  estado.roles = Array.isArray(d && d.roles) ? d.roles.filter(x => typeof x === 'string') : [];
  estado.paneles = Array.isArray(d && d.paneles) ? d.paneles.filter(x => typeof x === 'string') : [];
  estado.expira = d && d.sesion && typeof d.sesion.fecha_expiracion === 'string' ? d.sesion.fecha_expiracion : null;
  const p = ss.get(K_PANEL);
  estado.panel = p && estado.paneles.includes(p) ? p : null;
  programarExpiracion();
}
export function elegirPanel(p) {
  if (!estado.paneles.includes(p)) return false;
  estado.panel = p; ss.set(K_PANEL, p); return true;
}
export function soltarPanel() { estado.panel = null; ss.del(K_PANEL); }
export function cerrarLocal() {
  estado.token = null; estado.persona_id = null; estado.nombre = null; estado.roles = []; estado.paneles = []; estado.expira = null; estado.panel = null;
  ss.del(K_TOKEN); ss.del(K_PANEL);
  if (timerExpira) { clearTimeout(timerExpira); timerExpira = null; }
}
function programarExpiracion() {
  if (timerExpira) { clearTimeout(timerExpira); timerExpira = null; }
  const t = estado.expira ? Date.parse(estado.expira) : NaN;
  if (!Number.isFinite(t)) return;
  const falta = t - Date.now();
  if (falta <= 0) { if (alExpirar) alExpirar(); return; }
  timerExpira = setTimeout(() => { if (alExpirar) alExpirar(); }, Math.min(falta, 2 ** 31 - 1));
}
