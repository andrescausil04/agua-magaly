/**
 * AGUA MAGALY — PANEL DE ADMINISTRACIÓN
 * Resumen con KPIs, tablero de pedidos (arrastrar y soltar), repartidores,
 * productos, rutas y PQRS. Todo sobre MagalyStore.
 */

(function () {
  'use strict';

  const store = window.MagalyStore;
  const ui = window.MagalyUI;
  const U = store.utils;

  const STATUS = store.ORDER_STATUS;
  const COLUMNS = [STATUS.pendiente, STATUS.enruta, STATUS.entregado];

  const state = {
    section: 'resumen',
    orders: [],
    products: [],
    users: [],
    routes: [],
    pqrs: [],
    search: '',
    range: 'hoy',
    showCancelled: false,
    pqrsFilter: 'todas',
    admin: null,
    stock: [],
    reportRange: '7',
    seenOrders: null,       // pedidos ya vistos (para avisar de los nuevos)
    notifOn: false
  };

  const NOTIF_KEY = 'magaly_admin_notif';

  // ==========================================================================
  // ARRANQUE
  // ==========================================================================
  async function main() {
    const user = await window.MagalyAuth.requireRole('admin');
    if (!user) return;
    state.admin = user;

    document.getElementById('admin-name').textContent = user.name;
    document.getElementById('admin-avatar').textContent = ui.initials(user.name);

    bindNavigation();
    bindOrdersToolbar();
    bindProductActions();
    bindDriverActions();
    bindRouteActions();
    bindPqrsActions();
    bindAccountActions();
    bindTwofaGate();
    bindShortcuts();
    bindReports();
    bindNotifications();

    await maybeRequireTwofa();
    await reload();
    setInterval(() => {
      store.list('orders').then(orders => { state.orders = orders; checkNewOrders(); render(); }).catch(() => {});
    }, 8000);
  }

  async function reload() {
    const [orders, products, users, routes, pqrs, stock] = await Promise.all([
      store.list('orders'),
      store.list('products'),
      store.list('users'),
      store.list('routes'),
      store.list('pqrs'),
      store.list('stock').catch(() => [])
    ]);
    state.orders = orders;
    state.products = products;
    state.users = users;
    state.routes = routes;
    state.pqrs = pqrs;
    state.stock = stock;
    checkNewOrders();
    render();
  }

  function render() {
    renderCounts();
    renderKpis();
    renderChart();
    renderActivity();
    renderDriversOverview();
    renderKanban();
    renderDrivers();
    renderProducts();
    renderRoutes();
    renderPqrs();
    renderAccount();
    renderReports();
    renderInventory();
    renderStockAlert();
  }

  // ==========================================================================
  // NAVEGACIÓN
  // ==========================================================================
  function bindNavigation() {
    document.querySelectorAll('.panel-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => goto(btn.dataset.section));
    });
    document.querySelectorAll('[data-goto]').forEach(btn => {
      btn.addEventListener('click', () => goto(btn.dataset.goto));
    });
    document.getElementById('btn-refresh').addEventListener('click', async () => {
      await reload();
      ui.toast('Panel actualizado', 'success');
    });
  }

  function goto(section) {
    state.section = section;
    document.querySelectorAll('.panel-nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.section === section);
    });
    document.querySelectorAll('.panel-section').forEach(s => {
      s.classList.toggle('active', s.id === 'section-' + section);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderCounts() {
    const open = state.orders.filter(o => o.status === STATUS.pendiente || o.status === STATUS.enruta).length;
    setCount('count-orders', open, true);
    setCount('count-drivers', state.users.filter(u => u.role === 'driver' && u.active).length);
    setCount('count-products', state.products.length);
    setCount('count-routes', state.routes.length);
    setCount('count-pqrs', state.pqrs.filter(p => p.status !== 'Atendida').length, true);
    setCount('count-inventory', lowStock().length, true);
  }

  function setCount(id, value, alert) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
    el.classList.toggle('is-alert', !!alert && value > 0);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================
  function driverById(id) {
    return state.users.find(u => u.id === id) || null;
  }

  function driverName(order) {
    const d = driverById(order.driverId);
    return d ? d.name : (order.driverName || '');
  }

  function pillClass(status) {
    if (status === STATUS.enruta) return 'pill-ruta';
    if (status === STATUS.entregado) return 'pill-entregado';
    if (status === STATUS.cancelado) return 'pill-cancelado';
    return 'pill-pendiente';
  }

  function pill(status) {
    return '<span class="pill ' + pillClass(status) + '">● ' + ui.esc(status) + '</span>';
  }

  function isToday(iso) {
    return U.sameDay(iso, new Date().toISOString());
  }

  function ordersInRange() {
    let list = state.orders;
    if (state.range === 'hoy') list = list.filter(o => isToday(o.createdAt));
    if (state.range === '7') {
      const limit = Date.now() - 7 * 24 * 60 * 60 * 1000;
      list = list.filter(o => new Date(o.createdAt).getTime() >= limit);
    }
    if (!state.showCancelled) list = list.filter(o => o.status !== STATUS.cancelado);
    const q = state.search.trim().toLowerCase();
    if (q) {
      list = list.filter(o =>
        [o.code, o.client, o.phone, o.address, o.items, driverName(o)]
          .join(' ').toLowerCase().includes(q)
      );
    }
    return list;
  }

  function driverColor(user) {
    const value = String((user && user.color) || '').trim();
    // Solo se aceptan colores hexadecimales; evita inyección en el atributo style.
    return /^#[0-9a-f]{3,8}$/i.test(value) ? value : '#1C7FA8';
  }

  function safeImage(value) {
    const url = String(value || '').trim();
    if (!url) return 'assets/bolsa-250ml.jpg';
    if (/^data:image\/(png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
    if (/^https?:\/\//i.test(url) || /^(\.{0,2}\/)?assets\//i.test(url) || /^[a-z0-9._-]+\.(png|jpe?g|webp|gif|avif)$/i.test(url)) {
      return url;
    }
    return 'assets/bolsa-250ml.jpg';
  }

  // ==========================================================================
  // RESUMEN
  // ==========================================================================
  function renderKpis() {
    const today = state.orders.filter(o => isToday(o.createdAt));
    const delivered = today.filter(o => o.status === STATUS.entregado);
    const sales = delivered.reduce((sum, o) => sum + o.total, 0);
    const pending = state.orders.filter(o => o.status === STATUS.pendiente).length;
    const onRoute = state.orders.filter(o => o.status === STATUS.enruta).length;
    const avg = delivered.length ? Math.round(sales / delivered.length) : 0;

    const cards = [
      { label: 'Ventas de hoy', value: U.formatMoney(sales), hint: delivered.length + ' pedido(s) entregado(s)', cls: 'kpi-money' },
      { label: 'Pedidos de hoy', value: today.length, hint: 'Recibidos en el día', cls: '' },
      { label: 'Pendientes', value: pending, hint: 'Sin salir a ruta', cls: 'kpi-warn' },
      { label: 'En ruta', value: onRoute, hint: 'Con repartidor en calle', cls: 'kpi-route' },
      { label: 'Ticket promedio', value: U.formatMoney(avg), hint: 'Por pedido entregado hoy', cls: '' },
      { label: 'Sin asignar', value: state.orders.filter(o => !o.driverId && (o.status === STATUS.pendiente || o.status === STATUS.enruta)).length, hint: 'Pedidos que necesitan repartidor', cls: 'kpi-danger' }
    ];

    document.getElementById('kpi-grid').innerHTML = cards.map(c =>
      '<div class="kpi-card ' + c.cls + '">' +
        '<span class="kpi-label">' + ui.esc(c.label) + '</span>' +
        '<span class="kpi-value">' + ui.esc(c.value) + '</span>' +
        '<span class="kpi-hint">' + ui.esc(c.hint) + '</span>' +
      '</div>'
    ).join('');

    const pendingToday = state.orders.filter(o => isToday(o.createdAt) && (o.status === STATUS.pendiente || o.status === STATUS.enruta)).length;
    document.getElementById('resumen-subtitle').textContent =
      new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }) +
      ' · ' + pendingToday + ' pedido(s) por gestionar';
  }

  function renderChart() {
    const canvas = document.getElementById('sales-chart');
    if (!canvas) return;

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const total = state.orders
        .filter(o => o.status === STATUS.entregado && U.sameDay(o.createdAt, d.toISOString()))
        .reduce((sum, o) => sum + o.total, 0);
      days.push({
        label: d.toLocaleDateString('es-CO', { weekday: 'short' }).slice(0, 3),
        value: total
      });
    }

    const totalWeek = days.reduce((s, d) => s + d.value, 0);
    document.getElementById('chart-total').textContent = U.formatMoney(totalWeek);

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 600;
    const h = rect.height || 230;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 24, right: 8, bottom: 26, left: 8 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const max = Math.max.apply(null, days.map(d => d.value).concat([1]));
    const slot = chartW / days.length;
    const barW = Math.min(46, slot * 0.52);

    // Líneas guía
    ctx.strokeStyle = 'rgba(22, 38, 46, 0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = pad.top + (chartH / 3) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    days.forEach((d, i) => {
      const x = pad.left + slot * i + slot / 2;
      const barH = Math.max(3, (d.value / max) * chartH);
      const y = pad.top + chartH - barH;

      const grad = ctx.createLinearGradient(0, y, 0, pad.top + chartH);
      grad.addColorStop(0, '#1C7FA8');
      grad.addColorStop(1, '#0B4F73');
      ctx.fillStyle = grad;
      const r = Math.min(8, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x - barW / 2, pad.top + chartH);
      ctx.lineTo(x - barW / 2, y + r);
      ctx.quadraticCurveTo(x - barW / 2, y, x - barW / 2 + r, y);
      ctx.lineTo(x + barW / 2 - r, y);
      ctx.quadraticCurveTo(x + barW / 2, y, x + barW / 2, y + r);
      ctx.lineTo(x + barW / 2, pad.top + chartH);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#4A5B62';
      ctx.font = '600 11px "Public Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.label.toUpperCase(), x, h - 8);

      if (d.value > 0) {
        ctx.fillStyle = '#16262E';
        ctx.font = '700 11px "Public Sans", sans-serif';
        ctx.fillText('$' + Math.round(d.value / 1000) + 'k', x, y - 7);
      }
    });
  }

  function renderActivity() {
    const list = document.getElementById('activity-list');
    if (!list) return;

    const events = [];
    state.orders.forEach(order => {
      (order.events || []).forEach(ev => {
        events.push({ order, ev });
      });
    });
    events.sort((a, b) => new Date(b.ev.at) - new Date(a.ev.at));

    const top = events.slice(0, 8);
    if (!top.length) {
      list.innerHTML = '<li>' + ui.emptyState('Sin actividad todavía', 'Cuando se muevan pedidos verás el historial aquí.', '🕒') + '</li>';
      return;
    }

    list.innerHTML = top.map(({ order, ev }) => {
      const label = store.EVENT_LABEL[ev.type] || ev.type;
      return '<li class="activity-item">' +
        '<span class="activity-dot" style="background:' + (ev.type === 'entregado' ? '#1E824C' : ev.type === 'cancelado' || ev.type === 'no_entregado' ? '#C0392B' : '#1C7FA8') + '"></span>' +
        '<div><strong>' + ui.esc(order.code) + ' · ' + ui.esc(label) + '</strong>' +
        '<small>' + ui.esc(order.client) + ' — ' + ui.esc(U.relativeTime(ev.at)) + (ev.by ? ' · ' + ui.esc(ev.by) : '') + '</small></div>' +
      '</li>';
    }).join('');
  }

  function renderDriversOverview() {
    const box = document.getElementById('drivers-overview');
    if (!box) return;
    const drivers = state.users.filter(u => u.role === 'driver');
    if (!drivers.length) {
      box.innerHTML = ui.emptyState('Aún no hay repartidores', 'Crea el primero en la sección Repartidores.', '🛵');
      return;
    }
    box.innerHTML = drivers.map(d => {
      const assigned = state.orders.filter(o => o.driverId === d.id && (o.status === STATUS.pendiente || o.status === STATUS.enruta));
      const done = state.orders.filter(o => o.driverId === d.id && o.status === STATUS.entregado && isToday(o.createdAt));
      return '<div class="driver-card' + (d.active ? '' : ' is-off') + '">' +
        '<div class="driver-card-head">' +
          '<div class="avatar" style="background:' + driverColor(d) + '">' + ui.esc(ui.initials(d.name)) + '</div>' +
          '<div><h4>' + ui.esc(d.name) + '</h4><small>' + (d.active ? 'Disponible' : 'Desactivado') + '</small></div>' +
        '</div>' +
        '<div class="driver-stats">' +
          '<div class="driver-stat"><b>' + assigned.length + '</b><span>Activos</span></div>' +
          '<div class="driver-stat"><b>' + done.length + '</b><span>Hoy</span></div>' +
          '<div class="driver-stat"><b>' + U.formatMoney(done.reduce((s, o) => s + o.total, 0)) + '</b><span>Cobrado</span></div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // ==========================================================================
  // TABLERO DE PEDIDOS
  // ==========================================================================
  function bindOrdersToolbar() {
    const search = document.getElementById('orders-search');
    search.addEventListener('input', ui.debounce(() => {
      state.search = search.value;
      renderKanban();
    }, 200));

    document.querySelectorAll('#orders-range button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#orders-range button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.range = btn.dataset.range;
        renderKanban();
      });
    });

    document.getElementById('orders-show-cancelled').addEventListener('change', e => {
      state.showCancelled = e.target.checked;
      renderKanban();
    });

    document.getElementById('btn-new-order').addEventListener('click', openOrderForm);

    document.getElementById('btn-export-orders').addEventListener('click', () => {
      const rows = ordersInRange().map(o => ({
        codigo: o.code,
        cliente: o.client,
        telefono: o.phone,
        direccion: o.address,
        detalle: o.items,
        total: o.total,
        estado: o.status,
        repartidor: driverName(o) || 'Sin asignar',
        pago: o.payment,
        fecha: U.formatDateTime(o.createdAt)
      }));
      if (!rows.length) { ui.toast('No hay pedidos para exportar', 'warn'); return; }
      store.exportCsv('pedidos', rows);
      ui.toast('Archivo CSV descargado', 'success');
    });
  }

  function renderKanban() {
    const board = document.getElementById('kanban');
    if (!board) return;

    const list = ordersInRange();
    const columns = state.showCancelled ? COLUMNS.concat([STATUS.cancelado]) : COLUMNS;
    board.style.setProperty('--kanban-cols', columns.length);

    board.innerHTML = columns.map(status => {
      const items = list.filter(o => o.status === status);
      return '<div class="kanban-col" data-status="' + status + '">' +
        '<div class="kanban-col-head">' +
          '<strong>' + status + '</strong>' +
          '<span class="count">' + items.length + '</span>' +
        '</div>' +
        '<div class="kanban-body">' +
          (items.length ? items.map(orderCard).join('') : ui.emptyState('Sin pedidos', '', '🗂️')) +
        '</div>' +
      '</div>';
    }).join('');

    // Arrastrar y soltar
    board.querySelectorAll('.order-card').forEach(card => {
      card.addEventListener('dragstart', e => {
        card.classList.add('is-dragging');
        e.dataTransfer.setData('text/plain', card.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
      card.addEventListener('click', () => openOrderDrawer(card.dataset.id));
    });

    board.querySelectorAll('.kanban-col').forEach(col => {
      col.addEventListener('dragover', e => {
        e.preventDefault();
        col.classList.add('can-drop');
      });
      col.addEventListener('dragleave', () => col.classList.remove('can-drop'));
      col.addEventListener('drop', async e => {
        e.preventDefault();
        col.classList.remove('can-drop');
        const id = e.dataTransfer.getData('text/plain');
        const status = col.dataset.status;
        if (id) await changeStatus(id, status);
      });
    });
  }

  function orderCard(o) {
    const d = driverById(o.driverId);
    const assign = d
      ? '<span class="driver-tag"><span class="dot" style="background:' + driverColor(d) + '"></span>' + ui.esc(d.name.split(' ')[0]) + '</span>'
      : '<span class="driver-tag driver-tag-empty">⚠ Sin asignar</span>';

    return '<article class="order-card" draggable="true" data-id="' + ui.esc(o.id) + '" data-status="' + ui.esc(o.status) + '" tabindex="0">' +
      '<div class="order-card-top">' +
        '<div><span class="order-code">' + ui.esc(o.code) + '</span><br><strong>' + ui.esc(o.client) + '</strong></div>' +
        '<span class="order-money">' + U.formatMoney(o.total) + '</span>' +
      '</div>' +
      '<div class="order-meta">' +
        '<span>📦 ' + ui.esc(o.items) + '</span>' +
        (o.address ? '<span>📍 ' + ui.esc(o.address) + '</span>' : '') +
      '</div>' +
      '<div class="order-card-foot">' + assign + '<span class="order-time">' + ui.esc(U.formatTime(o.createdAt)) + '</span></div>' +
    '</article>';
  }

  async function changeStatus(orderId, status) {
    const order = state.orders.find(o => o.id === orderId);
    if (!order || order.status === status) return;

    const eventType = status === STATUS.enruta ? 'en_ruta'
      : status === STATUS.entregado ? 'entregado'
      : status === STATUS.cancelado ? 'cancelado'
      : 'pendiente';
    const event = { type: eventType, at: U.nowIso(), by: state.admin.name, note: '' };
    if (status === STATUS.cancelado) {
      const ok = await ui.confirm({
        title: 'Cancelar pedido',
        message: 'El pedido ' + order.code + ' de ' + order.client + ' quedará como cancelado.',
        confirmText: 'Sí, cancelar',
        danger: true
      });
      if (!ok) return;
    }

    await store.upsert('orders', Object.assign({}, order, {
      status: status,
      events: (order.events || []).concat([event])
    }));

    ui.toast(order.code + ' → ' + status, 'success');
    await reload();
  }

  // ==========================================================================
  // DETALLE DEL PEDIDO (drawer con seguimiento)
  // ==========================================================================
  function openOrderDrawer(orderId) {
    const o = state.orders.find(x => x.id === orderId);
    if (!o) return;

    const drivers = state.users.filter(u => u.role === 'driver' && u.active);
    const options = ['<option value="">Sin asignar</option>']
      .concat(drivers.map(d => '<option value="' + ui.esc(d.id) + '"' + (o.driverId === d.id ? ' selected' : '') + '>' + ui.esc(d.name) + '</option>'))
      .join('');
    const routeOptions = ['<option value="">Sin ruta</option>']
      .concat(state.routes.map(r => '<option value="' + ui.esc(r.id) + '"' + (o.routeId === r.id ? ' selected' : '') + '>' + ui.esc(r.name) + (r.time ? ' · ' + ui.esc(r.time) : '') + '</option>'))
      .join('');
    const lines = store.orderLines(o, state.products);

    const timeline = (o.events || []).slice().sort((a, b) => new Date(a.at) - new Date(b.at));
    const timelineHtml = timeline.map(ev =>
      '<li class="' + (ev.type === 'entregado' ? 'is-done' : '') + '">' +
        '<strong>' + ui.esc(store.EVENT_LABEL[ev.type] || ev.type) + '</strong>' +
        '<small>' + ui.esc(U.formatDateTime(ev.at)) + (ev.by ? ' · ' + ui.esc(ev.by) : '') + '</small>' +
        (ev.note ? '<div style="font-size:12.5px;color:var(--ink-soft);margin-top:3px">' + ui.esc(ev.note) + '</div>' : '') +
      '</li>'
    ).join('');

    const waPhone = String(o.phone || '').replace(/\D/g, '');
    const waLink = waPhone ? 'https://api.whatsapp.com/send?phone=57' + waPhone.replace(/^57/, '') : '';
    const mapsLink = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(o.address || o.client);

    const html =
      '<div class="drawer-head">' +
        '<div class="row">' +
          '<div>' +
            '<h3>' + ui.esc(o.code) + '</h3>' +
            '<p class="sub">' + ui.esc(o.client) + ' · ' + ui.esc(U.formatDateTime(o.createdAt)) + '</p>' +
          '</div>' +
          '<button type="button" class="drawer-close" data-close-drawer aria-label="Cerrar">✕</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
          pill(o.status) +
          '<span class="pill pill-neutral">' + U.formatMoney(o.total) + '</span>' +
          '<span class="pill pill-sand">' + ui.esc(o.payment) + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="drawer-body">' +

        '<div class="detail-block">' +
          '<h4>Cliente</h4>' +
          '<div class="detail-row"><span>Nombre</span><span>' + ui.esc(o.client) + '</span></div>' +
          '<div class="detail-row"><span>Teléfono</span><span>' + ui.esc(o.phone || '—') + '</span></div>' +
          '<div class="detail-row"><span>Dirección</span><span>' + ui.esc(o.address || '—') + '</span></div>' +
          '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
            (waLink ? '<a class="btn btn-success btn-sm" href="' + waLink + '" target="_blank" rel="noopener">WhatsApp</a>' : '') +
            (o.phone ? '<a class="btn btn-ghost btn-sm" style="color:var(--blue-deep);border-color:var(--rule)" href="tel:' + ui.esc(o.phone) + '">Llamar</a>' : '') +
            '<a class="btn btn-ghost btn-sm" style="color:var(--blue-deep);border-color:var(--rule)" href="' + mapsLink + '" target="_blank" rel="noopener">Ver mapa</a>' +
          '</div>' +
        '</div>' +

        '<div class="detail-block">' +
          '<h4>Pedido</h4>' +
          '<ul class="detail-items">' + (lines.length
            ? lines.map(l => '<li>' + ui.esc(l.qty + ' × ' + l.name) + (l.price ? ' <small>(' + U.formatMoney(l.qty * l.price) + ')</small>' : '') + '</li>').join('')
            : String(o.items || '').split(',').filter(Boolean).map(i => '<li>' + ui.esc(i.trim()) + '</li>').join('')) + '</ul>' +
          (o.source === 'web' ? '<div class="hint" style="margin-top:6px">✓ Total calculado por el servidor con los precios del catálogo.</div>' : '') +
          '<div class="detail-total"><span>Total</span><span>' + U.formatMoney(o.total) + '</span></div>' +
        '</div>' +

        '<div class="detail-block">' +
          '<h4>Ruta y repartidor</h4>' +
          '<label class="drawer-label" for="drawer-route">Ruta</label>' +
          '<select id="drawer-route" style="width:100%;padding:10px 12px;border:1px solid var(--rule);border-radius:9px;font-family:inherit;font-size:14px;margin-bottom:8px">' + routeOptions + '</select>' +
          '<label class="drawer-label" for="drawer-driver">Repartidor</label>' +
          '<select id="drawer-driver" style="width:100%;padding:10px 12px;border:1px solid var(--rule);border-radius:9px;font-family:inherit;font-size:14px">' + options + '</select>' +
          '<button type="button" class="btn btn-primary btn-sm" id="drawer-assign" style="width:100%;margin-top:9px">Guardar asignación</button>' +
        '</div>' +

        '<div class="detail-block">' +
          '<h4>Seguimiento</h4>' +
          '<ul class="timeline">' + timelineHtml + '</ul>' +
        '</div>' +

        '<div class="detail-block">' +
          '<h4>Acciones</h4>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
            '<button type="button" class="btn btn-success btn-sm" data-drawer-status="' + STATUS.enruta + '">🚚 En ruta</button>' +
            '<button type="button" class="btn btn-primary btn-sm" data-drawer-status="' + STATUS.entregado + '">✓ Entregado</button>' +
            '<button type="button" class="btn btn-ghost btn-sm" style="color:var(--blue-deep);border-color:var(--rule)" id="drawer-note">＋ Nota</button>' +
            '<button type="button" class="btn btn-danger btn-sm" data-drawer-status="' + STATUS.cancelado + '">✕ Cancelar</button>' +
          '</div>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="drawer-delete" style="width:100%;margin-top:8px;color:#991B1B;border-color:#F8D7DA">Eliminar pedido</button>' +
        '</div>' +

      '</div>';

    const drawer = ui.openDrawer(html);

    drawer.querySelector('[data-close-drawer]').addEventListener('click', ui.closeDrawer);

    // Al elegir una ruta se propone su repartidor.
    const routeSelect = drawer.querySelector('#drawer-route');
    const driverSelect = drawer.querySelector('#drawer-driver');
    routeSelect.addEventListener('change', () => {
      const r = state.routes.find(x => x.id === routeSelect.value);
      if (r && r.driverId && drivers.some(d => d.id === r.driverId)) driverSelect.value = r.driverId;
    });

    drawer.querySelector('#drawer-assign').addEventListener('click', async () => {
      const driverId = driverSelect.value || null;
      const driver = driverId ? driverById(driverId) : null;
      const route = state.routes.find(x => x.id === routeSelect.value) || null;
      const note = [route ? 'Ruta: ' + route.name : '', driver ? 'Asignado a ' + driver.name : 'Sin repartidor'].filter(Boolean).join(' · ');
      const events = (o.events || []).concat([{ type: 'asignado', at: U.nowIso(), by: state.admin.name, note: note }]);
      await store.upsert('orders', Object.assign({}, o, {
        driverId: driverId, driverName: driver ? driver.name : '',
        routeId: route ? route.id : null, routeName: route ? route.name : '',
        events: events
      }));
      ui.toast(driver ? 'Asignado a ' + driver.name + (route ? ' · ' + route.name : '') : 'Pedido sin asignar', 'success');
      ui.closeDrawer();
      await reload();
    });

    drawer.querySelectorAll('[data-drawer-status]').forEach(btn => {
      btn.addEventListener('click', async () => {
        ui.closeDrawer();
        await changeStatus(o.id, btn.dataset.drawerStatus);
      });
    });

    drawer.querySelector('#drawer-note').addEventListener('click', async () => {
      const note = await ui.prompt({
        title: 'Agregar nota al pedido',
        label: 'La nota queda en el seguimiento del pedido.',
        placeholder: 'Ej. El cliente pidió entregar después de las 3 pm',
        multiline: true
      });
      if (!note) return;
      const events = (o.events || []).concat([{ type: 'nota', at: U.nowIso(), by: state.admin.name, note: note }]);
      await store.upsert('orders', Object.assign({}, o, { events: events }));
      ui.closeDrawer();
      await reload();
      ui.toast('Nota agregada', 'success');
    });

    drawer.querySelector('#drawer-delete').addEventListener('click', async () => {
      const ok = await ui.confirm({
        title: 'Eliminar pedido',
        message: 'Se borrará ' + o.code + ' del historial. Esta acción no se puede deshacer.',
        confirmText: 'Eliminar',
        danger: true
      });
      if (!ok) return;
      await store.remove('orders', o.id);
      ui.closeDrawer();
      await reload();
      ui.toast('Pedido eliminado', 'success');
    });
  }

  // ==========================================================================
  // FORMULARIOS MODALES
  // ==========================================================================
  function openModal(options) {
    const host = document.getElementById('modal-host');
    const content = document.getElementById('modal-content');
    content.innerHTML =
      '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px">' +
        '<div><h3 style="margin:0;font-size:17px;color:var(--ink)">' + ui.esc(options.title) + '</h3>' +
        (options.subtitle ? '<p style="margin:4px 0 0;font-size:13px;color:var(--ink-soft)">' + ui.esc(options.subtitle) + '</p>' : '') +
        '</div>' +
        '<button type="button" class="drawer-close" data-modal-close>✕</button>' +
      '</div>' +
      '<form id="modal-form" novalidate>' + options.body +
        '<div class="ui-dialog-actions">' +
          '<button type="button" class="btn btn-ghost" data-modal-close>Cancelar</button>' +
          '<button type="submit" class="btn btn-primary">' + ui.esc(options.submitLabel || 'Guardar') + '</button>' +
        '</div>' +
      '</form>';

    host.style.display = 'grid';
    requestAnimationFrame(() => host.classList.add('is-open'));

    const onBackdrop = e => { if (e.target === host) close(); };
    const onKey = e => { if (e.key === 'Escape') close(); };

    const close = () => {
      if (!host.classList.contains('is-open')) return;
      host.classList.remove('is-open');
      document.removeEventListener('keydown', onKey);
      host.removeEventListener('click', onBackdrop);
      setTimeout(() => { host.style.display = 'none'; content.innerHTML = ''; }, 180);
    };

    content.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', close));
    host.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);

    const form = content.querySelector('#modal-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const result = await options.onSubmit(form);
      if (result !== false) close();
    });

    const first = form.querySelector('input, select, textarea');
    if (first) first.focus();

    return { close, form };
  }

  function field(id, label, opts) {
    const o = opts || {};
    const common = 'id="' + id + '"' + (o.required ? ' required' : '') + (o.placeholder ? ' placeholder="' + ui.esc(o.placeholder) + '"' : '');
    let control;
    if (o.type === 'select') {
      control = '<select ' + common + '>' + (o.options || []).map(op =>
        '<option value="' + ui.esc(op.value) + '"' + (op.selected ? ' selected' : '') + '>' + ui.esc(op.label) + '</option>'
      ).join('') + '</select>';
    } else if (o.type === 'textarea') {
      control = '<textarea ' + common + ' rows="' + (o.rows || 3) + '">' + ui.esc(o.value || '') + '</textarea>';
    } else {
      control = '<input type="' + (o.type || 'text') + '" ' + common +
        (o.value !== undefined ? ' value="' + ui.esc(o.value) + '"' : '') +
        (o.min !== undefined ? ' min="' + o.min + '"' : '') +
        (o.step !== undefined ? ' step="' + o.step + '"' : '') + '>';
    }
    return '<div class="form-field' + (o.full ? ' full' : '') + '">' +
      '<label for="' + id + '">' + ui.esc(label) + '</label>' + control +
      (o.hint ? '<span class="hint">' + ui.esc(o.hint) + '</span>' : '') +
    '</div>';
  }

  // ------------------------------ Pedido ------------------------------
  function openOrderForm() {
    const drivers = state.users.filter(u => u.role === 'driver' && u.active);
    const products = state.products.filter(p => p.active !== false);
    const lines = products.map(p =>
      '<label class="order-line">' +
        '<span class="order-line-info"><b>' + ui.esc(p.name) + '</b><small>' +
          U.formatMoney(p.price) + ' ' + ui.esc(p.unit || '') +
        '</small></span>' +
        '<input type="number" class="order-line-qty" min="0" step="1" inputmode="numeric" value="0"' +
          ' data-price="' + Number(p.price) + '" data-name="' + ui.esc(p.name) + '" data-id="' + ui.esc(p.id) + '"' +
          ' aria-label="Cantidad de ' + ui.esc(p.name) + '">' +
      '</label>'
    ).join('');

    const body = '<div class="form-grid">' +
      field('f-client', 'Cliente *', { required: true, placeholder: 'Ej. Tienda Doña Carmen', full: true }) +
      field('f-phone', 'Teléfono / WhatsApp *', { required: true, placeholder: 'Ej. 312 456 7890' }) +
      '<div class="form-field full">' +
        '<label>Productos del pedido</label>' +
        (products.length
          ? '<div class="order-lines">' + lines + '</div>' +
            '<span class="hint" id="f-lines-total">Escribe las cantidades y el total se calcula solo.</span>'
          : '<span class="hint">Todavía no hay productos activos. Créalos en «Productos» o escribe el total a mano.</span>') +
      '</div>' +
      field('f-items', 'Detalle del pedido *', { required: true, placeholder: 'Ej. 3 Pacas 250ml + 2 Pacas 3L', full: true }) +
      field('f-total', 'Total (COP) *', { required: true, type: 'number', min: 0, step: 500, placeholder: '16000', hint: 'Se calcula solo con las cantidades; puedes ajustarlo.' }) +
      field('f-address', 'Dirección de entrega', { placeholder: 'Ej. Calle 4 # 12-30, Bajo Grande', full: true }) +
      field('f-driver', 'Repartidor', {
        type: 'select',
        options: [{ value: '', label: 'Sin asignar' }].concat(drivers.map(d => ({ value: d.id, label: d.name })))
      }) +
      field('f-payment', 'Forma de pago', {
        type: 'select',
        options: [
          { value: 'Efectivo', label: 'Efectivo' },
          { value: 'Transferencia', label: 'Transferencia' },
          { value: 'Nequi', label: 'Nequi' },
          { value: 'Contra entrega', label: 'Contra entrega' }
        ]
      }) +
      field('f-notes', 'Notas para el repartidor', { type: 'textarea', rows: 2, full: true, placeholder: 'Ej. Llamar al llegar, portón negro' }) +
    '</div>';

    const modal = openModal({
      title: 'Nuevo pedido',
      subtitle: 'Registra un pedido tomado por teléfono o WhatsApp.',
      submitLabel: 'Crear pedido',
      body: body,
      onSubmit: async form => {
        const driverId = form.querySelector('#f-driver').value || null;
        const driver = driverId ? driverById(driverId) : null;
        const now = U.nowIso();
        const code = store.newOrderCode();
        const lines = [];
        form.querySelectorAll('.order-line-qty').forEach(input => {
          const qty = Math.max(0, Math.floor(Number(input.value) || 0));
          if (qty > 0) lines.push({ id: input.dataset.id, name: input.dataset.name, qty: qty, price: Number(input.dataset.price) || 0 });
        });
        const order = {
          id: code,
          code: code,
          lines: lines,
          client: form.querySelector('#f-client').value.trim(),
          phone: form.querySelector('#f-phone').value.trim(),
          address: form.querySelector('#f-address').value.trim(),
          items: form.querySelector('#f-items').value.trim(),
          total: Number(form.querySelector('#f-total').value || 0),
          status: STATUS.pendiente,
          createdAt: now,
          date: U.formatDateTime(now),
          driverId: driverId,
          driverName: driver ? driver.name : '',
          payment: form.querySelector('#f-payment').value,
          paid: false,
          notes: form.querySelector('#f-notes').value.trim(),
          events: [{ type: 'creado', at: now, by: state.admin.name, note: 'Registrado manualmente' }]
        };
        if (driver) order.events.push({ type: 'asignado', at: now, by: state.admin.name, note: 'Asignado a ' + driver.name });
        await store.upsert('orders', order);
        await reload();
        goto('pedidos');
        ui.toast('Pedido creado para ' + order.client, 'success');
      }
    });

    // Total automático: cantidad × precio del catálogo.
    const form = modal.form;
    const qtyInputs = form.querySelectorAll('.order-line-qty');
    const totalInput = form.querySelector('#f-total');
    const itemsInput = form.querySelector('#f-items');
    const linesTotal = form.querySelector('#f-lines-total');

    const recalc = () => {
      let total = 0;
      const parts = [];
      qtyInputs.forEach(input => {
        const qty = Math.max(0, Math.floor(Number(input.value) || 0));
        const price = Number(input.dataset.price) || 0;
        if (qty > 0) {
          total += qty * price;
          parts.push(qty + ' × ' + input.dataset.name);
        }
      });
      if (!parts.length) {
        if (linesTotal) linesTotal.textContent = 'Escribe las cantidades y el total se calcula solo.';
        return;
      }
      totalInput.value = String(total);
      itemsInput.value = parts.join(', ');
      if (linesTotal) linesTotal.textContent = 'Total calculado: ' + U.formatMoney(total);
    };

    qtyInputs.forEach(input => input.addEventListener('input', recalc));
  }

  // ------------------------------ Producto ------------------------------
  function bindProductActions() {
    document.getElementById('btn-new-product').addEventListener('click', () => openProductForm());
  }

  function openProductForm(product) {
    const p = product || {};
    const submitLabel = product ? 'Guardar cambios' : 'Crear producto';
    const body = '<div class="form-grid">' +
      field('f-name', 'Nombre del producto *', { required: true, full: true, value: p.name || '', placeholder: 'Ej. Paca de agua 250 ml' }) +
      field('f-price', 'Precio (COP) *', { required: true, type: 'number', min: 0, step: 500, value: p.price || '' }) +
      field('f-unit', 'Etiqueta de precio', { value: p.unit || '', placeholder: 'Ej. / paca de 250ml' }) +
      field('f-badge', 'Distintivo', { value: p.badge || '', placeholder: 'Ej. Venta por Paca' }) +
      field('f-status', 'Estado', {
        type: 'select',
        options: [
          { value: 'true', label: 'Activo / Disponible', selected: p.active !== false },
          { value: 'false', label: 'Agotado / Inactivo', selected: p.active === false }
        ]
      }) +
      field('f-stock-track', 'Controlar inventario', {
        type: 'select',
        options: [
          { value: 'si', label: 'Sí, llevar el stock', selected: typeof p.stock === 'number' },
          { value: 'no', label: 'No', selected: typeof p.stock !== 'number' }
        ]
      }) +
      field('f-min', 'Stock mínimo (alerta)', { type: 'number', min: 0, step: 1, value: p.minStock !== undefined ? p.minStock : 10 }) +
      (product ? '' : field('f-stock', 'Stock inicial', { type: 'number', min: 0, step: 1, value: 0, hint: 'Después se ajusta en Inventario.' })) +
      field('f-desc', 'Descripción', { type: 'textarea', rows: 3, full: true, value: p.desc || '' }) +
      '<div class="form-field full">' +
        '<label for="f-image-choose">Imagen del producto</label>' +
        '<div class="image-picker">' +
          '<img id="f-image-preview" class="image-preview" src="' + ui.esc(safeImage(p.image)) + '" alt="Vista previa de la imagen">' +
          '<div class="image-picker-body">' +
            '<input id="f-image-file" type="file" accept="image/*" hidden>' +
            '<div class="image-picker-actions">' +
              '<button type="button" class="btn btn-ghost btn-sm" id="f-image-choose">📷 Subir imagen</button>' +
              '<span class="hint" id="f-image-hint">JPG, PNG o WEBP · máximo 5 MB</span>' +
            '</div>' +
            '<input id="f-image" type="text" value="' + ui.esc(p.image || '') + '" placeholder="o pega un enlace: https://...">' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    const modal = openModal({
      title: product ? 'Editar producto' : 'Nuevo producto',
      submitLabel: submitLabel,
      body: body,
      onSubmit: async form => {
        const submitBtn = form.querySelector('button[type="submit"]');
        const fileInput = form.querySelector('#f-image-file');
        const urlInput = form.querySelector('#f-image');
        const restore = () => {
          if (!submitBtn) return;
          submitBtn.disabled = false;
          submitBtn.textContent = submitLabel;
        };

        let image = urlInput.value.trim();
        const file = fileInput.files && fileInput.files[0];
        try {
          if (file) {
            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.textContent = 'Subiendo imagen…';
            }
            image = await store.uploadImage(file);
          }
        } catch (err) {
          restore();
          ui.toast(err.message || 'No se pudo subir la imagen', 'error');
          return false;
        }

        const track = form.querySelector('#f-stock-track').value === 'si';
        const stockInput = form.querySelector('#f-stock');
        const initialStock = stockInput ? Math.max(0, Math.floor(Number(stockInput.value) || 0)) : 0;
        // Se conservan los campos existentes (por ejemplo, el stock actual).
        const record = Object.assign({}, product || {}, {
          id: product ? product.id : 'prod_' + Date.now(),
          minStock: Math.max(0, Math.floor(Number(form.querySelector('#f-min').value) || 0)),
          name: form.querySelector('#f-name').value.trim(),
          price: Number(form.querySelector('#f-price').value || 0),
          unit: form.querySelector('#f-unit').value.trim(),
          badge: form.querySelector('#f-badge').value.trim() || 'General',
          active: form.querySelector('#f-status').value === 'true',
          desc: form.querySelector('#f-desc').value.trim(),
          image: image || 'assets/bolsa-250ml.jpg'
        });
        if (track && typeof record.stock !== 'number') record.stock = initialStock;
        if (!track) delete record.stock;

        try {
          await store.upsert('products', record);
        } catch (err) {
          restore();
          ui.toast('No se pudo guardar el producto. Revisa la conexión.', 'error');
          return false;
        }

        await reload();
        ui.toast(product ? 'Producto actualizado' : 'Producto creado', 'success');
        return true;
      }
    });

    const form = modal.form;
    const preview = form.querySelector('#f-image-preview');
    const fileInput = form.querySelector('#f-image-file');
    const urlInput = form.querySelector('#f-image');
    const hint = form.querySelector('#f-image-hint');

    form.querySelector('#f-image-choose').addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      if (!/^image\//i.test(file.type)) {
        ui.toast('Selecciona un archivo de imagen', 'error');
        fileInput.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        ui.toast('La imagen no puede pesar más de 5 MB', 'error');
        fileInput.value = '';
        return;
      }
      if (preview) preview.src = URL.createObjectURL(file);
      if (hint) hint.textContent = 'Lista para subir: ' + file.name;
    });

    urlInput.addEventListener('input', () => {
      const value = urlInput.value.trim();
      if (value) {
        fileInput.value = '';
        if (preview) preview.src = safeImage(value);
        if (hint) hint.textContent = 'JPG, PNG o WEBP · máximo 5 MB';
      }
    });
  }

  function renderProducts() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    if (!state.products.length) {
      grid.innerHTML = ui.emptyState('Sin productos', 'Crea el primero para que aparezca en la tienda.', '📦');
      return;
    }

    grid.innerHTML = state.products.map((p, i) =>
      '<article class="product-card">' +
        '<img src="' + ui.esc(safeImage(p.image)) + '" alt="' + ui.esc(p.name) + '" loading="lazy">' +
        '<div class="product-card-body">' +
          '<h4>' + ui.esc(p.name) + '</h4>' +
          '<p>' + ui.esc(p.desc || 'Sin descripción') + '</p>' +
          '<div class="product-price">' + U.formatMoney(p.price) + ' <small>' + ui.esc(p.unit || '') + '</small></div>' +
          '<div class="product-card-foot">' +
            '<label class="switch"><input type="checkbox" data-toggle-product="' + i + '"' + (p.active ? ' checked' : '') + '><span class="track"></span>' + (p.active ? 'Activo' : 'Agotado') + '</label>' +
            '<div style="display:flex;gap:6px">' +
              '<button type="button" class="btn btn-ghost btn-sm" data-edit-product="' + i + '" style="color:var(--blue-deep);border-color:var(--rule)">Editar</button>' +
              '<button type="button" class="btn btn-danger btn-sm" data-del-product="' + i + '">🗑️</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</article>'
    ).join('');

    grid.querySelectorAll('[data-edit-product]').forEach(btn => {
      btn.addEventListener('click', () => openProductForm(state.products[Number(btn.dataset.editProduct)]));
    });

    grid.querySelectorAll('[data-del-product]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const p = state.products[Number(btn.dataset.delProduct)];
        const ok = await ui.confirm({
          title: 'Eliminar producto',
          message: 'Se quitará "' + p.name + '" del catálogo de la tienda.',
          confirmText: 'Eliminar',
          danger: true
        });
        if (!ok) return;
        await store.remove('products', p.id);
        await reload();
        ui.toast('Producto eliminado', 'success');
      });
    });

    grid.querySelectorAll('[data-toggle-product]').forEach(input => {
      input.addEventListener('change', async () => {
        const p = state.products[Number(input.dataset.toggleProduct)];
        await store.upsert('products', Object.assign({}, p, { active: input.checked }));
        await reload();
        ui.toast(p.name + (input.checked ? ' activado' : ' marcado como agotado'), 'success');
      });
    });
  }

  // ------------------------------ Repartidor ------------------------------
  const DRIVER_COLORS = ['#1C7FA8', '#C68A3D', '#1E824C', '#7C3AED', '#C0392B', '#0F766E'];

  function bindDriverActions() {
    document.getElementById('btn-new-driver').addEventListener('click', () => openDriverForm());
  }

  function openDriverForm(driver) {
    const d = driver || {};
    const cloud = !!(store && store.isCloud && store.isCloud());
    const minPass = 8;

    // En la nube, cada persona cambia su propia contraseña desde «Mi cuenta».
    const passwordField = (cloud && driver)
      ? '<div class="form-field full"><span class="hint">🔒 La contraseña la cambia el repartidor desde «Mi cuenta» en su panel.</span></div>'
      : field('f-dpass', driver ? 'Nueva contraseña' : 'Contraseña *', {
        required: !driver,
        type: 'text',
        placeholder: driver ? 'Dejar vacío para no cambiar' : 'Mínimo ' + minPass + ' caracteres',
        full: true
      });

    const body = '<div class="form-grid">' +
      field('f-dname', 'Nombre completo *', { required: true, full: true, value: d.name || '', placeholder: 'Ej. Carlos Gómez' }) +
      field('f-dusername', 'Usuario de acceso *', {
        required: true, value: d.username || '', placeholder: 'Ej. carlos',
        hint: 'Sin espacios ni mayúsculas. Con este usuario entra el repartidor.'
      }) +
      field('f-dphone', 'Teléfono', { value: d.phone || '', placeholder: 'Ej. 305 413 6677' }) +
      field('f-demail', 'Correo personal (opcional)', {
        type: 'email',
        value: d.email || '',
        placeholder: 'Ej. carlos@gmail.com',
        hint: 'Servirá para recuperar el acceso y enviar avisos.'
      }) +
      passwordField +
      field('f-dactive', 'Estado', {
        type: 'select',
        options: [
          { value: 'true', label: 'Activo (puede entrar)', selected: d.active !== false },
          { value: 'false', label: 'Desactivado (no puede entrar)', selected: d.active === false }
        ]
      }) +
      field('f-dcolor', 'Color del equipo', {
        type: 'select',
        options: DRIVER_COLORS.map(c => ({ value: c, label: c, selected: (d.color || '') === c }))
      }) +
    '</div>';

    openModal({
      title: driver ? 'Editar repartidor' : 'Nuevo repartidor',
      subtitle: 'El repartidor usará este usuario en el panel de reparto.',
      submitLabel: driver ? 'Guardar cambios' : 'Crear repartidor',
      body: body,
      onSubmit: async form => {
        const username = form.querySelector('#f-dusername').value.trim().toLowerCase();
        const exists = state.users.some(u => u.username === username && (!driver || u.id !== driver.id));
        if (exists) {
          ui.toast('Ese usuario ya está en uso', 'error');
          return false;
        }

        const passInput = form.querySelector('#f-dpass');
        const pass = passInput ? passInput.value : '';
        if (!driver && pass.length < minPass) {
          ui.toast('La contraseña debe tener al menos ' + minPass + ' caracteres', 'error');
          return false;
        }
        if (pass && store.passwordIssue) {
          const issue = store.passwordIssue(pass);
          if (issue) { ui.toast(issue, 'error'); return false; }
        }

        const name = form.querySelector('#f-dname').value.trim();
        const phone = form.querySelector('#f-dphone').value.trim();
        const email = form.querySelector('#f-demail').value.trim();
        const color = form.querySelector('#f-dcolor').value;
        const active = form.querySelector('#f-dactive').value === 'true';

        // En la nube, crear la cuenta real de acceso (Supabase Auth) + su ficha.
        if (cloud && !driver) {
          const created = await store.createStaffAccount({
            username: username,
            name: name,
            phone: phone,
            email: email,
            password: pass,
            role: 'driver',
            color: color,
            active: active
          });
          if (!created.ok) {
            ui.toast(created.error, 'error');
            return false;
          }
          await reload();
          ui.toast('Repartidor creado. Ya puede entrar con su usuario.', 'success');
          return;
        }

        const record = {
          id: driver ? driver.id : store.uid('u'),
          role: 'driver',
          name: name,
          username: username,
          phone: phone,
          email: email,
          active: active,
          color: color,
          hash: driver ? driver.hash : '',
          createdAt: driver ? driver.createdAt : U.nowIso()
        };
        if (pass) record.hash = await store.hashPassword(pass);
        await store.upsert('users', record);
        await reload();
        ui.toast(driver ? 'Repartidor actualizado' : 'Repartidor creado', 'success');
      }
    });
  }

  function openResetDriverForm(driver) {
    const body = '<div class="form-grid">' +
      '<div class="form-field full"><span class="hint">Se asignará una contraseña nueva a ' +
        ui.esc(driver.name) + ' y se desactivará su verificación en dos pasos. ' +
        'Comunícale la contraseña por un medio seguro.</span></div>' +
      field('f-reset-pass', 'Contraseña nueva *', {
        required: true, type: 'text', placeholder: 'Mínimo 8 caracteres', full: true
      }) +
      field('f-reset-repeat', 'Repetir contraseña *', {
        required: true, type: 'text', placeholder: 'Repite la contraseña', full: true
      }) +
    '</div>';

    openModal({
      title: 'Restablecer acceso',
      subtitle: 'Para cuando el repartidor olvida su contraseña.',
      submitLabel: 'Restablecer',
      body: body,
      onSubmit: async form => {
        const pass = form.querySelector('#f-reset-pass').value;
        const repeat = form.querySelector('#f-reset-repeat').value;
        if (pass !== repeat) {
          ui.toast('Las contraseñas no coinciden', 'error');
          return false;
        }
        if (pass.length < 8) {
          ui.toast('La contraseña debe tener al menos 8 caracteres', 'error');
          return false;
        }
        const result = await store.adminResetStaff(driver.id, pass);
        if (!result.ok) {
          ui.toast(result.error || 'No se pudo restablecer el acceso.', 'error');
          return false;
        }
        ui.toast('Acceso restablecido. Comunica la contraseña a ' + driver.name + '.', 'success');
      }
    });
  }

  function renderDrivers() {
    const grid = document.getElementById('drivers-grid');
    if (!grid) return;
    const drivers = state.users.filter(u => u.role === 'driver');

    if (!drivers.length) {
      grid.innerHTML = ui.emptyState('Sin repartidores', 'Crea el primero para poder asignar pedidos.', '🛵');
      return;
    }

    grid.innerHTML = drivers.map(d => {
      const assigned = state.orders.filter(o => o.driverId === d.id && (o.status === STATUS.pendiente || o.status === STATUS.enruta));
      const todayDone = state.orders.filter(o => o.driverId === d.id && o.status === STATUS.entregado && isToday(o.createdAt));
      return '<article class="driver-card' + (d.active ? '' : ' is-off') + '">' +
        '<div class="driver-card-head">' +
          '<div class="avatar" style="background:' + driverColor(d) + '">' + ui.esc(ui.initials(d.name)) + '</div>' +
          '<div style="min-width:0">' +
            '<h4>' + ui.esc(d.name) + '</h4>' +
            '<small>' + (d.active ? '● Activo' : '● Desactivado') + (d.phone ? ' · ' + ui.esc(d.phone) : '') + '</small>' +
          '</div>' +
        '</div>' +
        '<div class="driver-stats">' +
          '<div class="driver-stat"><b>' + assigned.length + '</b><span>Activos</span></div>' +
          '<div class="driver-stat"><b>' + todayDone.length + '</b><span>Hoy</span></div>' +
          '<div class="driver-stat"><b>' + U.formatMoney(todayDone.reduce((s, o) => s + o.total, 0)) + '</b><span>Cobrado</span></div>' +
        '</div>' +
        '<div class="cred-box">' +
          '<span>Usuario: <code>' + ui.esc(d.username) + '</code></span>' +
        '</div>' +
        '<div class="driver-card-foot">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-edit-driver="' + ui.esc(d.id) + '" style="color:var(--blue-deep);border-color:var(--rule)">Editar</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-see-driver="' + ui.esc(d.id) + '" style="color:var(--blue-deep);border-color:var(--rule)">Ver pedidos</button>' +
          (store.isCloud && store.isCloud()
            ? '<button type="button" class="btn btn-ghost btn-sm" data-reset-driver="' + ui.esc(d.id) + '" style="color:var(--blue-deep);border-color:var(--rule)">Restablecer acceso</button>'
            : '') +
          '<button type="button" class="btn btn-danger btn-sm" data-del-driver="' + ui.esc(d.id) + '" style="margin-left:auto">🗑️</button>' +
        '</div>' +
      '</article>';
    }).join('');

    grid.querySelectorAll('[data-edit-driver]').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = state.users.find(u => u.id === btn.dataset.editDriver);
        if (d) openDriverForm(d);
      });
    });

    grid.querySelectorAll('[data-reset-driver]').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = state.users.find(u => u.id === btn.dataset.resetDriver);
        if (d) openResetDriverForm(d);
      });
    });

    grid.querySelectorAll('[data-see-driver]').forEach(btn => {
      btn.addEventListener('click', () => {
        const d = state.users.find(u => u.id === btn.dataset.seeDriver);
        if (!d) return;
        state.search = d.name;
        state.range = 'todos';
        document.querySelectorAll('#orders-range button').forEach(b => b.classList.toggle('active', b.dataset.range === 'todos'));
        document.getElementById('orders-search').value = d.name;
        renderKanban();
        goto('pedidos');
      });
    });

    grid.querySelectorAll('[data-del-driver]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const d = state.users.find(u => u.id === btn.dataset.delDriver);
        const assigned = state.orders.filter(o => o.driverId === d.id && (o.status === STATUS.pendiente || o.status === STATUS.enruta));
        const cloud = !!(store && store.isCloud && store.isCloud());
        const ok = await ui.confirm({
          title: cloud ? 'Desactivar repartidor' : 'Eliminar repartidor',
          message: (assigned.length
            ? d.name + ' tiene ' + assigned.length + ' pedido(s) activo(s). Quedarán sin asignar.'
            : (cloud ? 'Se desactivará el acceso de ' + d.name + '.' : 'Se eliminará la cuenta de ' + d.name + '.')) +
            (cloud ? ' Podrás reactivarlo cuando quieras con «Editar».' : ''),
          confirmText: cloud ? 'Desactivar' : 'Eliminar',
          danger: true
        });
        if (!ok) return;
        for (const order of assigned) {
          await store.upsert('orders', Object.assign({}, order, { driverId: null, driverName: '' }));
        }
        if (cloud) {
          // No se borra la cuenta de acceso: se desactiva para poder reactivarla.
          await store.upsert('users', Object.assign({}, d, { active: false }));
          await reload();
          ui.toast('Cuenta desactivada. Puedes reactivarla con «Editar».', 'success');
          return;
        }
        await store.remove('users', d.id);
        await reload();
        ui.toast('Repartidor eliminado', 'success');
      });
    });
  }

  // ------------------------------ Rutas ------------------------------
  function bindRouteActions() {
    document.getElementById('btn-new-route').addEventListener('click', () => openRouteForm());
  }

  function openRouteForm(route) {
    const r = route || {};
    const drivers = state.users.filter(u => u.role === 'driver');
    const body = '<div class="form-grid">' +
      field('f-rname', 'Nombre de la ruta / zona *', { required: true, full: true, value: r.name || '', placeholder: 'Ej. Sector La Loma y El Crucero' }) +
      field('f-rdriver', 'Repartidor responsable', {
        type: 'select',
        options: [{ value: '', label: 'Sin asignar' }].concat(drivers.map(d => ({ value: d.id, label: d.name, selected: r.driverId === d.id })))
      }) +
      field('f-rtime', 'Horario estimado', { value: r.time || '', placeholder: 'Ej. 2:00 PM - 5:00 PM' }) +
      field('f-rstatus', 'Estado', {
        type: 'select',
        options: ['Programada', 'En ruta', 'Completada'].map(s => ({ value: s, label: s, selected: (r.status || 'Programada') === s }))
      }) +
      field('f-rnotes', 'Observaciones', { type: 'textarea', rows: 2, full: true, value: r.notes || '' }) +
    '</div>';

    openModal({
      title: route ? 'Editar ruta' : 'Nueva ruta',
      submitLabel: route ? 'Guardar cambios' : 'Crear ruta',
      body: body,
      onSubmit: async form => {
        await store.upsert('routes', {
          id: route ? route.id : store.uid('R'),
          name: form.querySelector('#f-rname').value.trim(),
          driverId: form.querySelector('#f-rdriver').value || null,
          time: form.querySelector('#f-rtime').value.trim(),
          status: form.querySelector('#f-rstatus').value,
          notes: form.querySelector('#f-rnotes').value.trim()
        });
        await reload();
        ui.toast(route ? 'Ruta actualizada' : 'Ruta creada', 'success');
      }
    });
  }

  function renderRoutes() {
    const grid = document.getElementById('routes-grid');
    if (!grid) return;
    if (!state.routes.length) {
      grid.innerHTML = ui.emptyState('Sin rutas', 'Programa la primera ruta de reparto.', '🗺️');
      return;
    }

    grid.innerHTML = state.routes.map(r => {
      const d = driverById(r.driverId);
      const orders = state.orders.filter(o => d && o.driverId === d.id && (o.status === STATUS.pendiente || o.status === STATUS.enruta));
      return '<article class="driver-card">' +
        '<div class="driver-card-head">' +
          '<div class="avatar" style="background:' + (d ? driverColor(d) : '#94A3B8') + '">' + ui.esc(d ? ui.initials(d.name) : '—') + '</div>' +
          '<div><h4>' + ui.esc(r.name) + '</h4><small>' + ui.esc(r.time || 'Sin horario') + '</small></div>' +
        '</div>' +
        '<div class="driver-stats">' +
          '<div class="driver-stat"><b>' + (d ? ui.esc(d.name.split(' ')[0]) : '—') + '</b><span>Repartidor</span></div>' +
          '<div class="driver-stat"><b>' + orders.length + '</b><span>Pedidos</span></div>' +
          '<div class="driver-stat"><b>' + ui.esc(r.status) + '</b><span>Estado</span></div>' +
        '</div>' +
        (r.notes ? '<p style="margin:0 0 10px;font-size:12.5px;color:var(--ink-soft)">' + ui.esc(r.notes) + '</p>' : '') +
        '<div class="driver-card-foot">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-edit-route="' + ui.esc(r.id) + '" style="color:var(--blue-deep);border-color:var(--rule)">Editar</button>' +
          '<button type="button" class="btn btn-danger btn-sm" data-del-route="' + ui.esc(r.id) + '" style="margin-left:auto">🗑️</button>' +
        '</div>' +
      '</article>';
    }).join('');

    grid.querySelectorAll('[data-edit-route]').forEach(btn => {
      btn.addEventListener('click', () => {
        const r = state.routes.find(x => x.id === btn.dataset.editRoute);
        if (r) openRouteForm(r);
      });
    });

    grid.querySelectorAll('[data-del-route]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await ui.confirm({ title: 'Eliminar ruta', message: 'Se quitará esta ruta del listado.', confirmText: 'Eliminar', danger: true });
        if (!ok) return;
        await store.remove('routes', btn.dataset.delRoute);
        await reload();
        ui.toast('Ruta eliminada', 'success');
      });
    });
  }

  // ------------------------------ PQRS ------------------------------
  function bindPqrsActions() {
    document.querySelectorAll('#pqrs-filter button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#pqrs-filter button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.pqrsFilter = btn.dataset.status;
        renderPqrs();
      });
    });
  }

  function renderPqrs() {
    const body = document.getElementById('pqrs-body');
    if (!body) return;

    const list = state.pqrs.filter(p => state.pqrsFilter === 'todas' || (p.status || 'Nueva') === state.pqrsFilter);

    if (!list.length) {
      body.innerHTML = '<tr><td colspan="7">' + ui.emptyState('Sin mensajes', 'Aquí aparecerán las quejas y sugerencias de los clientes.', '💬') + '</td></tr>';
      return;
    }

    body.innerHTML = list.map(p => {
      const phone = String(p.contact || '').replace(/\D/g, '');
      const wa = phone ? 'https://api.whatsapp.com/send?phone=57' + phone.replace(/^57/, '') + '&text=' + encodeURIComponent('Hola ' + p.name + ', te escribimos de Agua Magaly sobre tu solicitud.') : '';
      return '<tr>' +
        '<td><strong>' + ui.esc(p.type || 'Solicitud') + '</strong></td>' +
        '<td>' + ui.esc(p.name || 'Anónimo') + '</td>' +
        '<td>' + ui.esc(p.contact || '—') + '</td>' +
        '<td class="msg-cell">' + ui.esc(p.message || '') + '</td>' +
        '<td style="white-space:nowrap">' + ui.esc(p.date || '—') + '</td>' +
        '<td><span class="pill ' + ((p.status === 'Atendida') ? 'pill-entregado' : 'pill-pendiente') + '">● ' + ui.esc(p.status || 'Nueva') + '</span></td>' +
        '<td style="text-align:right;white-space:nowrap">' +
          (wa ? '<a class="btn btn-success btn-sm" href="' + wa + '" target="_blank" rel="noopener">Responder</a> ' : '') +
          (p.status !== 'Atendida' ? '<button type="button" class="btn btn-ghost btn-sm" data-attend-pqrs="' + ui.esc(p.id) + '" style="color:var(--blue-deep);border-color:var(--rule)">Marcar atendida</button>' : '') +
        '</td>' +
      '</tr>';
    }).join('');

    body.querySelectorAll('[data-attend-pqrs]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const p = state.pqrs.find(x => x.id === btn.dataset.attendPqrs);
        await store.upsert('pqrs', Object.assign({}, p, { status: 'Atendida' }));
        await reload();
        ui.toast('Marcada como atendida', 'success');
      });
    });
  }

  // ------------------------------ Mi cuenta ------------------------------
  const twofa = {
    loaded: false,
    loading: false,
    status: null,
    view: 'status',          // status | pending | codes
    pendingEmail: '',
    pendingMasked: '',
    recoveryCodes: []
  };

  // Puerta obligatoria del primer inicio de sesión del administrador.
  const gate = {
    open: false,
    step: 'email',           // email | code | codes
    email: '',
    masked: '',
    codes: []
  };

  /**
   * En producción, el administrador no puede usar el panel sin activar la
   * verificación en dos pasos. Si el servicio aún no está desplegado, se
   * permite entrar pero se muestra un aviso persistente.
   */
  async function maybeRequireTwofa() {
    if (!(store && store.isCloud && store.isCloud())) return;

    let result = null;
    try {
      result = await store.twofaStatus();
    } catch (err) {
      result = { ok: false, unavailable: true };
    }

    const banner = document.getElementById('security-banner');

    if (!result || !result.ok) {
      if (banner) banner.style.display = 'flex';
      return;
    }

    if (banner) banner.style.display = 'none';

    if (!result.enabled) openTwofaGate();
  }

  function openTwofaGate() {
    const host = document.getElementById('twofa-gate');
    if (!host || gate.open) return;
    gate.open = true;
    gate.step = 'email';
    gate.codes = [];
    host.style.display = 'grid';
    document.body.classList.add('has-twofa-gate');
    paintGate();
  }

  function closeTwofaGate() {
    const host = document.getElementById('twofa-gate');
    gate.open = false;
    if (host) host.style.display = 'none';
    document.body.classList.remove('has-twofa-gate');
    const banner = document.getElementById('security-banner');
    if (banner) banner.style.display = 'none';
    twofa.loaded = false;
    ensureTwofa();
  }

  function gateError(message) {
    const box = document.getElementById('gate-error');
    if (!box) return;
    if (!message) {
      box.style.display = 'none';
      box.textContent = '';
      return;
    }
    box.textContent = message;
    box.style.display = 'block';
  }

  function paintGate() {
    const box = document.getElementById('twofa-gate-body');
    if (!box) return;
    gateError('');

    if (gate.step === 'code') {
      box.innerHTML =
        '<h2 id="twofa-gate-title">Revisa tu correo</h2>' +
        '<p class="twofa-gate-lead">Enviamos un código de 6 dígitos a <b>' +
          ui.esc(gate.masked || 'tu correo personal') + '</b>. Vence en 10 minutos.</p>' +
        '<div id="gate-error" class="twofa-gate-error"></div>' +
        '<form id="gate-code-form" class="form-grid">' +
          '<div class="form-field full">' +
            '<label for="gate-code">Código de 6 dígitos</label>' +
            '<input id="gate-code" class="code-input" type="text" inputmode="numeric" ' +
              'maxlength="6" autocomplete="one-time-code" placeholder="000000" required>' +
          '</div>' +
          '<div class="full">' +
            '<button type="submit" class="btn btn-primary" style="width:100%">Activar y entrar al panel</button>' +
          '</div>' +
        '</form>' +
        '<details class="twofa-details">' +
          '<summary>¿No te llegó? Reenviar código</summary>' +
          '<form id="gate-resend-form" class="form-grid">' +
            '<div class="form-field full">' +
              '<label for="gate-resend-pass">Contraseña actual</label>' +
              '<input id="gate-resend-pass" type="password" autocomplete="current-password" required>' +
            '</div>' +
            '<div class="full">' +
              '<button type="submit" class="btn btn-ghost" style="width:100%">Reenviar código</button>' +
            '</div>' +
          '</form>' +
        '</details>' +
        '<div class="login-step-actions">' +
          '<button type="button" class="link-button" data-gate="back">Cambiar correo</button>' +
        '</div>';
      const input = document.getElementById('gate-code');
      if (input) input.focus();
      return;
    }

    if (gate.step === 'codes') {
      const list = gate.codes.map(c => ui.esc(c)).join('\n');
      box.innerHTML =
        '<h2 id="twofa-gate-title">Guarda tus códigos</h2>' +
        '<p class="twofa-gate-lead">Estos 10 códigos te permiten recuperar el acceso si ' +
          'pierdes el correo. Cada uno sirve una sola vez y no se volverán a mostrar.</p>' +
        '<div id="gate-error" class="twofa-gate-error"></div>' +
        '<div class="twofa-codes">' +
          '<pre id="gate-code-list">' + list + '</pre>' +
          '<div class="login-step-actions">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-gate="download">Descargar</button>' +
            '<button type="button" class="btn btn-primary btn-sm" data-gate="finish">Ya los guardé</button>' +
          '</div>' +
        '</div>' +
        '<p class="twofa-gate-note">Guárdalos en un lugar seguro, por ejemplo en tu celular o impresos.</p>';
      return;
    }

    box.innerHTML =
      '<h2 id="twofa-gate-title">Protege tu cuenta</h2>' +
      '<p class="twofa-gate-lead">Antes de usar el panel, activa la verificación en dos pasos. ' +
        'Te enviaremos un código de 6 dígitos a tu correo personal.</p>' +
      '<div id="gate-error" class="twofa-gate-error"></div>' +
      '<form id="gate-email-form" class="form-grid">' +
        '<div class="form-field full">' +
          '<label for="gate-email">Correo personal</label>' +
          '<input id="gate-email" type="email" placeholder="tucorreo@gmail.com" ' +
            'autocomplete="email" value="' + ui.esc(gate.email || '') + '" required>' +
          '<span class="hint">Aquí llegarán los códigos. No uses el correo interno @aguamagaly.app.</span>' +
        '</div>' +
        '<div class="form-field full">' +
          '<label for="gate-pass">Contraseña actual</label>' +
          '<input id="gate-pass" type="password" autocomplete="current-password" required>' +
        '</div>' +
        '<div class="full">' +
          '<button type="submit" class="btn btn-primary" style="width:100%">Enviar código</button>' +
        '</div>' +
      '</form>' +
      '<p class="twofa-gate-note">Solo se pide una vez. Después entrarás con contraseña + código.</p>';
    const emailInput = document.getElementById('gate-email');
    if (emailInput && !gate.email) emailInput.focus();
  }

  function bindTwofaGate() {
    const host = document.getElementById('twofa-gate');
    if (!host) return;

    host.addEventListener('submit', onGateSubmit);
    host.addEventListener('click', onGateClick);

    const logoutBtn = document.getElementById('twofa-gate-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => window.MagalyAuth.logout());
    }

    // La puerta no se puede cerrar con Escape: solo activando 2FA o saliendo.
    document.addEventListener('keydown', e => {
      if (gate.open && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  }

  async function onGateSubmit(e) {
    const form = e.target;
    if (!form || !form.id) return;
    e.preventDefault();
    gateError('');

    if (form.id === 'gate-email-form') {
      const email = (document.getElementById('gate-email').value || '').trim().toLowerCase();
      const pass = document.getElementById('gate-pass').value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        gateError('Escribe un correo personal válido.');
        return;
      }
      if (/@aguamagaly\.app$/i.test(email)) {
        gateError('Usa tu correo personal, no el correo interno de Agua Magaly.');
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      twofaBusy(btn, true, 'Enviando…');
      const result = await store.twofaSetupStart(email, pass);
      twofaBusy(btn, false);
      if (!result.ok) {
        gateError(result.error || 'No se pudo enviar el código. Inténtalo de nuevo.');
        return;
      }
      gate.email = email;
      gate.masked = result.emailMasked || email;
      gate.step = 'code';
      paintGate();
      return;
    }

    if (form.id === 'gate-code-form') {
      const code = (document.getElementById('gate-code').value || '').replace(/\D/g, '');
      if (code.length !== 6) {
        gateError('Escribe los 6 dígitos del código.');
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      twofaBusy(btn, true, 'Verificando…');
      const result = await store.twofaSetupVerify(code);
      twofaBusy(btn, false);
      if (!result.ok) {
        gateError(result.error || 'Código incorrecto.');
        return;
      }
      gate.codes = Array.isArray(result.recoveryCodes) ? result.recoveryCodes : [];
      gate.step = 'codes';
      paintGate();
      return;
    }

    if (form.id === 'gate-resend-form') {
      const pass = document.getElementById('gate-resend-pass').value;
      const btn = form.querySelector('button[type="submit"]');
      twofaBusy(btn, true, 'Enviando…');
      const result = await store.twofaSetupStart(gate.email, pass);
      twofaBusy(btn, false);
      if (!result.ok) {
        gateError(result.error || 'No se pudo reenviar el código.');
        return;
      }
      gate.masked = result.emailMasked || gate.masked;
      paintGate();
      ui.toast('Código reenviado. Revisa tu correo.', 'success');
    }
  }

  async function onGateClick(e) {
    const btn = e.target.closest ? e.target.closest('[data-gate]') : null;
    if (!btn) return;
    const action = btn.dataset.gate;

    if (action === 'back') {
      gate.step = 'email';
      paintGate();
      return;
    }

    if (action === 'download') {
      downloadCodes(gate.codes);
      return;
    }

    if (action === 'finish') {
      const status = await store.twofaStatus();
      if (!status.ok || !status.enabled) {
        gateError('La verificación aún no quedó activa. Inténtalo de nuevo.');
        return;
      }
      closeTwofaGate();
      ui.toast('Verificación en dos pasos activada', 'success');
    }
  }

  function bindAccountActions() {
    const form = document.getElementById('account-password-form');
    if (!form) return;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const current = document.getElementById('acc-current').value;
      const next = document.getElementById('acc-new').value;
      const repeat = document.getElementById('acc-repeat').value;

      if (next !== repeat) {
        ui.toast('Las contraseñas nuevas no coinciden', 'error');
        return;
      }

      const result = await window.MagalyAuth.changePassword(state.admin.id, current, next);
      if (!result.ok) {
        ui.toast(result.error, 'error');
        return;
      }
      form.reset();
      ui.toast('Contraseña actualizada', 'success');
    });

    const box = document.getElementById('account-2fa');
    if (!box) return;

    box.addEventListener('submit', onTwofaSubmit);
    box.addEventListener('click', onTwofaClick);
  }

  function twofaError(message) {
    const box = document.getElementById('twofa-error');
    if (!box) return;
    if (!message) {
      box.style.display = 'none';
      box.textContent = '';
      return;
    }
    box.textContent = message;
    box.style.display = 'block';
  }

  function twofaBusy(btn, busy, label) {
    if (!btn) return;
    btn.disabled = busy;
    if (busy) {
      btn.dataset.label = btn.dataset.label || btn.textContent;
      btn.textContent = label || 'Un momento…';
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
    }
  }

  async function ensureTwofa() {
    if (twofa.loaded || twofa.loading) return;
    const box = document.getElementById('account-2fa');
    if (!box || !state.admin) return;

    if (!(store && store.isCloud && store.isCloud())) {
      twofa.loaded = true;
      twofa.status = { ok: false, unavailable: true };
      paintTwofa();
      return;
    }

    twofa.loading = true;
    const result = await store.twofaStatus();
    twofa.loading = false;
    twofa.loaded = true;
    twofa.status = result;
    paintTwofa();
  }

  function paintTwofa() {
    const box = document.getElementById('account-2fa');
    if (!box) return;

    const status = twofa.status || { ok: false, unavailable: true };
    twofaError('');

    if (status.unavailable) {
      box.innerHTML =
        '<p class="hint">La verificación en dos pasos todavía no está activa en el servidor. ' +
        'Cuando el administrador despliegue el servicio de seguridad podrás activarla aquí.</p>';
      return;
    }

    if (!status.ok) {
      box.innerHTML = '<p class="hint">No se pudo consultar el estado de seguridad. ' +
        'Recarga la página e inténtalo de nuevo.</p>';
      return;
    }

    if (twofa.view === 'pending') {
      box.innerHTML =
        '<p class="login-step-hint">Enviamos un código de 6 dígitos a <b>' +
          ui.esc(twofa.pendingMasked || 'tu correo') + '</b>. Vence en 10 minutos.</p>' +
        '<form id="account-2fa-verify" class="form-grid">' +
          '<div class="form-field full">' +
            '<label for="twofa-code">Código de 6 dígitos</label>' +
            '<input id="twofa-code" class="code-input" type="text" inputmode="numeric" ' +
              'maxlength="6" autocomplete="one-time-code" placeholder="000000" required>' +
          '</div>' +
          '<div class="full">' +
            '<button type="submit" class="btn btn-primary" style="width:100%">Activar verificación</button>' +
          '</div>' +
        '</form>' +
        '<details class="twofa-details">' +
          '<summary>¿No te llegó? Reenviar código</summary>' +
          '<form id="account-2fa-resend" class="form-grid">' +
            '<div class="form-field full">' +
              '<label for="twofa-resend-pass">Contraseña actual</label>' +
              '<input id="twofa-resend-pass" type="password" autocomplete="current-password" required>' +
            '</div>' +
            '<div class="full">' +
              '<button type="submit" class="btn btn-ghost" style="width:100%">Reenviar código</button>' +
            '</div>' +
          '</form>' +
        '</details>' +
        '<div class="login-step-actions">' +
          '<button type="button" class="link-button" data-2fa="cancel">Cancelar</button>' +
        '</div>' +
        '<div id="twofa-error"></div>';
      const input = document.getElementById('twofa-code');
      if (input) input.focus();
      return;
    }

    if (twofa.view === 'codes') {
      const list = twofa.recoveryCodes.map(c => ui.esc(c)).join('\n');
      box.innerHTML =
        '<div class="twofa-codes">' +
          '<p><b>Guarda estos 10 códigos.</b> Cada uno sirve una sola vez para recuperar ' +
          'el acceso si pierdes el correo. No volverán a mostrarse.</p>' +
          '<pre id="twofa-code-list">' + list + '</pre>' +
          '<div class="login-step-actions">' +
            '<button type="button" class="btn btn-ghost btn-sm" data-2fa="download">Descargar</button>' +
            '<button type="button" class="btn btn-primary btn-sm" data-2fa="done">Ya los guardé</button>' +
          '</div>' +
        '</div>' +
        '<div id="twofa-error"></div>';
      return;
    }

    if (status.enabled) {
      box.innerHTML =
        '<p class="hint" style="margin-bottom:12px">La verificación en dos pasos está ' +
          '<b>activada</b>. Cada vez que entres te pediremos un código enviado a tu correo.</p>' +
        '<div class="detail-row"><span>Estado</span><span>● Activada</span></div>' +
        '<div class="detail-row"><span>Correo</span><span>' + ui.esc(status.emailMasked || '—') + '</span></div>' +
        '<div class="detail-row"><span>Códigos de recuperación</span><span>' +
          Number(status.recoveryCount || 0) + ' disponibles</span></div>' +

        '<details class="twofa-details">' +
          '<summary>Cambiar el correo de los códigos</summary>' +
          '<form id="account-2fa-email" class="form-grid">' +
            '<div class="form-field full">' +
              '<label for="twofa-new-email">Correo nuevo</label>' +
              '<input id="twofa-new-email" type="email" placeholder="tucorreo@gmail.com" autocomplete="email" required>' +
            '</div>' +
            '<div class="form-field full">' +
              '<label for="twofa-email-pass">Contraseña actual</label>' +
              '<input id="twofa-email-pass" type="password" autocomplete="current-password" required>' +
            '</div>' +
            '<div class="full">' +
              '<button type="submit" class="btn btn-primary" style="width:100%">Enviar código al correo nuevo</button>' +
            '</div>' +
          '</form>' +
        '</details>' +

        '<details class="twofa-details">' +
          '<summary>Generar códigos de recuperación nuevos</summary>' +
          '<form id="account-2fa-regen" class="form-grid">' +
            '<div class="form-field full">' +
              '<label for="twofa-regen-pass">Contraseña actual</label>' +
              '<input id="twofa-regen-pass" type="password" autocomplete="current-password" required>' +
            '</div>' +
            '<div class="full">' +
              '<button type="submit" class="btn btn-primary" style="width:100%">Generar códigos nuevos</button>' +
            '</div>' +
          '</form>' +
        '</details>' +

        '<details class="twofa-details">' +
          '<summary>Desactivar la verificación en dos pasos</summary>' +
          '<form id="account-2fa-disable" class="form-grid">' +
            '<div class="form-field full">' +
              '<label for="twofa-disable-pass">Contraseña actual</label>' +
              '<input id="twofa-disable-pass" type="password" autocomplete="current-password" required>' +
            '</div>' +
            '<div class="full">' +
              '<button type="submit" class="btn btn-danger" style="width:100%">Desactivar verificación</button>' +
            '</div>' +
          '</form>' +
        '</details>' +

        '<div id="twofa-error"></div>';
      return;
    }

    box.innerHTML =
      '<p class="hint" style="margin-bottom:14px">Cuando la actives, además de tu contraseña ' +
        'te pediremos un código de 6 dígitos enviado a tu correo personal. Así, si alguien ' +
        'conoce tu contraseña, no podrá entrar.</p>' +
      '<form id="account-2fa-form" class="form-grid">' +
        '<div class="form-field full">' +
          '<label for="twofa-email">Correo personal</label>' +
          '<input id="twofa-email" type="email" placeholder="tucorreo@gmail.com" autocomplete="email" required>' +
          '<span class="hint">Aquí llegarán los códigos. No uses el correo interno @aguamagaly.app.</span>' +
        '</div>' +
        '<div class="form-field full">' +
          '<label for="twofa-pass">Contraseña actual</label>' +
          '<input id="twofa-pass" type="password" autocomplete="current-password" required>' +
        '</div>' +
        '<div class="full">' +
          '<button type="submit" class="btn btn-primary" style="width:100%">Enviar código de activación</button>' +
        '</div>' +
      '</form>' +
      '<div id="twofa-error"></div>';
  }

  async function onTwofaSubmit(e) {
    const form = e.target;
    if (!form || !form.id) return;
    e.preventDefault();
    twofaError('');

    if (form.id === 'account-2fa-form' || form.id === 'account-2fa-email') {
      const email = document.getElementById(form.id === 'account-2fa-email' ? 'twofa-new-email' : 'twofa-email').value.trim();
      const pass = document.getElementById(form.id === 'account-2fa-email' ? 'twofa-email-pass' : 'twofa-pass').value;
      const btn = form.querySelector('button[type="submit"]');
      twofaBusy(btn, true, 'Enviando…');
      const result = await store.twofaSetupStart(email, pass);
      twofaBusy(btn, false);
      if (!result.ok) {
        twofaError(result.error || 'No se pudo enviar el código.');
        return;
      }
      twofa.view = 'pending';
      twofa.pendingEmail = email;
      twofa.pendingMasked = result.emailMasked || email;
      paintTwofa();
      return;
    }

    if (form.id === 'account-2fa-verify') {
      const code = (document.getElementById('twofa-code').value || '').replace(/\D/g, '');
      if (code.length !== 6) {
        twofaError('Escribe los 6 dígitos del código.');
        return;
      }
      const btn = form.querySelector('button[type="submit"]');
      twofaBusy(btn, true, 'Verificando…');
      const result = await store.twofaSetupVerify(code);
      twofaBusy(btn, false);
      if (!result.ok) {
        twofaError(result.error || 'Código incorrecto.');
        return;
      }
      twofa.recoveryCodes = Array.isArray(result.recoveryCodes) ? result.recoveryCodes : [];
      twofa.view = 'codes';
      twofa.status = { ok: true, enabled: true, emailMasked: result.emailMasked || twofa.pendingMasked, recoveryCount: twofa.recoveryCodes.length };
      paintTwofa();
      return;
    }

    if (form.id === 'account-2fa-resend') {
      const pass = document.getElementById('twofa-resend-pass').value;
      const btn = form.querySelector('button[type="submit"]');
      twofaBusy(btn, true, 'Enviando…');
      const result = await store.twofaSetupStart(twofa.pendingEmail, pass);
      twofaBusy(btn, false);
      if (!result.ok) {
        twofaError(result.error || 'No se pudo reenviar el código.');
        return;
      }
      twofa.pendingMasked = result.emailMasked || twofa.pendingMasked;
      paintTwofa();
      ui.toast('Código reenviado. Revisa tu correo.', 'success');
      return;
    }

    if (form.id === 'account-2fa-regen') {
      const pass = document.getElementById('twofa-regen-pass').value;
      const btn = form.querySelector('button[type="submit"]');
      twofaBusy(btn, true, 'Generando…');
      const result = await store.twofaRegenerate(pass);
      twofaBusy(btn, false);
      if (!result.ok) {
        twofaError(result.error || 'No se pudieron generar los códigos.');
        return;
      }
      twofa.recoveryCodes = Array.isArray(result.recoveryCodes) ? result.recoveryCodes : [];
      twofa.view = 'codes';
      paintTwofa();
      return;
    }

    if (form.id === 'account-2fa-disable') {
      const pass = document.getElementById('twofa-disable-pass').value;
      const ok = await ui.confirm({
        title: 'Desactivar verificación en dos pasos',
        message: 'Tu cuenta quedará protegida solo con la contraseña. ¿Continuar?',
        confirmText: 'Desactivar',
        danger: true
      });
      if (!ok) return;
      const btn = form.querySelector('button[type="submit"]');
      twofaBusy(btn, true, 'Desactivando…');
      const result = await store.twofaDisable(pass);
      twofaBusy(btn, false);
      if (!result.ok) {
        twofaError(result.error || 'No se pudo desactivar.');
        return;
      }
      twofa.loaded = false;
      twofa.view = 'status';
      twofa.recoveryCodes = [];
      await ensureTwofa();
      ui.toast('Verificación en dos pasos desactivada', 'success');
    }
  }

  function downloadCodes(codes) {
    const list = Array.isArray(codes) ? codes : [];
    const text = 'AGUA MAGALY — CÓDIGOS DE RECUPERACIÓN\n' +
      'Usuario: ' + (state.admin ? state.admin.username : '') + '\n' +
      'Guarda este archivo en un lugar seguro. Cada código sirve una sola vez.\n\n' +
      list.join('\n') + '\n';
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'agua-magaly-codigos-recuperacion.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function downloadRecoveryCodes() {
    downloadCodes(twofa.recoveryCodes);
  }

  async function onTwofaClick(e) {
    const btn = e.target.closest ? e.target.closest('[data-2fa]') : null;
    if (!btn) return;
    const action = btn.dataset['2fa'];

    if (action === 'cancel') {
      twofa.view = 'status';
      twofa.recoveryCodes = [];
      paintTwofa();
      return;
    }

    if (action === 'download') {
      downloadRecoveryCodes();
      return;
    }

    if (action === 'done') {
      twofa.view = 'status';
      twofa.recoveryCodes = [];
      twofa.loaded = false;
      await ensureTwofa();
      ui.toast('Verificación en dos pasos activada', 'success');
    }
  }

  function renderAccount() {
    const box = document.getElementById('account-info');
    if (!box || !state.admin) return;
    box.innerHTML =
      '<div class="detail-row"><span>Nombre</span><span>' + ui.esc(state.admin.name) + '</span></div>' +
      '<div class="detail-row"><span>Usuario</span><span>' + ui.esc(state.admin.username) + '</span></div>' +
      '<div class="detail-row"><span>Rol</span><span>Administrador</span></div>' +
      '<div class="detail-row"><span>Estado</span><span>Activo</span></div>';
    ensureTwofa();
  }

  // ==========================================================================
  // REPORTES
  // ==========================================================================
  function bindReports() {
    document.querySelectorAll('#report-range button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#report-range button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.reportRange = btn.dataset.range;
        renderReports();
      });
    });
    document.getElementById('btn-export-report').addEventListener('click', () => {
      const rows = [];
      reportOrders().filter(o => o.status === STATUS.entregado).forEach(o => {
        store.orderLines(o, state.products).forEach(l => rows.push({
          fecha: U.formatDateTime(o.createdAt), codigo: o.code, cliente: o.client,
          producto: l.name, cantidad: l.qty, precio: l.price, subtotal: l.qty * l.price,
          total_pedido: o.total, ruta: o.routeName || '', repartidor: driverName(o) || '',
          pago: o.payment || '', cobrado: o.paid ? 'Sí' : 'No'
        }));
      });
      if (!rows.length) { ui.toast('No hay ventas entregadas en este periodo', 'warn'); return; }
      store.exportCsv('ventas', rows);
      ui.toast('Archivo de ventas descargado', 'success');
    });
  }

  function reportStart() {
    const now = new Date();
    if (state.reportRange === 'todo') return null;
    if (state.reportRange === 'mes') return new Date(now.getFullYear(), now.getMonth(), 1);
    const days = Number(state.reportRange) || 7;
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d;
  }

  function reportOrders() {
    const start = reportStart();
    return state.orders.filter(o => !start || new Date(o.createdAt) >= start);
  }

  // Barras horizontales simples (sin librerías).
  function bars(rows, opts) {
    const o = opts || {};
    if (!rows.length) return ui.emptyState(o.empty || 'Sin datos en este periodo', '', '📭');
    const max = Math.max.apply(null, rows.map(r => r.value).concat([1]));
    return '<ul class="report-bars">' + rows.map(r =>
      '<li><div class="report-bar-label"><span>' + ui.esc(r.label) + '</span><b>' + ui.esc(r.display) + '</b></div>' +
      '<div class="report-bar"><span style="width:' + Math.max(2, Math.round((r.value / max) * 100)) + '%"></span></div>' +
      (r.sub ? '<small>' + ui.esc(r.sub) + '</small>' : '') + '</li>'
    ).join('') + '</ul>';
  }

  function renderReports() {
    const kpiBox = document.getElementById('report-kpis');
    if (!kpiBox) return;
    const list = reportOrders();
    const delivered = list.filter(o => o.status === STATUS.entregado);
    const cancelled = list.filter(o => o.status === STATUS.cancelado);
    const sales = delivered.reduce((s, o) => s + o.total, 0);
    const unpaid = delivered.filter(o => !o.paid);
    const closed = delivered.length + cancelled.length;
    const units = delivered.reduce((s, o) => s + store.orderLines(o, state.products).reduce((a, l) => a + l.qty, 0), 0);

    const cards = [
      { label: 'Ventas entregadas', value: U.formatMoney(sales), hint: delivered.length + ' pedido(s)', cls: 'kpi-money' },
      { label: 'Pacas vendidas', value: units, hint: 'En pedidos entregados', cls: '' },
      { label: 'Pedidos recibidos', value: list.length, hint: cancelled.length + ' cancelado(s)', cls: '' },
      { label: 'Tasa de entrega', value: closed ? Math.round((delivered.length / closed) * 100) + '%' : '—', hint: 'Entregados vs. cerrados', cls: 'kpi-route' },
      { label: 'Ticket promedio', value: U.formatMoney(delivered.length ? Math.round(sales / delivered.length) : 0), hint: 'Por pedido entregado', cls: '' },
      { label: 'Por cobrar', value: U.formatMoney(unpaid.reduce((s, o) => s + o.total, 0)), hint: unpaid.length + ' entrega(s) sin cobrar', cls: unpaid.length ? 'kpi-danger' : '' }
    ];
    kpiBox.innerHTML = cards.map(c =>
      '<div class="kpi-card ' + c.cls + '"><span class="kpi-label">' + ui.esc(c.label) + '</span>' +
      '<span class="kpi-value">' + ui.esc(c.value) + '</span><span class="kpi-hint">' + ui.esc(c.hint) + '</span></div>'
    ).join('');
    document.getElementById('report-total').textContent = U.formatMoney(sales);

    // Ventas por día (columnas)
    const start = reportStart() || (delivered.length ? new Date(Math.min.apply(null, delivered.map(o => new Date(o.createdAt).getTime()))) : new Date());
    const days = [];
    const cursor = new Date(start); cursor.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    while (cursor <= today && days.length < 62) {
      const iso = cursor.toISOString();
      const value = delivered.filter(o => U.sameDay(o.createdAt, iso)).reduce((s, o) => s + o.total, 0);
      days.push({ date: new Date(cursor), value: value });
      cursor.setDate(cursor.getDate() + 1);
    }
    const maxDay = Math.max.apply(null, days.map(d => d.value).concat([1]));
    document.getElementById('report-days').innerHTML = days.length
      ? '<div class="report-cols" style="--cols:' + days.length + '">' + days.map(d =>
          '<div class="report-col" title="' + ui.esc(d.date.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' }) + ': ' + U.formatMoney(d.value)) + '">' +
            '<span class="report-col-bar" style="height:' + Math.max(2, Math.round((d.value / maxDay) * 100)) + '%"></span>' +
            '<small>' + (days.length <= 14 ? ui.esc(d.date.toLocaleDateString('es-CO', { weekday: 'short' }).slice(0, 3)) : d.date.getDate()) + '</small>' +
          '</div>').join('') + '</div>'
      : ui.emptyState('Sin ventas', '', '📭');

    // Por producto
    const byProduct = {};
    delivered.forEach(o => store.orderLines(o, state.products).forEach(l => {
      const k = l.name;
      byProduct[k] = byProduct[k] || { qty: 0, money: 0 };
      byProduct[k].qty += l.qty;
      byProduct[k].money += l.qty * l.price;
    }));
    document.getElementById('report-products').innerHTML = bars(Object.keys(byProduct)
      .map(k => ({ label: k, value: byProduct[k].qty, display: byProduct[k].qty + (byProduct[k].qty === 1 ? ' paca' : ' pacas'), sub: U.formatMoney(byProduct[k].money) }))
      .sort((a, b) => b.value - a.value));

    // Por ruta
    const byRoute = {};
    delivered.forEach(o => {
      const k = o.routeName || 'Sin ruta asignada';
      byRoute[k] = byRoute[k] || { n: 0, money: 0 };
      byRoute[k].n += 1;
      byRoute[k].money += o.total;
    });
    document.getElementById('report-routes').innerHTML = bars(Object.keys(byRoute)
      .map(k => ({ label: k, value: byRoute[k].money, display: U.formatMoney(byRoute[k].money), sub: byRoute[k].n + ' entrega(s)' }))
      .sort((a, b) => b.value - a.value));

    // Por repartidor
    const byDriver = {};
    delivered.forEach(o => {
      const k = driverName(o) || 'Sin repartidor';
      byDriver[k] = byDriver[k] || { n: 0, money: 0, unpaid: 0 };
      byDriver[k].n += 1;
      byDriver[k].money += o.total;
      if (!o.paid) byDriver[k].unpaid += o.total;
    });
    document.getElementById('report-drivers').innerHTML = bars(Object.keys(byDriver)
      .map(k => ({ label: k, value: byDriver[k].n, display: byDriver[k].n + (byDriver[k].n === 1 ? ' entrega' : ' entregas'),
        sub: U.formatMoney(byDriver[k].money) + (byDriver[k].unpaid ? ' · por cobrar ' + U.formatMoney(byDriver[k].unpaid) : '') }))
      .sort((a, b) => b.value - a.value));

    // Horas pico (todos los pedidos recibidos)
    const hours = new Array(24).fill(0);
    list.forEach(o => { const h = new Date(o.createdAt).getHours(); if (!isNaN(h)) hours[h] += 1; });
    const hourRows = hours.map((n, h) => ({ h: h, n: n })).filter(x => x.n > 0)
      .map(x => ({ label: String(x.h).padStart(2, '0') + ':00 – ' + String(x.h).padStart(2, '0') + ':59', value: x.n, display: x.n + ' pedido(s)' }));
    document.getElementById('report-hours').innerHTML = bars(hourRows, { empty: 'Aún no hay pedidos en este periodo' });
  }

  // ==========================================================================
  // INVENTARIO
  // ==========================================================================
  function tracked(p) { return typeof p.stock === 'number'; }

  function lowStock() {
    return state.products.filter(p => tracked(p) && p.stock <= (Number(p.minStock) || 0));
  }

  function soldLast30(p) {
    const limit = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return state.orders
      .filter(o => o.status === STATUS.entregado && new Date(o.createdAt).getTime() >= limit)
      .reduce((s, o) => s + store.orderLines(o, state.products).filter(l => l.id === p.id).reduce((a, l) => a + l.qty, 0), 0);
  }

  function renderStockAlert() {
    const box = document.getElementById('stock-alert');
    if (!box) return;
    const low = lowStock();
    if (!low.length) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '⚠️ <strong>Inventario bajo:</strong> ' +
      low.map(p => ui.esc(p.name) + ' (' + p.stock + ')').join(', ') +
      ' <button type="button" class="btn-text" data-goto-inv>Ver inventario →</button>';
    box.querySelector('[data-goto-inv]').addEventListener('click', () => goto('inventario'));
  }

  function renderInventory() {
    const body = document.getElementById('inventory-body');
    if (!body) return;
    if (!state.products.length) {
      body.innerHTML = '<tr><td colspan="7">' + ui.emptyState('Sin productos', 'Créalos en la sección Productos.', '📦') + '</td></tr>';
    } else {
      body.innerHTML = state.products.map((p, i) => {
        if (!tracked(p)) {
          return '<tr><td><strong>' + ui.esc(p.name) + '</strong></td><td colspan="5" class="muted">Sin control de inventario</td>' +
            '<td style="text-align:right"><button type="button" class="btn btn-ghost btn-sm" data-inv-track="' + i + '" style="color:var(--blue-deep);border-color:var(--rule)">Activar control</button></td></tr>';
        }
        const min = Number(p.minStock) || 0;
        const sold = soldLast30(p);
        const perDay = sold / 30;
        const daysLeft = perDay > 0 ? Math.floor(p.stock / perDay) : null;
        const statusPill = p.stock <= 0 ? '<span class="pill pill-cancelado">● Agotado</span>'
          : p.stock <= min ? '<span class="pill pill-pendiente">● Bajo</span>'
          : '<span class="pill pill-entregado">● Bien</span>';
        return '<tr>' +
          '<td><strong>' + ui.esc(p.name) + '</strong></td>' +
          '<td style="text-align:right;font-weight:700">' + p.stock + '</td>' +
          '<td style="text-align:right">' + min + '</td>' +
          '<td>' + statusPill + '</td>' +
          '<td style="text-align:right">' + sold + '</td>' +
          '<td style="text-align:right">' + (daysLeft === null ? '—' : daysLeft + ' día(s)') + '</td>' +
          '<td style="text-align:right;white-space:nowrap">' +
            '<button type="button" class="btn btn-primary btn-sm" data-inv-add="' + i + '">＋ Producción</button> ' +
            '<button type="button" class="btn btn-ghost btn-sm" data-inv-count="' + i + '" style="color:var(--blue-deep);border-color:var(--rule)">Conteo</button>' +
          '</td></tr>';
      }).join('');
    }

    body.querySelectorAll('[data-inv-track]').forEach(btn => btn.addEventListener('click', async () => {
      const p = state.products[Number(btn.dataset.invTrack)];
      await store.upsert('products', Object.assign({}, p, { stock: 0, minStock: p.minStock !== undefined ? p.minStock : 10 }));
      await reload();
      ui.toast('Control de inventario activado para ' + p.name + '. Registra la producción.', 'success');
    }));
    body.querySelectorAll('[data-inv-add]').forEach(btn => btn.addEventListener('click', () => openStockForm(state.products[Number(btn.dataset.invAdd)], 'produccion')));
    body.querySelectorAll('[data-inv-count]').forEach(btn => btn.addEventListener('click', () => openStockForm(state.products[Number(btn.dataset.invCount)], 'ajuste')));

    const movesBody = document.getElementById('stock-moves-body');
    const moves = (state.stock || []).slice(0, 40);
    movesBody.innerHTML = moves.length ? moves.map(m => {
      const p = state.products.find(x => x.id === m.productId);
      const qty = Number(m.qty) || 0;
      return '<tr><td>' + ui.esc(U.formatDateTime(m.at)) + '</td>' +
        '<td>' + ui.esc(p ? p.name : m.productId) + '</td>' +
        '<td>' + ui.esc(store.STOCK_LABEL[m.type] || m.type) + '</td>' +
        '<td style="text-align:right;font-weight:700;color:' + (qty < 0 ? '#9B2C2C' : '#1E824C') + '">' + (qty > 0 ? '+' : '') + qty + '</td>' +
        '<td>' + ui.esc(m.note || '') + '</td><td>' + ui.esc(m.by || '') + '</td></tr>';
    }).join('') : '<tr><td colspan="6">' + ui.emptyState('Sin movimientos todavía', '', '🧾') + '</td></tr>';
  }

  function openStockForm(product, type) {
    const isCount = type === 'ajuste';
    const body = '<div class="form-grid">' +
      '<div class="form-field full"><span class="hint">Stock actual de <strong>' + ui.esc(product.name) + '</strong>: ' + product.stock + ' pacas</span></div>' +
      field('f-qty', isCount ? 'Pacas contadas en bodega *' : 'Pacas producidas *', { required: true, type: 'number', min: 0, step: 1, full: true }) +
      field('f-note', 'Nota', { full: true, placeholder: isCount ? 'Ej. Conteo del viernes' : 'Ej. Producción de la mañana' }) +
    '</div>';
    openModal({
      title: isCount ? 'Ajustar con un conteo' : 'Registrar producción',
      subtitle: isCount ? 'Escribe cuántas pacas hay de verdad; se registra la diferencia.' : 'Suma las pacas que salieron de la planta.',
      submitLabel: 'Guardar',
      body: body,
      onSubmit: async form => {
        const value = Math.floor(Number(form.querySelector('#f-qty').value));
        if (!(value >= 0)) { ui.toast('Escribe una cantidad válida', 'error'); return false; }
        const delta = isCount ? value - product.stock : value;
        if (!delta) { ui.toast(isCount ? 'El conteo coincide con el stock' : 'Escribe una cantidad mayor que cero', 'warn'); return !isCount ? false : true; }
        try {
          await store.addStockMove(product, delta, type, form.querySelector('#f-note').value.trim(), state.admin.name);
        } catch (err) {
          ui.toast('No se pudo guardar: ' + (err.message || err), 'error');
          return false;
        }
        await reload();
        ui.toast((delta > 0 ? '+' : '') + delta + ' pacas · ' + product.name, 'success');
        return true;
      }
    });
  }

  // ==========================================================================
  // AVISO DE PEDIDOS NUEVOS (sonido + notificación del navegador)
  // ==========================================================================
  function bindNotifications() {
    const btn = document.getElementById('btn-notif');
    try { state.notifOn = localStorage.getItem(NOTIF_KEY) === '1'; } catch (err) { state.notifOn = false; }
    const paint = () => {
      if (!btn) return;
      btn.textContent = state.notifOn ? '🔔 Avisos activos' : '🔕 Activar avisos';
      btn.classList.toggle('is-on', state.notifOn);
    };
    paint();
    if (!btn) return;
    btn.addEventListener('click', async () => {
      state.notifOn = !state.notifOn;
      if (state.notifOn && typeof window.Notification !== 'undefined' && window.Notification.permission === 'default') {
        try { await window.Notification.requestPermission(); } catch (err) { /* ignora */ }
      }
      try { localStorage.setItem(NOTIF_KEY, state.notifOn ? '1' : '0'); } catch (err) { /* ignora */ }
      paint();
      if (state.notifOn) { chime(); ui.toast('Te avisaremos con sonido cuando llegue un pedido nuevo.', 'success'); }
      else ui.toast('Avisos desactivados', 'warn');
    });
  }

  function checkNewOrders() {
    const ids = state.orders.filter(o => o.status === STATUS.pendiente).map(o => o.id);
    if (!state.seenOrders) { state.seenOrders = new Set(ids); return; }
    const fresh = state.orders.filter(o => o.status === STATUS.pendiente && !state.seenOrders.has(o.id));
    ids.forEach(id => state.seenOrders.add(id));
    if (!fresh.length) return;
    const first = fresh[0];
    const extra = fresh.length > 1 ? ' (+' + (fresh.length - 1) + ' más)' : '';
    ui.toast('🧾 Pedido nuevo: ' + first.client + ' · ' + U.formatMoney(first.total) + extra, 'success');
    if (!state.notifOn) return;
    chime();
    flashTitle();
    if (typeof window.Notification !== 'undefined' && window.Notification.permission === 'granted') {
      try {
        const n = new window.Notification('Pedido nuevo · Agua Magaly', {
          body: first.client + ' · ' + U.formatMoney(first.total) + ' · ' + (first.items || ''),
          icon: 'assets/logo-magaly.png',
          tag: 'magaly-admin-' + first.id
        });
        n.onclick = () => { window.focus(); goto('pedidos'); n.close(); };
      } catch (err) { /* algunos navegadores lo bloquean */ }
    }
  }

  function chime() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      const now = ctx.currentTime;
      [0, 0.16, 0.32].forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = [784, 988, 1319][i];
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.25, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.18);
      });
      setTimeout(() => { try { ctx.close(); } catch (err) { /* ignora */ } }, 1000);
    } catch (err) { /* sin sonido */ }
  }

  function flashTitle() {
    if (!document.hidden) return;
    const original = document.title;
    let on = false;
    const timer = setInterval(() => { document.title = on ? '🧾 Pedido nuevo' : original; on = !on; }, 900);
    const stop = () => { clearInterval(timer); document.title = original; document.removeEventListener('visibilitychange', stop); };
    document.addEventListener('visibilitychange', stop);
    setTimeout(stop, 30000);
  }

  // ==========================================================================
  // ATAJOS DE TECLADO
  // ==========================================================================
  function bindShortcuts() {
    document.addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (typing) return;

      if (e.key === '/') {
        e.preventDefault();
        goto('pedidos');
        const input = document.getElementById('orders-search');
        if (input) input.focus();
      }
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        openOrderForm();
      }
    });
  }

  // ==========================================================================
  // SINCRONIZACIÓN CON OTRAS PESTAÑAS
  // ==========================================================================
  store.subscribe(ui.debounce(async entity => {
    if (!state.admin) return;
    if (['orders', 'products', 'users', 'routes', 'pqrs', 'stock'].indexOf(entity) >= 0) await reload();
  }, 350));

  window.addEventListener('resize', ui.debounce(renderChart, 200));

  main();
})();
