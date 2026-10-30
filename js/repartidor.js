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

  const state = {
    driver: null,
    orders: [],
    view: 'pedidos',
    range: 'activos'
  };

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
    await reload();

    setInterval(reload, 10000);
    store.subscribe(ui.debounce(() => reload(), 400));
  }

  async function reload() {
    const orders = await store.list('orders');
    state.orders = orders.filter(o => o.driverId === state.driver.id);
    render();
  }

  function render() {
    renderSummary();
    renderJobs();
    renderHistory();
    renderProfile();
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
    const waPhone = String(o.phone || '').replace(/\D/g, '');
    const wa = waPhone ? 'https://api.whatsapp.com/send?phone=57' + waPhone.replace(/^57/, '') : '';
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
          (wa ? '<a class="btn btn-ghost" style="color:var(--blue-deep);border-color:var(--rule)" href="' + wa + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : '') +
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

    ui.toast('Registrando salida a ruta…');
    const geo = await withGeo();

    await store.upsert('orders', Object.assign({}, order, {
      status: STATUS.enruta,
      events: (order.events || []).concat([{
        type: 'en_ruta',
        at: U.nowIso(),
        by: state.driver.name,
        note: geo ? 'Ubicación registrada' : 'Sin GPS',
        geo: geo
      }])
    }));

    await reload();
    ui.toast('¡Buen viaje! Pedido ' + order.code + ' en ruta', 'success');
  }

  async function confirmDelivery(id) {
    const order = state.orders.find(o => o.id === id);
    if (!order) return;

    const result = await deliveryDialog(order);
    if (!result) return;

    const geo = await withGeo();

    await store.upsert('orders', Object.assign({}, order, {
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

    await store.upsert('orders', Object.assign({}, order, {
      status: STATUS.pendiente,
      failReason: reason,
      events: (order.events || []).concat([{
        type: 'no_entregado',
        at: U.nowIso(),
        by: state.driver.name,
        note: reason
      }])
    }));

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
