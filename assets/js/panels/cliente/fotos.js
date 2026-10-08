// Fotos de productos para Cliente/Repartidor. Solo se piden para productos que el catálogo marca con tiene_imagen.
// El navegador envía ÚNICAMENTE producto_id (usuario/imagen_producto): qué archivo corresponde, y si la persona puede verlo,
// lo decide el backend con la sesión. Nunca se manda ni se recibe un enlace o id de Drive.
// Caché en memoria mientras la página está abierta (por sesión). Si una foto falla, queda el placeholder; nada bloquea el catálogo.
const MIME = ['image/png', 'image/jpeg', 'image/webp'];
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_B64 = 2900000; // ~2 MB de imagen (mismo tope que el backend)
const MAX_PARALELO = 3;
const cache = new Map(); // `${token}:${producto_id}` -> Promise<string|null>
let activos = 0; const cola = [];

function enTurno(tarea) {
  return new Promise((resolver) => {
    const correr = () => {
      activos++;
      Promise.resolve().then(tarea).then(resolver, () => resolver(null)).finally(() => { activos--; const sig = cola.shift(); if (sig) sig(); });
    };
    if (activos < MAX_PARALELO) correr(); else cola.push(correr);
  });
}

// Devuelve una promesa con 'data:image/...;base64,...' o null (sin foto / no disponible / error).
export function cargarFoto(ctx, producto_id) {
  if (!Number.isInteger(producto_id) || producto_id <= 0) return Promise.resolve(null);
  const clave = String((ctx.base && ctx.base('usuario').token) || '') + ':' + producto_id;
  if (cache.has(clave)) return cache.get(clave);
  const p = enTurno(async () => {
    const res = await ctx.pedir('usuario', 'imagen_producto', { producto_id });
    if (!res || res.falla) { cache.delete(clave); return null; } // problema de red: se puede reintentar al volver a pintar
    const d = res.r && res.r.success === true ? res.r.datos : null;
    if (!d || d.producto_id !== producto_id || !MIME.includes(d.mime_type) || typeof d.imagen_base64 !== 'string'
      || d.imagen_base64.length === 0 || d.imagen_base64.length > MAX_B64 || !B64.test(d.imagen_base64)) return null;
    return 'data:' + d.mime_type + ';base64,' + d.imagen_base64;
  });
  cache.set(clave, p);
  return p;
}

// Ejecuta alVer() cuando el nodo entra en pantalla (o enseguida si el navegador no soporta IntersectionObserver).
let io = null; const pendientes = new WeakMap();
export function alAparecer(nodo, alVer) {
  if (typeof IntersectionObserver !== 'function') { alVer(); return; }
  if (!io) io = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const f = pendientes.get(e.target); pendientes.delete(e.target);
      if (f) f();
    }
  }, { rootMargin: '200px 0px' });
  pendientes.set(nodo, alVer);
  io.observe(nodo);
}
