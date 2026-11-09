/**
 * AGUA MAGALY — SEGUIMIENTO DEL PEDIDO (página pública)
 * El cliente consulta con código + celular. La base de datos solo devuelve
 * estado, productos, total y nombre del repartidor (función track_order).
 */
(function () {
  'use strict';

  const store = window.MagalyStore;
  const MY_ORDERS_KEY = 'magaly_my_orders';
  const REFRESH_MS = 30000;

  const form = document.getElementById('track-form');
  const codeInput = document.getElementById('track-code');
  const phoneInput = document.getElementById('track-phone');
  const errorBox = document.getElementById('track-error');
  const result = document.getElementById('track-result');
  const myBox = document.getElementById('my-orders');
  const myList = document.getElementById('my-orders-list');
  const myClear = document.getElementById('my-orders-clear');

  let timer = null;

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(n) { return '$' + Number(n || 0).toLocaleString('es-CO'); }

  function when(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function readMine() {
    try { return JSON.parse(localStorage.getItem(MY_ORDERS_KEY) || '[]') || []; } catch (err) { return []; }
  }

  function renderMine() {
    const mine = readMine();
    if (!mine.length) { myBox.hidden = true; return; }
    myBox.hidden = false;
    myList.innerHTML = mine.map((o, i) =>
      '<li><button type="button" class="my-order" data-i="' + i + '">' +
        '<strong>' + esc(o.code) + '</strong>' +
        '<span>' + esc(o.items || '') + '</span>' +
        '<small>' + esc(when(o.createdAt)) + ' · ' + money(o.total) + '</small>' +
      '</button></li>'
    ).join('');
    myList.querySelectorAll('.my-order').forEach(btn => {
      btn.addEventListener('click', () => {
        const o = mine[Number(btn.dataset.i)];
        codeInput.value = o.code;
        phoneInput.value = String(o.phone || '').replace(/\D/g, '').slice(-10);
        lookup();
      });
    });
  }

  // Pasos del pedido y en cuál va.
  function stepsFor(data) {
    const events = Array.isArray(data.events) ? data.events : [];
    const at = type => {
      const ev = events.filter(e => e.type === type).pop();
      return ev ? ev.at : '';
    };
    const status = data.status || 'Pendiente';
    const assigned = !!data.driver || !!at('asignado');
    let current = 0;
    if (status === 'Pendiente') current = assigned ? 1 : 0;
    if (status === 'En ruta') current = 2;
    if (status === 'Entregado') current = 3;
    return {
      current: current,
      cancelled: status === 'Cancelado',
      retry: status === 'Pendiente' && events.length && events[events.length - 1].type === 'no_entregado',
      list: [
        { label: 'Recibido', hint: 'Tenemos tu pedido', at: data.createdAt || at('creado') },
        { label: 'Asignado', hint: data.driver ? 'Lo lleva ' + data.driver : 'Le asignamos repartidor', at: at('asignado') },
        { label: 'En camino', hint: 'Va hacia tu dirección', at: at('en_ruta') },
        { label: 'Entregado', hint: '¡Que lo disfrutes!', at: at('entregado') }
      ]
    };
  }

  function render(data) {
    const s = stepsFor(data);
    let banner = '';
    if (s.cancelled) banner = '<div class="track-banner is-bad">Este pedido fue cancelado. Si crees que es un error, escríbenos por WhatsApp.</div>';
    else if (s.retry) banner = '<div class="track-banner is-warn">Intentamos entregarlo y no fue posible. Te contactaremos para coordinar de nuevo.</div>';
    else if (s.current === 3) banner = '<div class="track-banner is-ok">¡Pedido entregado! Gracias por comprar en Agua Magaly.</div>';

    result.innerHTML =
      '<div class="track-head"><div><span class="track-code">' + esc(data.code) + '</span>' +
      '<strong>' + esc(data.status) + '</strong></div><span class="track-total">' + money(data.total) + '</span></div>' +
      banner +
      (s.cancelled ? '' : '<ol class="track-steps">' + s.list.map((st, i) =>
        '<li class="' + (i < s.current ? 'is-done' : i === s.current ? 'is-now' : '') + '">' +
          '<span class="dot" aria-hidden="true"></span>' +
          '<div><b>' + esc(st.label) + '</b><small>' + esc(i <= s.current ? (when(st.at) || st.hint) : st.hint) + '</small></div>' +
        '</li>').join('') + '</ol>') +
      '<p class="track-items">📦 ' + esc(data.items || '') + '</p>' +
      '<p class="track-updated">Actualizado ' + esc(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })) +
        (s.current < 3 && !s.cancelled ? ' · se actualiza solo cada 30 segundos' : '') + '</p>';
    result.hidden = false;

    clearInterval(timer);
    if (s.current < 3 && !s.cancelled) timer = setInterval(() => lookup(true), REFRESH_MS);
  }

  function showError(text) {
    errorBox.textContent = text;
    errorBox.hidden = false;
    result.hidden = true;
    clearInterval(timer);
  }

  async function lookup(silent) {
    const code = codeInput.value.trim().toUpperCase();
    const phone = phoneInput.value.replace(/\D/g, '');
    errorBox.hidden = true;
    if (code.length < 6) return showError('Escribe el código completo del pedido (empieza por AM-).');
    if (!/^3\d{9}$/.test(phone)) return showError('Escribe el celular de 10 dígitos con el que hiciste el pedido.');

    const btn = form.querySelector('button[type="submit"]');
    if (!silent) { btn.disabled = true; btn.textContent = 'Consultando…'; }
    try {
      const data = await store.trackOrder(code, phone);
      if (!data) showError('No encontramos un pedido con ese código y ese celular. Revisa los datos e intenta de nuevo.');
      else render(data);
    } catch (err) {
      console.warn('[seguimiento]', err);
      if (!silent) showError('No pudimos consultar en este momento. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      if (!silent) { btn.disabled = false; btn.textContent = 'Consultar →'; }
    }
  }

  phoneInput.addEventListener('input', () => { phoneInput.value = phoneInput.value.replace(/\D/g, '').slice(0, 10); });
  codeInput.addEventListener('input', () => { codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); });
  form.addEventListener('submit', e => { e.preventDefault(); lookup(); });
  myClear.addEventListener('click', () => {
    try { localStorage.removeItem(MY_ORDERS_KEY); } catch (err) { /* ignora */ }
    renderMine();
  });

  // Código desde el enlace del mensaje: seguimiento.html?codigo=AM-XXXXXX
  const params = new URLSearchParams(window.location.search);
  const fromLink = (params.get('codigo') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (fromLink) {
    codeInput.value = fromLink;
    const mine = readMine().find(o => o.code === fromLink);
    if (mine && mine.phone) {
      phoneInput.value = String(mine.phone).replace(/\D/g, '').slice(-10);
      lookup();
    } else {
      phoneInput.focus();
    }
  }
  renderMine();
})();
