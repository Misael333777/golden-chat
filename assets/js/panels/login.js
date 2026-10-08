// Inicio público de Golden: "Ingresar" (código GLD, lógica de ingreso SIN cambios) | "Registrarme" (solicitud de alta, tipo 'registro').
// Diseño de la maqueta aprobada: foto a la izquierda con el título, tarjeta de ingreso a la derecha (una sola tarjeta con dos estados). No muestra distintivo de entorno.
// El registro solo manda nombre y teléfono; la Web API valida, normaliza, limita envíos y nunca devuelve datos internos.
// Reintentar es seguro: el backend reconoce la misma solicitud por teléfono y no la duplica.
import { llamar, TEXTO_FALLA } from '../api.js';
import { el, montar, aviso, avisoBackend, conBloqueo } from '../ui.js';

const MSJ_REGISTRO_OK = '¡Gracias! Estamos revisando tu solicitud.';

export function vistaLogin(ctx, avisoPrevio) {
  document.body.classList.add('es-inicio', 'cg-activo');

  // --- Ingresar (misma lógica que antes) ---
  const input = el('input', { class: 'input', id: 'gld', name: 'codigo', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false',
    inputmode: 'text', maxlength: '20', placeholder: 'GLD-XXXX-XXXX', 'aria-label': 'Código GLD' });
  const zona = el('div', { class: 'stack', id: 'login-aviso' });
  const boton = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-ingresar' }, 'Ingresar');
  const form = el('form', { class: 'stack ini-form', id: 'form-ingresar', autocomplete: 'off', novalidate: true },
    avisoPrevio && avisoPrevio.codigo !== 'LOGOUT' ? aviso('error', avisoPrevio.mensaje || 'La sesión terminó.', avisoPrevio.codigo) : null,
    avisoPrevio && avisoPrevio.codigo === 'LOGOUT' ? aviso('info', 'Sesión cerrada.') : null,
    el('div', { class: 'field' }, el('label', { for: 'gld', text: 'Código GLD' }), input),
    boton, zona);

  form.addEventListener('submit', conBloqueo(boton, async () => {
    montar(zona);
    const codigo = input.value.trim();
    if (!codigo) { montar(zona, aviso('error', 'Ingresá tu código de acceso.')); input.focus(); return; }
    const res = await llamar({ tipo: 'login', codigo_acceso: codigo });
    if (res.falla) { montar(zona, aviso('error', TEXTO_FALLA[res.falla] + ' Reintentá.', 'FALLA_' + res.falla)); return; }
    const r = res.r;
    if (r.success && r.codigo === 'LOGIN_OK' && r.datos && typeof r.datos.token === 'string') {
      const tok = r.datos.token;
      input.value = '';
      await ctx.entrar(tok, r.datos);
      return;
    }
    if (r.success) { montar(zona, aviso('error', 'Respuesta de ingreso incompleta. Reintentá.', r.codigo)); return; }
    montar(zona, avisoBackend(r));
  }, 'Ingresando…'));

  // --- Registrarme (solicitud de alta; la aprueba Admin Finanzas) ---
  const nombre = el('input', { class: 'input', id: 'reg-nombre', name: 'nombre', autocomplete: 'name', maxlength: '80', placeholder: 'Tu nombre' });
  const telefono = el('input', { class: 'input', id: 'reg-telefono', name: 'telefono', type: 'tel', autocomplete: 'tel', inputmode: 'tel', maxlength: '30', placeholder: 'Tu número de teléfono' });
  const zonaReg = el('div', { class: 'stack', id: 'registro-aviso' });
  const botonReg = el('button', { type: 'submit', class: 'btn btn-primary', id: 'btn-registro' }, 'Enviar solicitud');
  const formReg = el('form', { class: 'stack ini-form', id: 'form-registro', autocomplete: 'off', novalidate: true, hidden: true },
    el('div', { class: 'field' }, el('label', { for: 'reg-nombre', text: 'Nombre' }), nombre),
    el('div', { class: 'field' }, el('label', { for: 'reg-telefono', text: 'Teléfono' }), telefono),
    botonReg, zonaReg);

  formReg.addEventListener('submit', conBloqueo(botonReg, async () => {
    montar(zonaReg);
    const n = nombre.value.trim(), t = telefono.value.trim();
    if (!n) { montar(zonaReg, aviso('error', 'Ingresá tu nombre.')); nombre.focus(); return; }
    if (!t) { montar(zonaReg, aviso('error', 'Ingresá tu número de teléfono.')); telefono.focus(); return; }
    const res = await llamar({ tipo: 'registro', nombre: n, telefono: t });
    // Sin respuesta: no sabemos si llegó. Reintentar no duplica (el backend reconoce el teléfono).
    if (res.falla) { montar(zonaReg, aviso('error', TEXTO_FALLA[res.falla] + ' Reintentá: si ya había llegado, no se duplica.', 'FALLA_' + res.falla)); return; }
    const r = res.r;
    if (r.success && r.codigo === 'SOLICITUD_RECIBIDA') {
      nombre.value = ''; telefono.value = '';
      montar(formReg, el('div', { class: 'notice ok', role: 'status', id: 'registro-ok', 'data-codigo': 'SOLICITUD_RECIBIDA', text: MSJ_REGISTRO_OK }));
      return;
    }
    montar(zonaReg, avisoBackend(r));
  }, 'Enviando…'));

  // --- Tarjeta: dos estados de la MISMA tarjeta ---
  const tab = (id, txt) => el('button', { type: 'button', class: 'ini-tab', id: 'tab-' + id, role: 'tab', 'data-tab': id }, txt);
  const tIng = tab('ingresar', 'Ingresar'), tReg = tab('registro', 'Registrarme');
  const elegir = (cual, foco) => {
    const ing = cual === 'ingresar';
    tIng.setAttribute('aria-selected', String(ing)); tReg.setAttribute('aria-selected', String(!ing));
    tIng.classList.toggle('activo', ing); tReg.classList.toggle('activo', !ing);
    form.hidden = !ing; formReg.hidden = ing;
    card.dataset.estado = cual;
    if (foco) (ing ? input : (formReg.querySelector('input') || botonReg)).focus();
  };
  tIng.addEventListener('click', () => elegir('ingresar', true));
  tReg.addEventListener('click', () => elegir('registro', true));

  const card = el('div', { class: 'ini-card cgi-card', id: 'ini-card' },
    el('img', { class: 'ini-logo', src: 'assets/img/logo.png', alt: 'Golden' }),
    el('div', { class: 'cgi-card-head' }, el('span', { class: 'cg-eyebrow', text: 'Tu cuenta Golden' }), el('h2', { text: 'Entrá a tu panel' }),
      el('p', { text: 'Ingresá con tu código GLD. Si todavía no tenés uno, pedí tu alta.' })),
    el('div', { class: 'ini-tabs', role: 'tablist', 'aria-label': 'Ingresar o registrarme' }, tIng, tReg),
    el('span', { class: 'ini-sep', 'aria-hidden': 'true' }),
    form, formReg);

  const izquierda = el('div', { class: 'ini-hero cgi-hero' },
    el('img', { class: 'cgi-foto', src: 'assets/img/inicio-flautas.jpg', alt: '' }),
    el('div', { class: 'cgi-hero-txt' },
      el('img', { class: 'cgi-hero-logo', src: 'assets/img/logo-claro.png', alt: '' }),
      el('span', { class: 'cg-eyebrow', text: 'Panadería en buenas manos' }),
      el('h1', { class: 'ini-title' }, el('span', { class: 'ini-title-a', text: 'Bienvenido a' }), el('span', { class: 'ini-title-b', text: 'Golden' })),
      el('span', { class: 'ini-line', 'aria-hidden': 'true' }),
      el('p', { class: 'ini-sub', text: 'Tu panificadora de confianza.' })),
    el('div', { class: 'cgi-sello', 'aria-hidden': 'true' }, el('strong', { text: 'Lo de cada día' }), el('span', { text: 'Hecho con dedicación' })));

  montar(ctx.app, el('div', { class: 'ini cgi', id: 'inicio' }, el('div', { class: 'ini-grid cgi-grid' }, izquierda,
    el('div', { class: 'cgi-lado' }, card, el('p', { class: 'cgi-pie', text: 'Golden. Panadería en buenas manos.' })))));
  elegir('ingresar', false);
  input.focus();
}
