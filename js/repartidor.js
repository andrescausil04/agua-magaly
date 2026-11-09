/**
 * AGUA MAGALY — PANEL DEL REPARTIDOR (móvil primero)
 * Solo muestra los pedidos asignados al repartidor autenticado y registra el
 * seguimiento: salida a ruta, entrega, cobro y motivo de no entrega.
 */

(function () {
  'use strict';

  const store = window.MagalyStore;
  const ui = window.MagalyUI;
  const U = store.utils;
  const STATUS = store.ORDER_STATUS;

  const GEO_CONSENT_KEY = 'magaly_geo_consent';

  const state = {
    driver: null,
    orders: [],
    view: 'pedidos',
    range: 'activos',
    seenReady: false,   // en la primera carga no avisamos de lo que ya existía
    seen: new Set(),    // pedidos que el repartidor ya conoce
    offline: false
  };

  // --------------------------------------------------------------------------
  // Sin señal: copia local de los pedidos y cola de cambios por enviar
  // --------------------------------------------------------------------------
  function cacheKey() { return 'magaly_driver_cache_' + state.driver.id; }
  function outboxKey() { return 'magaly_outbox_' + state.driver.id; }

  function readLocal(key, fallback) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (err) { return fallback; }
  }
  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* sin espacio */ }
  }

  function isNetworkError(err) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    return /failed to fetch|network|load failed|fetch|timeout|offline/i.test(String((err && err.message) || err || ''));
  }

  function outbox() { return readLocal(outboxKey(), []); }

  function queueChange(order) {
    const list = outbox().filter(item => item.id !== order.id);
    list.push({ id: order.id, record: order, at: Date.now() });
    writeLocal(outboxKey(), list);
  }

  // Guarda el cambio; si no hay señal, lo deja en cola y lo envía después.
  async function saveOrder(order) {
    try {
      await store.update('orders', order.id, order);
      return 'ok';
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      queueChange(order);
      state.orders = state.orders.map(o => (o.id === order.id ? order : o));
      state.offline = true;
      render();
      return 'queued';
    }
  }

  let flushing = false;
  async function flushOutbox() {
    if (flushing) return;
    const list = outbox();
    if (!list.length) return;
    flushing = true;
    const remaining = [];
    let sent = 0;
    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      try {
        await store.update('orders', item.id, item.record);
        sent++;
      } catch (err) {
        if (isNetworkError(err)) { remaining.push.apply(remaining, list.slice(i)); break; }
        ui.toast('No se pudo enviar el cambio del pedido ' + (item.record.code || item.id) + ': ' + (err.message || err), 'error');
      }
    }
    writeLocal(outboxKey(), remaining);
    flushing = false;
    if (sent) ui.toast('Se enviaron ' + sent + ' cambio(s) guardado(s) sin señal', 'success');
    renderOffline();
  }

  function renderOffline() {
    const banner = document.getElementById('offline-banner');
    if (!banner) return;
    const pending = outbox().length;
    if (!state.offline && !pending) { banner.hidden = true; return; }
    banner.hidden = false;
    banner.textContent = state.offline
      ? '📵 Sin conexión. Estás viendo la última copia de tus pedidos' + (pending ? ' · ' + pending + ' cambio(s) por enviar' : '') + '.'
      : '⏳ Enviando ' + pending + ' cambio(s) guardado(s) sin señal…';
  }

  // --------------------------------------------------------------------------
  // App instalable (PWA)
  // --------------------------------------------------------------------------
  let installEvent = null;

  function setupInstall() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => console.warn('[pwa] sin service worker', err));
    }
    const card = document.getElementById('install-card');
    const btn = document.getElementById('install-btn');
    const hint = document.getElementById('install-hint');
    if (!card || !btn || !hint) return;
    const standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone;
    if (standalone) return;
    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (ios) {
      card.hidden = false;
      hint.textContent = 'En iPhone: abre esta página en Safari, toca el botón Compartir y elige "Agregar a inicio".';
    }
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      installEvent = e;
      card.hidden = false;
      btn.hidden = false;
      hint.textContent = 'Queda como una app en tu pantalla de inicio y abre más rápido.';
    });
    btn.addEventListener('click', async () => {
      if (!installEvent) return;
      installEvent.prompt();
      try { await installEvent.userChoice; } catch (err) { /* ignora */ }
      installEvent = null;
      btn.hidden = true;
    });
    window.addEventListener('appinstalled', () => { card.hidden = true; ui.toast('App instalada', 'success'); });
  }

  // --------------------------------------------------------------------------
  // Consentimiento de ubicación
  // --------------------------------------------------------------------------
  function geoConsent() {
    try { return localStorage.getItem(GEO_CONSENT_KEY) || ''; } catch (err) { return ''; }
  }

  function setGeoConsent(value) {
    try { localStorage.setItem(GEO_CONSENT_KEY, value); } catch (err) { /* ignora */ }
  }

  function renderGeoConsent() {
    const status = document.getElementById('geo-consent-status');
    const btn = document.getElementById('geo-consent-btn');
    if (!status || !btn) return;
    const value = geoConsent();
    if (value === 'yes') {
      status.textContent = '✅ Autorizaste compartir tu ubicación al iniciar y confirmar entregas. Puedes retirarla cuando quieras.';
      btn.textContent = 'Retirar permiso';
    } else if (value === 'no') {
      status.textContent = 'No autorizaste la ubicación. Puedes entregar igual; el pedido se registra sin coordenadas.';
      btn.textContent = 'Permitir ubicación';
    } else {
      status.textContent = 'Aún no has decidido. La ubicación es opcional y solo se usa durante las entregas.';
      btn.textContent = 'Permitir ubicación';
    }
  }

  async function askGeoConsent() {
    const value = geoConsent();
    if (value === 'yes') {
      const remove = await ui.confirmDialog({
        title: 'Retirar permiso de ubicación',
        message: 'Si retiras el permiso, las próximas entregas se registrarán sin coordenadas. ¿Deseas continuar?',
        confirmText: 'Sí, retirar',
        cancelText: 'Cancelar',
        danger: true
      });
      if (!remove) return false;
      setGeoConsent('no');
      renderGeoConsent();
      ui.toast('Permiso de ubicación retirado.', 'warn');
      return false;
    }

    const accept = await ui.confirmDialog({
      title: 'Permiso de ubicación',
      message: 'Agua Magaly usará la ubicación de tu celular solo cuando inicies o confirmes una entrega, para dejar constancia de la ruta. Es opcional y puedes retirarla cuando quieras.',
      confirmText: 'Permitir ubicación',
      cancelText: 'Ahora no'
    });
    setGeoConsent(accept ? 'yes' : 'no');
    renderGeoConsent();
    if (accept) {
      ui.toast('Permiso de ubicación activado. Se usará solo durante las entregas.', 'success');
    }
    return accept;
  }

  function bindGeoConsent() {
    const btn = document.getElementById('geo-consent-btn');
    if (btn) btn.addEventListener('click', () => { askGeoConsent(); });
    renderGeoConsent();
  }

  // ==========================================================================
  // ARRANQUE
  // ==========================================================================
  async function main() {
    const user = await window.MagalyAuth.requireRole('driver');
    if (!user) return;
    state.driver = user;

    document.getElementById('driver-name').textContent = user.name;
    document.getElementById('driver-avatar').textContent = ui.initials(user.name);
    document.getElementById('driver-avatar').style.background = (user.color || '#1C7FA8');
    document.getElementById('driver-date').textContent =
      new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

    bindNavigation();
    bindPasswordForm();
    bindNotifications();
    bindGeoConsent();
    setupInstall();
    window.addEventListener('online', () => { state.offline = false; flushOutbox().then(reload); });
    window.addEventListener('offline', () => { state.offline = true; renderOffline(); });
    await reload();

    setInterval(reload, 10000);
    store.subscribe(ui.debounce(() => reload(), 400));
  }

  async function reload() {
    let orders;
    try {
      if (outbox().length && navigator.onLine !== false) await flushOutbox();
      orders = (await store.list('orders')).filter(o => o.driverId === state.driver.id);
      state.offline = false;
      writeLocal(cacheKey(), orders);
    } catch (err) {
      if (!isNetworkError(err)) console.warn('[repartidor] no se pudieron cargar los pedidos', err);
      state.offline = true;
      orders = readLocal(cacheKey(), state.orders || []);
    }
    // Los cambios aún sin enviar se muestran como ya hechos.
    const pending = outbox();
    state.orders = orders.map(o => {
      const q = pending.find(item => item.id === o.id);
      return q ? q.record : o;
    });
    checkNewOrders();
    render();
  }

  function render() {
    renderOffline();
    renderSummary();
    renderRoute();
    renderJobs();
    renderHistory();
    renderProfile();
  }

  // ==========================================================================
  // AVISO DE PEDIDO NUEVO (sonido + notificación)
  // ==========================================================================
  function bindNotifications() {
    const banner = document.getElementById('notif-banner');
    const btn = document.getElementById('enable-notif');
    if (!banner || !btn) return;

    const supported = typeof window.Notification !== 'undefined';

    const update = () => {
      const needsPermission = supported && window.Notification.permission === 'default';
      banner.hidden = !needsPermission;
    };

    btn.addEventListener('click', async () => {
      if (!supported) return;
      try { await window.Notification.requestPermission(); } catch (err) { /* ignora */ }
      update();
      if (window.Notification.permission === 'granted') {
        playChime();
        ui.toast('Avisos activados. Te avisaremos cuando te asignen un pedido.', 'success');
      } else if (window.Notification.permission === 'denied') {
        ui.toast('Los avisos están bloqueados en este navegador.', 'warn');
      }
    });

    update();
  }

  function checkNewOrders() {
    const active = state.orders.filter(o => o.status === STATUS.pendiente || o.status === STATUS.enruta);
    const ids = active.map(o => o.id);

    if (!state.seenReady) {
      // Primera carga: damos por conocidos los pedidos que ya estaban.
      state.seen = new Set(ids);
      state.seenReady = true;
      return;
    }

    const fresh = active.filter(o => !state.seen.has(o.id));
    ids.forEach(id => state.seen.add(id));

    // Limpia los que ya no están activos para que no crezca sin control.
    state.seen.forEach(id => { if (ids.indexOf(id) === -1) state.seen.delete(id); });

    if (fresh.length) notifyNewOrders(fresh);
  }

  function notifyNewOrders(list) {
    const first = list[0];
    const extra = list.length > 1 ? ' (+' + (list.length - 1) + ' más)' : '';
    ui.toast('🔔 Nuevo pedido: ' + first.client + extra, 'success');
    playChime();
    flashTitle();

    if (typeof window.Notification !== 'undefined' && window.Notification.permission === 'granted') {
      try {
        const n = new window.Notification('Nuevo pedido asignado', {
          body: first.client + ' · ' + (first.address || 'Sin dirección'),
          icon: 'assets/logo-magaly.png',
          tag: 'magaly-order-' + first.id
        });
        n.onclick = () => { window.focus(); n.close(); };
      } catch (err) { /* algunos navegadores lo bloquean */ }
    }
  }

  // Sonido corto sin archivos externos.
  function playChime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      const now = ctx.currentTime;
      [0, 0.18].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = i === 0 ? 880 : 1175;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.28, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.17);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.2);
      });
      setTimeout(() => { try { ctx.close(); } catch (err) { /* ignora */ } }, 900);
    } catch (err) { /* sin sonido */ }
  }

  function flashTitle() {
    if (!document.hidden) return;
    const original = document.title;
    let on = false;
    const timer = setInterval(() => {
      document.title = on ? '🔔 Nuevo pedido' : original;
      on = !on;
    }, 900);
    setTimeout(() => {
      clearInterval(timer);
      document.title = original;
    }, 12000);
  }

  // ==========================================================================
  // NAVEGACIÓN
  // ==========================================================================
  function bindNavigation() {
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => showView(btn.dataset.view));
    });
    document.querySelectorAll('#driver-range button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#driver-range button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.range = btn.dataset.range;
        renderJobs();
      });
    });
  }

  function showView(view) {
    state.view = view;
    ['pedidos', 'historial', 'perfil'].forEach(v => {
      const section = document.getElementById('view-' + v);
      if (section) section.hidden = v !== view;
    });
    document.querySelectorAll('.driver-tabbar [data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==========================================================================
  // RESUMEN
  // ==========================================================================
  function isToday(iso) {
    return U.sameDay(iso, new Date().toISOString());
  }

  function renderSummary() {
    const active = state.orders.filter(o => o.status === STATUS.pendiente || o.status === STATUS.enruta);
    const onRoute = state.orders.filter(o => o.status === STATUS.enruta);
    const deliveredToday = state.orders.filter(o => o.status === STATUS.entregado && isToday(o.createdAt));

    document.getElementById('driver-summary').innerHTML =
      '<div class="sum"><b>' + active.length + '</b><span>Por entregar</span></div>' +
      '<div class="sum"><b>' + onRoute.length + '</b><span>En ruta</span></div>' +
      '<div class="sum"><b>' + U.formatMoney(deliveredToday.reduce((s, o) => s + o.total, 0)) + '</b><span>Cobrado hoy</span></div>';
  }

  // ==========================================================================
  // RUTA COMPLETA EN GOOGLE MAPS
  // ==========================================================================
  function renderRoute() {
    const toolbar = document.getElementById('driver-toolbar');
    const link = document.getElementById('route-btn');
    const note = document.getElementById('route-note');
    if (!toolbar || !link) return;

    const items = state.orders
      .filter(o => o.status === STATUS.pendiente || o.status === STATUS.enruta)
      .filter(o => String(o.address || '').trim());

    const url = buildRouteUrl(items);
    if (!url) {
      toolbar.hidden = true;
      return;
    }

    toolbar.hidden = false;
    link.href = url;
    link.textContent = items.length === 1
      ? '🗺️ Abrir dirección en Maps'
      : '🗺️ Abrir ruta completa (' + items.length + ' paradas)';

    if (note) {
      const extra = items.length > 10 ? 'Maps admite 10 paradas; se abrirán las 10 primeras.' : '';
      note.textContent = extra;
      note.hidden = !extra;
    }
  }

  function buildRouteUrl(items) {
    const addresses = items
      .map(o => String(o.address || '').trim())
      .filter(Boolean)
      .slice(0, 10);

    if (!addresses.length) return '';

    const destination = addresses[addresses.length - 1];
    const waypoints = addresses.slice(0, -1);
    let url = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + encodeURIComponent(destination);
    if (waypoints.length) {
      url += '&waypoints=' + encodeURIComponent(waypoints.join('|'));
    }
    return url;
  }

  // Mensaje listo para avisar al cliente que va en camino.
  function onTheWayUrl(o) {
    const phone = String(o.phone || '').replace(/\D/g, '');
    if (!phone) return '';
    const number = phone.replace(/^57/, '');
    const message = 'Hola ' + (o.client || '') + ', soy ' + state.driver.name +
      ' de Agua Magaly. Voy en camino con tu pedido ' + o.code +
      '. Total a pagar: ' + U.formatMoney(o.total) + '. ¡Gracias!';
    return 'https://api.whatsapp.com/send?phone=57' + number + '&text=' + encodeURIComponent(message);
  }

  // ==========================================================================
  // PEDIDOS
  // ==========================================================================
  function renderJobs() {
    const list = document.getElementById('job-list');

    let items = state.orders.filter(o => o.status === STATUS.pendiente || o.status === STATUS.enruta);
    if (state.range === 'hoy') items = state.orders;

    items = items.slice().sort((a, b) => {
      const rank = s => (s === STATUS.enruta ? 0 : s === STATUS.pendiente ? 1 : 2);
      const diff = rank(a.status) - rank(b.status);
      return diff !== 0 ? diff : new Date(b.createdAt) - new Date(a.createdAt);
    });

    if (!items.length) {
      list.innerHTML = '<div class="driver-empty">' +
        ui.emptyState('No tienes entregas pendientes', 'Cuando el administrador te asigne un pedido aparecerá aquí.', '🎉') +
        '</div>';
      return;
    }

    list.innerHTML = items.map(jobCard).join('');
    bindJobActions(list);
  }

  function jobCard(o) {
    const wa = onTheWayUrl(o);
    const maps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.address || o.client);

    let actions = '';
    if (o.status === STATUS.pendiente) {
      actions =
        '<div class="job-actions">' +
          '<button type="button" class="btn btn-primary" data-start="' + ui.esc(o.id) + '">🚚 Iniciar entrega</button>' +
          (wa ? '<a class="btn btn-success btn-icon" href="' + wa + '" target="_blank" rel="noopener" aria-label="WhatsApp">💬</a>' : '') +
          (o.phone ? '<a class="btn btn-ghost btn-icon" style="color:var(--blue-deep);border-color:var(--rule)" href="tel:' + ui.esc(o.phone) + '" aria-label="Llamar">📞</a>' : '') +
        '</div>';
    } else if (o.status === STATUS.enruta) {
      actions =
        '<div class="job-actions">' +
          '<button type="button" class="btn btn-success" data-deliver="' + ui.esc(o.id) + '">✓ Entregado</button>' +
          '<button type="button" class="btn btn-danger" data-fail="' + ui.esc(o.id) + '">✕ No entregué</button>' +
        '</div>' +
        '<div class="job-actions">' +
          (wa ? '<a class="btn btn-ghost" style="color:var(--blue-deep);border-color:var(--rule)" href="' + wa + '" target="_blank" rel="noopener">💬 Voy en camino</a>' : '') +
          '<a class="btn btn-ghost" style="color:var(--blue-deep);border-color:var(--rule)" href="' + maps + '" target="_blank" rel="noopener">🗺️ Mapa</a>' +
          (o.phone ? '<a class="btn btn-ghost" style="color:var(--blue-deep);border-color:var(--rule)" href="tel:' + ui.esc(o.phone) + '">📞 Llamar</a>' : '') +
        '</div>';
    } else {
      actions = '<div class="job-actions"><span class="pill pill-entregado">✓ Entregado</span></div>';
    }

    return '<article class="job-card" data-status="' + ui.esc(o.status) + '">' +
      '<div class="job-head">' +
        '<div>' +
          '<span class="job-code">' + ui.esc(o.code) + ' · ' + ui.esc(U.relativeTime(o.createdAt)) + '</span>' +
          '<h3>' + ui.esc(o.client) + '</h3>' +
        '</div>' +
        '<span class="pill ' + (o.status === STATUS.enruta ? 'pill-ruta' : 'pill-pendiente') + '">● ' + ui.esc(o.status) + '</span>' +
      '</div>' +
      '<ul class="job-lines">' +
        '<li>📍 <strong>' + ui.esc(o.address || 'Sin dirección') + '</strong></li>' +
        '<li>📦 ' + ui.esc(o.items) + '</li>' +
        '<li>💵 Cobrar <strong>' + U.formatMoney(o.total) + '</strong> · ' + ui.esc(o.payment) + '</li>' +
      '</ul>' +
      (o.notes ? '<div class="job-note">📝 ' + ui.esc(o.notes) + '</div>' : '') +
      actions +
    '</article>';
  }

  function bindJobActions(container) {
    container.querySelectorAll('[data-start]').forEach(btn => {
      btn.addEventListener('click', () => startDelivery(btn.dataset.start));
    });
    container.querySelectorAll('[data-deliver]').forEach(btn => {
      btn.addEventListener('click', () => confirmDelivery(btn.dataset.deliver));
    });
    container.querySelectorAll('[data-fail]').forEach(btn => {
      btn.addEventListener('click', () => reportFailure(btn.dataset.fail));
    });
  }

  // ==========================================================================
  // ACCIONES
  // ==========================================================================
  function withGeo() {
    return new Promise(resolve => {
      // Sin autorización expresa del repartidor, no se pide la ubicación.
      if (geoConsent() !== 'yes') return resolve(null);
      if (!navigator.geolocation) return resolve(null);
      const timer = setTimeout(() => resolve(null), 6000);
      navigator.geolocation.getCurrentPosition(
        pos => {
          clearTimeout(timer);
          resolve({ lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) });
        },
        () => { clearTimeout(timer); resolve(null); },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    });
  }

  async function startDelivery(id) {
    const order = state.orders.find(o => o.id === id);
    if (!order) return;

    // Primera entrega: explicamos y pedimos el permiso de ubicación.
    if (!geoConsent()) await askGeoConsent();

    ui.toast('Registrando salida a ruta…');
    const geo = await withGeo();

    const startResult = await saveOrder(Object.assign({}, order, {
      status: STATUS.enruta,
      events: (order.events || []).concat([{
        type: 'en_ruta',
        at: U.nowIso(),
        by: state.driver.name,
        note: geo ? 'Ubicación registrada' : 'Sin GPS',
        geo: geo
      }])
    }));

    if (startResult === 'queued') { ui.toast('Sin señal: la salida quedó guardada y se enviará al volver la conexión', 'warn'); return; }
    await reload();
    ui.toast('¡Buen viaje! Pedido ' + order.code + ' en ruta', 'success');
  }

  async function confirmDelivery(id) {
    const order = state.orders.find(o => o.id === id);
    if (!order) return;

    const result = await deliveryDialog(order);
    if (!result) return;

    const geo = await withGeo();

    const doneResult = await saveOrder(Object.assign({}, order, {
      status: STATUS.entregado,
      paid: result.paid,
      payment: result.payment,
      events: (order.events || []).concat([{
        type: 'entregado',
        at: U.nowIso(),
        by: state.driver.name,
        note: (result.paid ? 'Cobrado' : 'No cobrado') + ' · ' + result.payment,
        geo: geo
      }])
    }));

    if (doneResult === 'queued') { ui.toast('Sin señal: la entrega quedó guardada y se enviará al volver la conexión', 'warn'); return; }
    await reload();
    ui.toast('Entrega registrada · ' + order.code, 'success');
  }

  async function reportFailure(id) {
    const order = state.orders.find(o => o.id === id);
    if (!order) return;

    const reason = await ui.prompt({
      title: 'No se pudo entregar',
      label: 'El pedido volverá a "Pendiente" con tu motivo para que el administrador lo gestione.',
      placeholder: 'Ej. El cliente no estaba / dirección incorrecta',
      multiline: true,
      confirmText: 'Registrar'
    });
    if (!reason) return;

    const failResult = await saveOrder(Object.assign({}, order, {
      status: STATUS.pendiente,
      failReason: reason,
      events: (order.events || []).concat([{
        type: 'no_entregado',
        at: U.nowIso(),
        by: state.driver.name,
        note: reason
      }])
    }));

    if (failResult === 'queued') { ui.toast('Sin señal: el reporte quedó guardado y se enviará al volver la conexión', 'warn'); return; }
    await reload();
    ui.toast('Registrado: pedido devuelto a pendientes', 'warn');
  }

  // Diálogo de entrega: forma de pago + cobro
  function deliveryDialog(order) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'ui-dialog-overlay';
      overlay.innerHTML =
        '<div class="ui-dialog">' +
          '<h3>Confirmar entrega</h3>' +
          '<p>' + ui.esc(order.code) + ' · ' + ui.esc(order.client) + '<br>Total a cobrar: <strong>' + U.formatMoney(order.total) + '</strong></p>' +
          '<div class="form-field full" style="margin-bottom:12px">' +
            '<label for="dlv-payment">Forma de pago</label>' +
            '<select id="dlv-payment">' +
              ['Efectivo', 'Transferencia', 'Nequi', 'Contra entrega'].map(p =>
                '<option value="' + p + '"' + (order.payment === p ? ' selected' : '') + '>' + p + '</option>'
              ).join('') +
            '</select>' +
          '</div>' +
          '<label class="switch" style="margin-bottom:4px">' +
            '<input type="checkbox" id="dlv-paid" checked><span class="track"></span> ¿Se cobró el pedido?' +
          '</label>' +
          '<div class="ui-dialog-actions">' +
            '<button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>' +
            '<button type="button" class="btn btn-success" data-ok>Confirmar entrega</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('is-open'));

      const close = value => {
        overlay.classList.remove('is-open');
        setTimeout(() => overlay.remove(), 180);
        resolve(value);
      };

      overlay.querySelector('[data-cancel]').addEventListener('click', () => close(null));
      overlay.querySelector('[data-ok]').addEventListener('click', () => {
        close({
          payment: overlay.querySelector('#dlv-payment').value,
          paid: overlay.querySelector('#dlv-paid').checked
        });
      });
      overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    });
  }

  // ==========================================================================
  // HISTORIAL
  // ==========================================================================
  function renderHistory() {
    const list = document.getElementById('history-list');
    const done = state.orders
      .filter(o => o.status === STATUS.entregado || o.status === STATUS.cancelado)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const today = done.filter(o => isToday(o.createdAt));
    const collected = today.filter(o => o.status === STATUS.entregado && o.paid).reduce((s, o) => s + o.total, 0);

    document.getElementById('history-summary').innerHTML =
      '<div class="sum"><b>' + today.length + '</b><span>Hoy</span></div>' +
      '<div class="sum"><b>' + today.filter(o => o.status === STATUS.entregado).length + '</b><span>Entregados</span></div>' +
      '<div class="sum"><b>' + U.formatMoney(collected) + '</b><span>Cobrado</span></div>';

    if (!done.length) {
      list.innerHTML = '<div class="driver-empty">' + ui.emptyState('Sin historial aún', 'Aquí verás los pedidos que ya entregaste.', '📋') + '</div>';
      return;
    }

    list.innerHTML = done.slice(0, 40).map(o =>
      '<article class="job-card" data-status="' + ui.esc(o.status) + '">' +
        '<div class="job-head">' +
          '<div>' +
            '<span class="job-code">' + ui.esc(o.code) + ' · ' + ui.esc(U.formatDateTime(o.createdAt)) + '</span>' +
            '<h3>' + ui.esc(o.client) + '</h3>' +
          '</div>' +
          '<span class="pill ' + (o.status === STATUS.entregado ? 'pill-entregado' : 'pill-cancelado') + '">● ' + ui.esc(o.status) + '</span>' +
        '</div>' +
        '<ul class="job-lines">' +
          '<li>📦 ' + ui.esc(o.items) + '</li>' +
          '<li>💵 <strong>' + U.formatMoney(o.total) + '</strong> · ' + (o.paid ? 'Cobrado' : 'Sin cobro') + ' · ' + ui.esc(o.payment) + '</li>' +
          (o.failReason ? '<li>⚠ ' + ui.esc(o.failReason) + '</li>' : '') +
        '</ul>' +
      '</article>'
    ).join('');
  }

  // ==========================================================================
  // PERFIL
  // ==========================================================================
  function renderProfile() {
    const box = document.getElementById('profile-info');
    if (!box) return;
    const d = state.driver;
    const done = state.orders.filter(o => o.status === STATUS.entregado);
    box.innerHTML =
      '<div class="detail-row"><span>Nombre</span><span>' + ui.esc(d.name) + '</span></div>' +
      '<div class="detail-row"><span>Usuario</span><span>' + ui.esc(d.username) + '</span></div>' +
      '<div class="detail-row"><span>Teléfono</span><span>' + ui.esc(d.phone || '—') + '</span></div>' +
      '<div class="detail-row"><span>Entregas totales</span><span>' + done.length + '</span></div>' +
      '<div class="detail-row"><span>Estado</span><span>' + (d.active ? 'Activo' : 'Desactivado') + '</span></div>';
  }

  function bindPasswordForm() {
    const form = document.getElementById('password-form');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const current = document.getElementById('pass-current').value;
      const next = document.getElementById('pass-new').value;
      const repeat = document.getElementById('pass-repeat').value;

      if (next !== repeat) {
        ui.toast('Las contraseñas nuevas no coinciden', 'error');
        return;
      }

      const result = await window.MagalyAuth.changePassword(state.driver.id, current, next);
      if (!result.ok) {
        ui.toast(result.error, 'error');
        return;
      }
      form.reset();
      ui.toast('Contraseña actualizada', 'success');
    });
  }

  main();
})();
