/**
 * AGUA MAGALY — CONTROLADOR DEL PANEL DE ADMINISTRACIÓN
 * CRUD de Productos, Gestión de Pedidos (Finalizar / Cancelar), Rutas y PQRS
 */

(function () {
  'use strict';

  // Claves de almacenamiento local (persistencia)
  const STORAGE_KEYS = {
    PRODUCTS: 'magaly_products',
    ORDERS: 'magaly_orders',
    ROUTES: 'magaly_routes',
    PQRS: 'magaly_pqrs'
  };

  // Datos predeterminados de la empresa
  const DEFAULT_PRODUCTS = [
    {
      id: '250',
      name: 'Paca de agua 250 ml',
      badge: 'Venta por Paca (50 uds)',
      desc: 'Paca completa de 50 bolsitas individuales de 250 ml. Presentación ideal para consumo diario personal, tiendas de barrio y colegios.',
      price: 4000,
      unit: '/ paca de 250ml',
      image: 'assets/bolsa-250ml.jpg',
      active: true
    },
    {
      id: '3L',
      name: 'Paca de agua 3 Litros',
      badge: 'Venta por Paca',
      desc: 'Paca resistente de agua tratada en presentación de 3 Litros con agarraderas ergonómicas. Diseñada para abastecimiento de hogares, fincas y restaurantes.',
      price: 4000,
      unit: '/ paca de 3L',
      image: 'assets/bolsa-3l.jpg',
      active: true
    }
  ];

  const DEFAULT_ORDERS = [
    {
      id: 'ORD-1001',
      client: 'Tienda Doña Carmen',
      phone: '312 458 9201',
      items: '4 Pacas de 250 ml',
      total: 16000,
      date: 'Hoy, 09:30 AM',
      status: 'En ruta'
    },
    {
      id: 'ORD-1002',
      client: 'Familia Martínez',
      phone: '314 772 1190',
      items: '2 Bolsas de 3 Litros',
      total: 8000,
      date: 'Hoy, 11:15 AM',
      status: 'Pendiente'
    },
    {
      id: 'ORD-1003',
      client: 'Puesto de Salud Bajo Grande',
      phone: '320 891 3344',
      items: '8 Pacas 250 ml + 3 Bolsas 3L',
      total: 44000,
      date: 'Ayer, 03:40 PM',
      status: 'Finalizado'
    }
  ];

  const DEFAULT_ROUTES = [
    {
      id: 'R-1',
      name: 'Ruta Centro y Plaza Principal',
      driver: 'Carlos Gómez',
      time: '08:00 AM - 12:00 PM',
      status: 'En ruta',
      notes: 'Distribución prioritaria a tiendas y viviendas de la calle principal.'
    },
    {
      id: 'R-2',
      name: 'Ruta Sector La Loma y El Crucero',
      driver: 'Andrés Salgado',
      time: '02:00 PM - 05:00 PM',
      status: 'Programada',
      notes: 'Despacho de pedidos residenciales y fincas aledañas.'
    },
    {
      id: 'R-3',
      name: 'Ruta Colegios y Centro de Salud',
      driver: 'Juan David',
      time: '07:00 AM - 10:00 AM',
      status: 'Completada',
      notes: 'Entrega institucional matutina cumplida con éxito.'
    }
  ];

  const DEFAULT_PQRS = [
    {
      id: 'PQR-1',
      type: 'Sugerencia',
      name: 'María Eugenia Ramos',
      contact: '311 654 3210',
      message: 'Sería excelente si también ofrecieran botellones de 20 litros más adelante.',
      date: '15/09/2026',
      status: 'Atendida'
    },
    {
      id: 'PQR-2',
      type: 'Felicitación',
      name: 'José Alarcón',
      contact: '313 998 1234',
      message: 'Excelente sabor y pureza del agua. Nos cambió la vida no tener que esperar camiones de la ciudad.',
      date: '16/09/2026',
      status: 'Nueva'
    }
  ];

  // Métodos de ayuda para LocalStorage
  function getStorage(key, fallback) {
    const data = localStorage.getItem(key);
    let res = data ? JSON.parse(data) : fallback;
    if (key === STORAGE_KEYS.PRODUCTS && Array.isArray(res)) {
      let changed = false;
      res = res.map(p => {
        if (p.id === '3L' && (p.name.includes('Bolsa') || p.name !== 'Paca de agua 3 Litros')) {
          p.name = 'Paca de agua 3 Litros';
          p.badge = 'Venta por Paca';
          p.unit = '/ paca de 3L';
          p.image = 'assets/bolsa-3l.jpg';
          changed = true;
        }
        if (p.id === '250') {
          p.image = 'assets/bolsa-250ml.jpg';
        }
        return p;
      });
      if (changed) setStorage(key, res);
    }
    return res;
  }

  function setStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function formatMoney(amount) {
    return '$' + Number(amount).toLocaleString('es-CO');
  }

  // Inicializar almacenamiento si está vacío
  if (!localStorage.getItem(STORAGE_KEYS.PRODUCTS)) setStorage(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS);
  if (!localStorage.getItem(STORAGE_KEYS.ORDERS)) setStorage(STORAGE_KEYS.ORDERS, DEFAULT_ORDERS);
  if (!localStorage.getItem(STORAGE_KEYS.ROUTES)) setStorage(STORAGE_KEYS.ROUTES, DEFAULT_ROUTES);
  if (!localStorage.getItem(STORAGE_KEYS.PQRS)) setStorage(STORAGE_KEYS.PQRS, DEFAULT_PQRS);

  // ==========================================================================
  // PESTAÑAS
  // ==========================================================================
  const tabBtns = document.querySelectorAll('.admin-tab-btn');
  const tabContents = document.querySelectorAll('.admin-tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => (c.style.display = 'none'));

      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.style.display = 'block';
    });
  });

  // ==========================================================================
  // MÓDULO 1: CRUD DE PRODUCTOS
  // ==========================================================================
  const productsTableBody = document.getElementById('products-table-body');
  const productModal = document.getElementById('product-modal');
  const productForm = document.getElementById('product-form');
  const btnAddProduct = document.getElementById('btn-add-product');
  const btnCloseProductModal = document.getElementById('btn-close-product-modal');
  const btnCancelProduct = document.getElementById('btn-cancel-product');

  function renderProducts() {
    const products = getStorage(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS);
    document.getElementById('tab-badge-products').textContent = products.length;

    productsTableBody.innerHTML = '';
    products.forEach((prod, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <img src="${prod.image || 'assets/bolsa-250ml.jpg'}" alt="${prod.name}" style="width: 48px; height: 48px; object-fit: cover; border-radius: 4px; border: 1px solid #CBD5E1;">
        </td>
        <td>
          <strong>${prod.name}</strong>
          <div style="font-size: 12px; color: var(--ink-soft); max-width: 320px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${prod.desc || ''}</div>
        </td>
        <td>
          <span style="font-size: 12px; font-weight: 600; background: var(--blue-pale); color: var(--blue-deep); padding: 3px 8px; border-radius: 10px;">
            ${prod.badge || 'General'}
          </span>
        </td>
        <td>
          <strong style="color: var(--blue-deep); font-size: 15px;">${formatMoney(prod.price)}</strong>
          <span style="font-size: 12px; color: var(--ink-soft);">${prod.unit || ''}</span>
        </td>
        <td>
          <span class="status-pill ${prod.active ? 'status-activo' : 'status-inactivo'}">
            ● ${prod.active ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        <td style="text-align: right;">
          <button type="button" class="btn btn-ghost btn-sm btn-edit-prod" data-index="${index}" style="color: var(--blue-deep); border-color: #CBD5E1;">
            ✏️ Editar
          </button>
          <button type="button" class="btn btn-danger btn-sm btn-delete-prod" data-index="${index}" style="margin-left: 6px;">
            🗑️
          </button>
        </td>
      `;

      // Eventos de edición y eliminación
      tr.querySelector('.btn-edit-prod').addEventListener('click', () => openEditProductModal(index));
      tr.querySelector('.btn-delete-prod').addEventListener('click', () => deleteProduct(index));

      productsTableBody.appendChild(tr);
    });
  }

  function openEditProductModal(index) {
    const products = getStorage(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS);
    const prod = products[index];
    if (!prod) return;

    document.getElementById('product-modal-title').textContent = 'Editar Producto';
    document.getElementById('prod-id').value = index;
    document.getElementById('prod-name').value = prod.name;
    document.getElementById('prod-price').value = prod.price;
    document.getElementById('prod-unit').value = prod.unit || '';
    document.getElementById('prod-badge').value = prod.badge || '';
    document.getElementById('prod-status').value = prod.active ? 'true' : 'false';
    document.getElementById('prod-desc').value = prod.desc || '';
    document.getElementById('prod-image').value = prod.image || '';

    productModal.style.display = 'flex';
  }

  function openNewProductModal() {
    document.getElementById('product-modal-title').textContent = 'Nuevo Producto';
    document.getElementById('prod-id').value = 'new';
    productForm.reset();
    document.getElementById('prod-unit').value = '/ unidad';
    document.getElementById('prod-status').value = 'true';
    document.getElementById('prod-image').value = 'assets/bolsa-250ml.jpg';
    productModal.style.display = 'flex';
  }

  function closeProductModal() {
    productModal.style.display = 'none';
  }

  function deleteProduct(index) {
    const products = getStorage(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS);
    const prod = products[index];
    if (!prod) return;

    if (confirm(`¿Estás seguro de eliminar el producto "${prod.name}"?`)) {
      products.splice(index, 1);
      setStorage(STORAGE_KEYS.PRODUCTS, products);
      renderProducts();
    }
  }

  if (btnAddProduct) btnAddProduct.addEventListener('click', openNewProductModal);
  if (btnCloseProductModal) btnCloseProductModal.addEventListener('click', closeProductModal);
  if (btnCancelProduct) btnCancelProduct.addEventListener('click', closeProductModal);

  if (productForm) {
    productForm.addEventListener('submit', e => {
      e.preventDefault();
      const products = getStorage(STORAGE_KEYS.PRODUCTS, DEFAULT_PRODUCTS);
      const prodId = document.getElementById('prod-id').value;

      const newProd = {
        id: prodId === 'new' ? 'prod_' + Date.now() : products[prodId].id,
        name: document.getElementById('prod-name').value.trim(),
        price: Number(document.getElementById('prod-price').value),
        unit: document.getElementById('prod-unit').value.trim(),
        badge: document.getElementById('prod-badge').value.trim() || 'Estándar',
        active: document.getElementById('prod-status').value === 'true',
        desc: document.getElementById('prod-desc').value.trim(),
        image: document.getElementById('prod-image').value.trim() || 'assets/bolsa-250ml.jpg'
      };

      if (prodId === 'new') {
        products.push(newProd);
      } else {
        products[prodId] = newProd;
      }

      setStorage(STORAGE_KEYS.PRODUCTS, products);
      closeProductModal();
      renderProducts();
    });
  }

  // ==========================================================================
  // MÓDULO 2: GESTIÓN DE PEDIDOS (FINALIZAR / CANCELAR / EN RUTA)
  // ==========================================================================
  const ordersTableBody = document.getElementById('orders-table-body');
  const orderModal = document.getElementById('order-modal');
  const manualOrderForm = document.getElementById('manual-order-form');
  const btnAddOrder = document.getElementById('btn-add-order');
  const btnCloseOrderModal = document.getElementById('btn-close-order-modal');
  const btnCancelOrder = document.getElementById('btn-cancel-order');
  const filterBtns = document.querySelectorAll('.order-filter-btn');

  let currentOrderFilter = 'todos';

  function renderOrders() {
    const orders = getStorage(STORAGE_KEYS.ORDERS, DEFAULT_ORDERS);
    document.getElementById('tab-badge-orders').textContent = orders.length;

    ordersTableBody.innerHTML = '';
    const filtered = currentOrderFilter === 'todos' 
      ? orders 
      : orders.filter(o => o.status.toLowerCase() === currentOrderFilter.toLowerCase());

    if (filtered.length === 0) {
      ordersTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--ink-soft); padding: 24px;">
            No hay pedidos con el estado "${currentOrderFilter}".
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach((order, index) => {
      // Encontrar el índice original en el arreglo completo
      const realIndex = orders.findIndex(o => o.id === order.id);

      let statusClass = 'status-pendiente';
      if (order.status === 'En ruta') statusClass = 'status-ruta';
      if (order.status === 'Finalizado') statusClass = 'status-finalizado';
      if (order.status === 'Cancelado') statusClass = 'status-cancelado';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong style="font-size: 13.5px;">${order.id}</strong></td>
        <td>
          <strong>${order.client}</strong>
          <div style="font-size: 12px; color: var(--ink-soft);">${order.phone}</div>
        </td>
        <td>${order.items}</td>
        <td><strong style="color: var(--blue-deep);">${formatMoney(order.total)}</strong></td>
        <td style="font-size: 13px; color: var(--ink-soft);">${order.date}</td>
        <td>
          <span class="status-pill ${statusClass}">● ${order.status}</span>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          ${
            order.status !== 'Finalizado' && order.status !== 'Cancelado'
              ? `
                <button type="button" class="btn btn-sm btn-success btn-finish-order" data-idx="${realIndex}" title="Marcar como entregado y finalizado">
                  ✓ Finalizar
                </button>
                <button type="button" class="btn btn-sm btn-ghost btn-route-order" data-idx="${realIndex}" style="color: var(--blue-mid); border-color: var(--blue-mid); margin-left: 4px;" title="Poner en camino">
                  🚚 En Ruta
                </button>
                <button type="button" class="btn btn-sm btn-danger btn-cancel-order" data-idx="${realIndex}" style="margin-left: 4px;" title="Cancelar pedido">
                  ✕ Cancelar
                </button>
              `
              : `
                <span style="font-size: 12.5px; color: var(--ink-soft); margin-right: 8px;">Completado</span>
                <button type="button" class="btn btn-sm btn-ghost btn-delete-order" data-idx="${realIndex}" style="color: #991B1B; border-color: #F8D7DA;" title="Eliminar registro">
                  🗑️
                </button>
              `
          }
        </td>
      `;

      // Event listeners para acciones de pedidos
      const finishBtn = tr.querySelector('.btn-finish-order');
      if (finishBtn) finishBtn.addEventListener('click', () => updateOrderStatus(realIndex, 'Finalizado'));

      const routeBtn = tr.querySelector('.btn-route-order');
      if (routeBtn) routeBtn.addEventListener('click', () => updateOrderStatus(realIndex, 'En ruta'));

      const cancelBtn = tr.querySelector('.btn-cancel-order');
      if (cancelBtn) cancelBtn.addEventListener('click', () => updateOrderStatus(realIndex, 'Cancelado'));

      const deleteBtn = tr.querySelector('.btn-delete-order');
      if (deleteBtn) deleteBtn.addEventListener('click', () => deleteOrder(realIndex));

      ordersTableBody.appendChild(tr);
    });
  }

  function updateOrderStatus(index, newStatus) {
    const orders = getStorage(STORAGE_KEYS.ORDERS, DEFAULT_ORDERS);
    if (orders[index]) {
      orders[index].status = newStatus;
      setStorage(STORAGE_KEYS.ORDERS, orders);
      renderOrders();
    }
  }

  function deleteOrder(index) {
    const orders = getStorage(STORAGE_KEYS.ORDERS, DEFAULT_ORDERS);
    if (confirm('¿Eliminar este pedido del historial?')) {
      orders.splice(index, 1);
      setStorage(STORAGE_KEYS.ORDERS, orders);
      renderOrders();
    }
  }

  // Filtros de estado de pedidos
  function styleFilterBtns(activeBtn) {
    filterBtns.forEach(b => {
      b.classList.remove('btn-primary');
      b.style.background = 'var(--paper)';
      b.style.color = 'var(--ink-soft)';
      b.style.border = '1px solid var(--rule)';
    });
    activeBtn.classList.add('btn-primary');
    activeBtn.style.background = '';
    activeBtn.style.color = '';
    activeBtn.style.border = '';
  }

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      styleFilterBtns(btn);
      currentOrderFilter = btn.dataset.filter;
      renderOrders();
    });
  });

  // Aplicar estilo inicial al botón "Todos"
  if (filterBtns.length > 0) styleFilterBtns(filterBtns[0]);

  if (btnAddOrder) {
    btnAddOrder.addEventListener('click', () => {
      manualOrderForm.reset();
      orderModal.style.display = 'flex';
    });
  }
  if (btnCloseOrderModal) btnCloseOrderModal.addEventListener('click', () => (orderModal.style.display = 'none'));
  if (btnCancelOrder) btnCancelOrder.addEventListener('click', () => (orderModal.style.display = 'none'));

  if (manualOrderForm) {
    manualOrderForm.addEventListener('submit', e => {
      e.preventDefault();
      const orders = getStorage(STORAGE_KEYS.ORDERS, DEFAULT_ORDERS);

      const newOrder = {
        id: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
        client: document.getElementById('ord-client').value.trim(),
        phone: document.getElementById('ord-phone').value.trim(),
        items: document.getElementById('ord-items').value.trim(),
        total: Number(document.getElementById('ord-total').value),
        date: 'Hoy, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: document.getElementById('ord-status').value
      };

      orders.unshift(newOrder);
      setStorage(STORAGE_KEYS.ORDERS, orders);
      orderModal.style.display = 'none';
      renderOrders();
    });
  }

  // ==========================================================================
  // MÓDULO 3: GESTIÓN DE RUTAS DE ENTREGA
  // ==========================================================================
  const routesContainer = document.getElementById('routes-container');
  const routeModal = document.getElementById('route-modal');
  const routeForm = document.getElementById('route-form');
  const btnAddRoute = document.getElementById('btn-add-route');
  const btnCloseRouteModal = document.getElementById('btn-close-route-modal');
  const btnCancelRoute = document.getElementById('btn-cancel-route');

  function renderRoutes() {
    const routes = getStorage(STORAGE_KEYS.ROUTES, DEFAULT_ROUTES);
    document.getElementById('tab-badge-routes').textContent = routes.length;

    routesContainer.innerHTML = '';
    routes.forEach((route, index) => {
      let statusClass = 'status-pendiente';
      if (route.status === 'En ruta') statusClass = 'status-ruta';
      if (route.status === 'Completada') statusClass = 'status-finalizado';

      const card = document.createElement('div');
      card.className = 'route-card';
      card.innerHTML = `
        <div>
          <div class="route-card-head">
            <h4>${route.name}</h4>
            <span class="status-pill ${statusClass}">● ${route.status}</span>
          </div>
          <div class="route-details">
            <div>👤 <strong>Repartidor:</strong> ${route.driver}</div>
            <div>⏰ <strong>Horario:</strong> ${route.time}</div>
            <div style="margin-top: 6px; font-size: 13px;">📝 ${route.notes || 'Sin observaciones'}</div>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--rule); padding-top: 12px; margin-top: 10px;">
          <div style="display: flex; gap: 6px;">
            ${
              route.status !== 'Completada'
                ? `
                  <button type="button" class="btn btn-sm btn-success btn-finish-route" data-idx="${index}">✓ Completada</button>
                  <button type="button" class="btn btn-sm btn-ghost btn-start-route" data-idx="${index}" style="color: var(--blue-mid); border-color: var(--blue-mid);">🚚 En Ruta</button>
                `
                : `<span style="font-size: 12px; color: var(--success); font-weight: 700;">Despachada con éxito</span>`
            }
          </div>
          <button type="button" class="btn btn-sm btn-danger btn-delete-route" data-idx="${index}" title="Eliminar ruta">🗑️</button>
        </div>
      `;

      const finishRouteBtn = card.querySelector('.btn-finish-route');
      if (finishRouteBtn) finishRouteBtn.addEventListener('click', () => updateRouteStatus(index, 'Completada'));

      const startRouteBtn = card.querySelector('.btn-start-route');
      if (startRouteBtn) startRouteBtn.addEventListener('click', () => updateRouteStatus(index, 'En ruta'));

      card.querySelector('.btn-delete-route').addEventListener('click', () => deleteRoute(index));

      routesContainer.appendChild(card);
    });
  }

  function updateRouteStatus(index, newStatus) {
    const routes = getStorage(STORAGE_KEYS.ROUTES, DEFAULT_ROUTES);
    if (routes[index]) {
      routes[index].status = newStatus;
      setStorage(STORAGE_KEYS.ROUTES, routes);
      renderRoutes();
    }
  }

  function deleteRoute(index) {
    const routes = getStorage(STORAGE_KEYS.ROUTES, DEFAULT_ROUTES);
    if (confirm('¿Eliminar esta ruta de reparto?')) {
      routes.splice(index, 1);
      setStorage(STORAGE_KEYS.ROUTES, routes);
      renderRoutes();
    }
  }

  if (btnAddRoute) btnAddRoute.addEventListener('click', () => {
    routeForm.reset();
    routeModal.style.display = 'flex';
  });
  if (btnCloseRouteModal) btnCloseRouteModal.addEventListener('click', () => (routeModal.style.display = 'none'));
  if (btnCancelRoute) btnCancelRoute.addEventListener('click', () => (routeModal.style.display = 'none'));

  if (routeForm) {
    routeForm.addEventListener('submit', e => {
      e.preventDefault();
      const routes = getStorage(STORAGE_KEYS.ROUTES, DEFAULT_ROUTES);

      const newRoute = {
        id: 'R-' + Date.now(),
        name: document.getElementById('route-name').value.trim(),
        driver: document.getElementById('route-driver').value.trim(),
        time: document.getElementById('route-time').value.trim(),
        status: document.getElementById('route-status').value,
        notes: document.getElementById('route-notes').value.trim()
      };

      routes.push(newRoute);
      setStorage(STORAGE_KEYS.ROUTES, routes);
      routeModal.style.display = 'none';
      renderRoutes();
    });
  }

  // ==========================================================================
  // MÓDULO 4: BUZÓN PQRS
  // ==========================================================================
  const pqrsTableBody = document.getElementById('pqrs-table-body');

  function renderPQRS() {
    const pqrsList = getStorage(STORAGE_KEYS.PQRS, DEFAULT_PQRS);
    document.getElementById('tab-badge-pqrs').textContent = pqrsList.length;

    pqrsTableBody.innerHTML = '';
    if (pqrsList.length === 0) {
      pqrsTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--ink-soft); padding: 24px;">
            No hay solicitudes o quejas registradas aún.
          </td>
        </tr>
      `;
      return;
    }

    pqrsList.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${item.type}</strong></td>
        <td>${item.name}</td>
        <td>${item.contact || 'No indicado'}</td>
        <td style="max-width: 320px;">${item.message}</td>
        <td style="font-size: 13px; color: var(--ink-soft);">${item.date || 'Reciente'}</td>
        <td>
          <span class="status-pill ${item.status === 'Atendida' ? 'status-activo' : 'status-pendiente'}">
            ● ${item.status || 'Nueva'}
          </span>
        </td>
        <td style="text-align: right;">
          ${
            item.status !== 'Atendida'
              ? `<button type="button" class="btn btn-sm btn-success btn-attend-pqr" data-idx="${index}">✓ Atendida</button>`
              : `<span style="font-size: 12px; color: var(--ink-soft);">Revisado</span>`
          }
        </td>
      `;

      const attendBtn = tr.querySelector('.btn-attend-pqr');
      if (attendBtn) {
        attendBtn.addEventListener('click', () => {
          pqrsList[index].status = 'Atendida';
          setStorage(STORAGE_KEYS.PQRS, pqrsList);
          renderPQRS();
        });
      }

      pqrsTableBody.appendChild(tr);
    });
  }

  // Render inicial de todos los módulos
  renderProducts();
  renderOrders();
  renderRoutes();
  renderPQRS();

})();
