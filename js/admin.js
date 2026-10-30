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
    admin: null
  };

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
    bindShortcuts();

    await reload();
    setInterval(() => { store.list('orders').then(orders => { state.orders = orders; render(); }); }, 8000);
  }

  async function reload() {
    const [orders, products, users, routes, pqrs] = await Promise.all([
      store.list('orders'),
      store.list('products'),
      store.list('users'),
      store.list('routes'),
      store.list('pqrs')
    ]);
    state.orders = orders;
    state.products = products;
    state.users = users;
    state.routes = routes;
    state.pqrs = pqrs;
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
    return (user && user.color) || '#1C7FA8';
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
          '<ul class="detail-items">' + String(o.items || '').split(',').filter(Boolean).map(i => '<li>' + ui.esc(i.trim()) + '</li>').join('') + '</ul>' +
          '<div class="detail-total"><span>Total</span><span>' + U.formatMoney(o.total) + '</span></div>' +
        '</div>' +

        '<div class="detail-block">' +
          '<h4>Repartidor asignado</h4>' +
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

    drawer.querySelector('#drawer-assign').addEventListener('click', async () => {
      const driverId = drawer.querySelector('#drawer-driver').value || null;
      const driver = driverId ? driverById(driverId) : null;
      const events = (o.events || []).concat([{
        type: 'asignado', at: U.nowIso(), by: state.admin.name,
        note: driver ? 'Asignado a ' + driver.name : 'Se quitó el repartidor'
      }]);
      await store.upsert('orders', Object.assign({}, o, { driverId: driverId, driverName: driver ? driver.name : '', events: events }));
      ui.toast(driver ? 'Asignado a ' + driver.name : 'Pedido sin asignar', 'success');
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
    const body = '<div class="form-grid">' +
      field('f-client', 'Cliente *', { required: true, placeholder: 'Ej. Tienda Doña Carmen', full: true }) +
      field('f-phone', 'Teléfono / WhatsApp *', { required: true, placeholder: 'Ej. 312 456 7890' }) +
      field('f-total', 'Total (COP) *', { required: true, type: 'number', min: 0, step: 500, placeholder: '16000' }) +
      field('f-address', 'Dirección de entrega', { placeholder: 'Ej. Calle 4 # 12-30, Bajo Grande', full: true }) +
      field('f-items', 'Detalle del pedido *', { required: true, placeholder: 'Ej. 3 Pacas 250ml + 2 Pacas 3L', full: true }) +
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

    openModal({
      title: 'Nuevo pedido',
      subtitle: 'Registra un pedido tomado por teléfono o WhatsApp.',
      submitLabel: 'Crear pedido',
      body: body,
      onSubmit: async form => {
        const driverId = form.querySelector('#f-driver').value || null;
        const driver = driverId ? driverById(driverId) : null;
        const now = U.nowIso();
        const order = {
          id: store.uid('ORD'),
          code: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
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
  }

  // ------------------------------ Producto ------------------------------
  function bindProductActions() {
    document.getElementById('btn-new-product').addEventListener('click', () => openProductForm());
  }

  function openProductForm(product) {
    const p = product || {};
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
      field('f-desc', 'Descripción', { type: 'textarea', rows: 3, full: true, value: p.desc || '' }) +
      field('f-image', 'Imagen (ruta)', { full: true, value: p.image || 'assets/bolsa-250ml.jpg', hint: 'Ej. assets/bolsa-250ml.jpg' }) +
    '</div>';

    openModal({
      title: product ? 'Editar producto' : 'Nuevo producto',
      submitLabel: product ? 'Guardar cambios' : 'Crear producto',
      body: body,
      onSubmit: async form => {
        const record = {
          id: product ? product.id : 'prod_' + Date.now(),
          name: form.querySelector('#f-name').value.trim(),
          price: Number(form.querySelector('#f-price').value || 0),
          unit: form.querySelector('#f-unit').value.trim(),
          badge: form.querySelector('#f-badge').value.trim() || 'General',
          active: form.querySelector('#f-status').value === 'true',
          desc: form.querySelector('#f-desc').value.trim(),
          image: form.querySelector('#f-image').value.trim() || 'assets/bolsa-250ml.jpg'
        };
        await store.upsert('products', record);
        await reload();
        ui.toast(product ? 'Producto actualizado' : 'Producto creado', 'success');
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
        '<img src="' + ui.esc(p.image || 'assets/bolsa-250ml.jpg') + '" alt="' + ui.esc(p.name) + '" loading="lazy">' +
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
    const body = '<div class="form-grid">' +
      field('f-dname', 'Nombre completo *', { required: true, full: true, value: d.name || '', placeholder: 'Ej. Carlos Gómez' }) +
      field('f-dusername', 'Usuario de acceso *', {
        required: true, value: d.username || '', placeholder: 'Ej. carlos',
        hint: 'Sin espacios ni mayúsculas. Con este usuario entra el repartidor.'
      }) +
      field('f-dphone', 'Teléfono', { value: d.phone || '', placeholder: 'Ej. 305 413 6677' }) +
      field('f-dpass', driver ? 'Nueva contraseña' : 'Contraseña *', {
        required: !driver,
        type: 'text',
        placeholder: driver ? 'Dejar vacío para no cambiar' : 'Mínimo 4 caracteres',
        full: true
      }) +
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

        const pass = form.querySelector('#f-dpass').value;
        if (!driver && pass.length < 4) {
          ui.toast('La contraseña debe tener al menos 4 caracteres', 'error');
          return false;
        }

        const record = {
          id: driver ? driver.id : store.uid('u'),
          role: 'driver',
          name: form.querySelector('#f-dname').value.trim(),
          username: username,
          phone: form.querySelector('#f-dphone').value.trim(),
          active: form.querySelector('#f-dactive').value === 'true',
          color: form.querySelector('#f-dcolor').value,
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
          '<span>Clave: la que definiste al crearlo (cámbiala con «Editar»)</span>' +
        '</div>' +
        '<div class="driver-card-foot">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-edit-driver="' + ui.esc(d.id) + '" style="color:var(--blue-deep);border-color:var(--rule)">Editar</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-see-driver="' + ui.esc(d.id) + '" style="color:var(--blue-deep);border-color:var(--rule)">Ver pedidos</button>' +
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
        const ok = await ui.confirm({
          title: 'Eliminar repartidor',
          message: assigned.length
            ? d.name + ' tiene ' + assigned.length + ' pedido(s) activo(s). Quedarán sin asignar.'
            : 'Se eliminará la cuenta de ' + d.name + '.',
          confirmText: 'Eliminar',
          danger: true
        });
        if (!ok) return;
        for (const order of assigned) {
          await store.upsert('orders', Object.assign({}, order, { driverId: null, driverName: '' }));
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
  }

  function renderAccount() {
    const box = document.getElementById('account-info');
    if (!box || !state.admin) return;
    box.innerHTML =
      '<div class="detail-row"><span>Nombre</span><span>' + ui.esc(state.admin.name) + '</span></div>' +
      '<div class="detail-row"><span>Usuario</span><span>' + ui.esc(state.admin.username) + '</span></div>' +
      '<div class="detail-row"><span>Rol</span><span>Administrador</span></div>' +
      '<div class="detail-row"><span>Estado</span><span>Activo</span></div>';
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
    if (['orders', 'products', 'users', 'routes', 'pqrs'].indexOf(entity) >= 0) await reload();
  }, 350));

  window.addEventListener('resize', ui.debounce(renderChart, 200));

  main();
})();
