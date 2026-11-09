/**
 * AGUA MAGALY — JAVASCRIPT PRINCIPAL (TIENDA Y ATENCIÓN PÚBLICA)
 * Catálogo sincronizado con LocalStorage, Carrito, Pedidos WhatsApp y PQRS
 */

(function () {
  'use strict';

  // Teléfono oficial de atención de Agua Magaly (Nuevo número: 3054136677)
  const WHATSAPP_NUMBER = '573054136677';

  // Capa de datos compartida (nube o navegador)
  const store = window.MagalyStore;

  const STORAGE_KEYS = {
    PRODUCTS: 'magaly_products',
    ORDERS: 'magaly_orders',
    PQRS: 'magaly_pqrs'
  };

  // Escapa texto antes de insertarlo como HTML (protección contra XSS).
  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Solo permite rutas locales, URLs http(s) o imágenes incrustadas (data:).
  function safeImageUrl(value) {
    const url = String(value || '').trim();
    if (!url) return 'assets/bolsa-250ml.jpg';
    if (/^data:image\/(png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(url)) return url;
    if (/^https?:\/\//i.test(url) || /^(\.{0,2}\/)?assets\//i.test(url) || /^[a-z0-9._-]+\.(png|jpe?g|webp|gif|avif)$/i.test(url)) {
      return url;
    }
    return 'assets/bolsa-250ml.jpg';
  }

  /**
   * Guarda un registro en la base de datos en la nube, si está configurada.
   * Si no hay nube, no hace nada (el guardado local ya ocurrió).
   */
  function pushCloud(entity, record) {
    if (!store) return;
    store.ready()
      .then(() => {
        if (!store.isCloud()) return null;
        return store.upsert(entity, record);
      })
      .catch(err => console.warn('[tienda] no se pudo guardar en la nube:', err));
  }

  // Productos predeterminados
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

  function getProducts() {
    const raw = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
    let prods = raw ? JSON.parse(raw) : DEFAULT_PRODUCTS;
    let changed = false;
    prods = prods.map(p => {
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
    if (changed) {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(prods));
    }
    return prods;
  }

  function getOrders() {
    const raw = localStorage.getItem(STORAGE_KEYS.ORDERS);
    return raw ? JSON.parse(raw) : [];
  }

  function saveOrders(orders) {
    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(orders));
  }

  function getPQRS() {
    const raw = localStorage.getItem(STORAGE_KEYS.PQRS);
    return raw ? JSON.parse(raw) : [];
  }

  function savePQRS(list) {
    localStorage.setItem(STORAGE_KEYS.PQRS, JSON.stringify(list));
  }

  function formatMoney(amount) {
    return '$' + Number(amount).toLocaleString('es-CO');
  }

  // Estado reactivo del carrito
  const cart = {};

  // Elementos DOM
  const productsContainer = document.getElementById('products-container');
  const cartListEl = document.getElementById('cart-list');
  const cartCountEl = document.getElementById('cart-count');
  const navBadgeEl = document.getElementById('nav-cart-badge');
  const clearBtn = document.getElementById('clear-cart-btn');
  const waBtn = document.getElementById('whatsapp-btn');
  const grandTotalEl = document.getElementById('grand-total');
  const navTotalEl = document.getElementById('nav-total');
  const emptyMsg = document.getElementById('order-empty-msg');
  const custNameInput = document.getElementById('cust-name');
  const custPhoneInput = document.getElementById('cust-phone');
  const custAddressInput = document.getElementById('cust-address');
  const custCityInput = document.getElementById('cust-city');
  const custConsentInput = document.getElementById('cust-consent');
  const custPhoneHint = document.getElementById('cust-phone-hint');
  const custValidationMsg = document.getElementById('cust-validation-msg');
  const quejasForm = document.getElementById('quejas-form');
  const quejasStatus = document.getElementById('quejas-status');

  function getCustomerData() {
    const name = custNameInput ? custNameInput.value.trim() : '';
    let phone = custPhoneInput ? custPhoneInput.value.trim() : '';
    const address = custAddressInput ? custAddressInput.value.trim() : '';
    const city = custCityInput ? custCityInput.value.trim() : '';
    const consent = !!(custConsentInput && custConsentInput.checked);

    // El teléfono debe ser numérico, exactamente 10 dígitos y empezar por 3
    const isNumeric = /^\d+$/.test(phone);
    const startsWithThree = phone.startsWith('3');
    const isTenDigits = phone.length === 10;
    const phoneValid = isNumeric && startsWithThree && isTenDigits;

    return {
      name,
      phone,
      address,
      city,
      consent,
      phoneValid,
      startsWithThree,
      isTenDigits,
      isValid: name.length >= 3 && address.length >= 4 && city.length >= 3 && phoneValid && consent
    };
  }

  function validateCustomerFields(showErrors = false) {
    if (!custPhoneInput) return false;
    const data = getCustomerData();

    // Actualizar pista y estilos del campo de celular
    if (data.phone.length === 0) {
      if (custPhoneHint) {
        custPhoneHint.textContent = '10 dígitos exactos, debe iniciar por 3';
        custPhoneHint.className = 'cust-hint';
      }
      custPhoneInput.classList.remove('is-valid', 'is-invalid');
    } else if (data.phoneValid) {
      if (custPhoneHint) {
        custPhoneHint.textContent = '✓ Número de celular válido';
        custPhoneHint.className = 'cust-hint ok';
      }
      custPhoneInput.classList.remove('is-invalid');
      custPhoneInput.classList.add('is-valid');
    } else {
      let msg = 'El número debe tener 10 dígitos y empezar por 3';
      if (!data.startsWithThree) {
        msg = '⚠️ Obligatoriamente debe iniciar por el dígito 3';
      } else if (data.phone.length < 10) {
        msg = `Faltan dígitos (${data.phone.length}/10). Debe iniciar por 3`;
      }
      if (custPhoneHint) {
        custPhoneHint.textContent = msg;
        custPhoneHint.className = 'cust-hint warn';
      }
      custPhoneInput.classList.remove('is-valid');
      if (showErrors || data.phone.length === 10 || !data.startsWithThree) {
        custPhoneInput.classList.add('is-invalid');
      }
    }

    // La autorización se marca en rojo mientras no esté aceptada.
    if (custConsentInput && custConsentInput.parentElement) {
      custConsentInput.parentElement.classList.toggle('is-invalid', !data.consent);
    }

    if (showErrors) {
      if (custNameInput) {
        custNameInput.classList.toggle('is-invalid', data.name.length < 3);
        custNameInput.classList.toggle('is-valid', data.name.length >= 3);
      }
      if (custAddressInput) {
        custAddressInput.classList.toggle('is-invalid', data.address.length < 4);
        custAddressInput.classList.toggle('is-valid', data.address.length >= 4);
      }
      if (custCityInput) {
        custCityInput.classList.toggle('is-invalid', data.city.length < 3);
        custCityInput.classList.toggle('is-valid', data.city.length >= 3);
      }
      if (custValidationMsg) {
        const missing = [];
        if (data.name.length < 3) missing.push('Nombre completo');
        if (!data.phoneValid) {
          if (!data.startsWithThree) missing.push('Celular que inicie por 3');
          else missing.push('Celular válido de 10 dígitos');
        }
        if (data.address.length < 4) missing.push('Dirección de entrega');
        if (data.city.length < 3) missing.push('Municipio y Departamento');
        if (!data.consent) missing.push('Autorización de datos personales');

        if (missing.length > 0) {
          custValidationMsg.style.display = 'block';
          custValidationMsg.innerHTML = `⚠️ <strong>Faltan datos obligatorios para coordinar la entrega:</strong> ${missing.join(', ')}.`;
        } else {
          custValidationMsg.style.display = 'none';
        }
      }
    } else if (custValidationMsg && data.isValid) {
      custValidationMsg.style.display = 'none';
    }

    return data.isValid;
  }

  // Event listeners para los campos de datos del cliente
  if (custPhoneInput) {
    custPhoneInput.addEventListener('input', () => {
      // Filtrar estrictamente solo números y máximo 10 dígitos
      custPhoneInput.value = custPhoneInput.value.replace(/\D/g, '').slice(0, 10);
      validateCustomerFields(false);
      renderCart();
    });
  }

  [custNameInput, custAddressInput, custCityInput].forEach(inp => {
    if (inp) {
      inp.addEventListener('input', () => {
        validateCustomerFields(false);
        renderCart();
      });
    }
  });

  // Al marcar o desmarcar la autorización se recalcula el pedido y el botón.
  if (custConsentInput) {
    custConsentInput.addEventListener('change', () => {
      validateCustomerFields(false);
      renderCart();
    });
  }

  /**
   * Renderiza el catálogo dinámico de productos
   */
  function renderCatalog() {
    const products = getProducts().filter(p => p.active);
    if (!productsContainer) return;

    productsContainer.innerHTML = '';
    products.forEach(p => {
      // Inicializar contador en carrito si no existe
      if (cart[p.id] === undefined) cart[p.id] = 0;

      const row = document.createElement('div');
      row.className = 'product-row';
      row.dataset.id = p.id;
      row.dataset.price = p.price;

      row.innerHTML = `
        <div class="product-thumb">
          <img src="${esc(safeImageUrl(p.image))}" alt="${esc(p.name)}">
        </div>
        <div class="product-info">
          <h3>${esc(p.name)}</h3>
          <span class="badge-tag">${esc(p.badge || 'Producto')}</span>
          <div class="desc">${esc(p.desc || '')}</div>
          <div class="price">${formatMoney(p.price)} <span class="note">${esc(p.unit || '')}</span></div>
        </div>
        <div class="qty-stepper">
          <button type="button" class="qty-minus" aria-label="Quitar ${esc(p.name)}">–</button>
          <span class="qty-val">${cart[p.id] || 0}</span>
          <button type="button" class="qty-plus" aria-label="Agregar ${esc(p.name)}">+</button>
        </div>
        <div class="row-subtotal">${formatMoney(p.price * (cart[p.id] || 0))}</div>
      `;

      row.querySelector('.qty-plus').addEventListener('click', () => {
        cart[p.id] = (cart[p.id] || 0) + 1;
        renderCart();
      });

      row.querySelector('.qty-minus').addEventListener('click', () => {
        cart[p.id] = Math.max(0, (cart[p.id] || 0) - 1);
        renderCart();
      });

      productsContainer.appendChild(row);
    });
  }

  /**
   * Actualiza el desglose visual del carrito y los totales
   */
  function renderCart() {
    const products = getProducts();
    const productMap = {};
    products.forEach(p => (productMap[p.id] = p));

    let grandTotal = 0;
    let totalItems = 0;

    // Actualizar filas en el catálogo
    if (productsContainer) {
      const rows = productsContainer.querySelectorAll('.product-row');
      rows.forEach(row => {
        const id = row.dataset.id;
        const p = productMap[id];
        if (!p) return;

        const qty = cart[id] || 0;
        const subtotal = p.price * qty;

        const valEl = row.querySelector('.qty-val');
        const subEl = row.querySelector('.row-subtotal');
        if (valEl) valEl.textContent = qty;
        if (subEl) subEl.textContent = formatMoney(subtotal);

        grandTotal += subtotal;
        totalItems += qty;
      });
    }

    // Actualizar lista en desglose
    if (cartListEl) {
      cartListEl.innerHTML = '';
      let hasItems = false;

      Object.keys(cart).forEach(id => {
        const qty = cart[id];
        if (qty > 0 && productMap[id]) {
          hasItems = true;
          const p = productMap[id];
          const subtotal = qty * p.price;

          const line = document.createElement('div');
          line.className = 'cart-line';
          line.innerHTML = `
            <div>
              <div class="cart-line-name">${esc(p.name)}</div>
              <small style="color: var(--ink-soft); font-size: 12.5px;">${esc(p.unit || '')}</small>
            </div>
            <span class="cart-line-qty">${qty} × ${formatMoney(p.price)}</span>
            <span class="cart-line-subtotal">${formatMoney(subtotal)}</span>
            <button type="button" class="cart-remove" aria-label="Quitar ${esc(p.name)}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          `;

          line.querySelector('.cart-remove').addEventListener('click', () => {
            cart[id] = 0;
            renderCart();
          });

          cartListEl.appendChild(line);
        }
      });

      if (!hasItems) {
        const emptyState = document.createElement('div');
        emptyState.className = 'cart-empty';
        emptyState.textContent = 'Aún no has agregado ninguna paca o bolsa. Usa los botones + para sumar a tu pedido.';
        cartListEl.appendChild(emptyState);
      }

      if (clearBtn) clearBtn.disabled = !hasItems;
    }

    // Contadores
    if (cartCountEl) {
      cartCountEl.textContent = `(${totalItems} ${totalItems === 1 ? 'unidad' : 'unidades'})`;
    }
    if (navBadgeEl) {
      navBadgeEl.textContent = totalItems;
    }

    // Totales
    if (grandTotalEl) grandTotalEl.textContent = formatMoney(grandTotal);
    if (navTotalEl) navTotalEl.textContent = formatMoney(grandTotal);

    // Botón de WhatsApp
    if (waBtn) {
      if (grandTotal === 0) {
        if (emptyMsg) {
          emptyMsg.style.display = 'block';
          emptyMsg.textContent = 'Agrega al menos una paca al pedido para enviar por WhatsApp.';
        }
        waBtn.setAttribute('aria-disabled', 'true');
        waBtn.href = `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}`;
        waBtn.onclick = function (e) {
          e.preventDefault();
          alert('Por favor agrega al menos una paca de agua a tu pedido antes de continuar.');
        };
      } else {
        if (emptyMsg) {
          emptyMsg.style.display = 'none';
        }
        waBtn.removeAttribute('aria-disabled');

        const custData = getCustomerData();

        // Campos obligatorios de entrega y contacto: sin ellos no se continúa
        if (!custData.isValid) {
          if (emptyMsg) {
            emptyMsg.style.display = 'block';
            emptyMsg.textContent = '⚠️ Completa tus datos de entrega y contacto (campos obligatorios) para poder enviar el pedido.';
          }
          validateCustomerFields(true);
          waBtn.href = `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}`;
          waBtn.onclick = function (e) {
            e.preventDefault();
            const card = document.getElementById('customer-data-card');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          };
          return;
        }

        const summaryItems = [];
        const itemsTextLines = [];
        Object.keys(cart).forEach(id => {
          if (cart[id] > 0 && productMap[id]) {
            const p = productMap[id];
            itemsTextLines.push(`• *${cart[id]}* × ${p.name} (${formatMoney(cart[id] * p.price)})`);
            summaryItems.push(`${cart[id]} × ${p.name}`);
          }
        });

        const clientName = custData.name || 'Cliente Web';
        const clientPhone = custData.phone || 'Contacto por este chat';
        const clientAddress = custData.address || 'Bajo Grande / Sahagún';
        const clientCity = custData.city || 'Sahagún, Córdoba';

        const messageLines = [
          '💧 *¡HOLA AGUA MAGALY! DESEO REALIZAR UN PEDIDO:*',
          '──────────────────────────',
          '*DETALLE DE LA COMPRA:*',
          ...itemsTextLines,
          '──────────────────────────',
          `💰 *Total a pagar:* ${formatMoney(grandTotal)} COP`,
          '',
          '📋 *DATOS DE ENTREGA Y CONTACTO:*',
          `👤 *Cliente:* ${clientName}`,
          `📱 *Teléfono de contacto:* ${clientPhone}`,
          `📍 *Dirección:* ${clientAddress}`,
          `🏙️ *Municipio / Depto:* ${clientCity}`,
          '✅ *Autorización de datos personales:* aceptada',
          '──────────────────────────',
          'Por favor confírmenme disponibilidad y horario de despacho. ¡Muchas gracias!'
        ];

        const encoded = encodeURIComponent(messageLines.join('\n'));
        const directWaUrl = `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encoded}`;
        
        waBtn.href = directWaUrl;

        // Enlaces del pie de página sincronizados
        const footerWa = document.getElementById('footer-whatsapp');
        if (footerWa) footerWa.href = directWaUrl;
        const footerWaIcon = document.getElementById('footer-whatsapp-icon');
        if (footerWaIcon) footerWaIcon.href = directWaUrl;

        // Al hacer click, registrar pedido en LocalStorage (Admin) y permitir redirección directa al chat de WhatsApp
        waBtn.onclick = function () {
          const orders = getOrders();
          const orderId = 'ORD-' + Math.floor(1000 + Math.random() * 9000);
          const createdAt = new Date().toISOString();
          const newOrder = {
            id: orderId,
            code: orderId,
            client: clientName,
            phone: clientPhone,
            address: `${clientAddress} (${clientCity})`,
            items: summaryItems.join(', '),
            total: grandTotal,
            createdAt: createdAt,
            date: 'Hoy, ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            status: 'Pendiente',
            driverId: null,
            driverName: '',
            payment: 'Efectivo',
            paid: false,
            notes: '',
            dataConsent: true,
            dataConsentAt: createdAt,
            events: [{ type: 'creado', at: createdAt, by: 'Cliente (web)', note: 'Pedido enviado por WhatsApp' }]
          };
          orders.unshift(newOrder);
          saveOrders(orders);
          pushCloud('orders', newOrder);
          // El navegador abre directWaUrl en nueva pestaña de WhatsApp directamente
        };
      }
    }
  }

  // Botón para vaciar carrito
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      Object.keys(cart).forEach(k => (cart[k] = 0));
      renderCart();
    });
  }

  // Scroll suave a los datos de entrega del pedido desde la barra de navegación
  const navCartBtn = document.getElementById('nav-cart-btn');
  if (navCartBtn) {
    navCartBtn.addEventListener('click', () => {
      const target = document.getElementById('customer-data-card') || document.getElementById('productos');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }

  // Configuración de enlaces por defecto
  const defaultWaUrl = `https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}`;
  const footerWaIcon = document.getElementById('footer-whatsapp-icon');
  const footerWa = document.getElementById('footer-whatsapp');
  if (footerWaIcon) footerWaIcon.href = defaultWaUrl;
  if (footerWa) footerWa.href = defaultWaUrl;

  // Render inicial del catálogo y carrito
  renderCatalog();
  renderCart();

  // Si hay base de datos en la nube, trae el catálogo real (precios y fotos)
  if (store) {
    store.ready()
      .then(() => {
        if (!store.isCloud()) return null;
        return store.list('products');
      })
      .then(products => {
        if (!Array.isArray(products) || !products.length) return;
        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
        renderCatalog();
        renderCart();
      })
      .catch(err => console.warn('[tienda] no se pudo cargar el catálogo:', err));
  }

  // ==========================================================================
  // FORMULARIO DE QUEJAS Y SUGERENCIAS (PQRS)
  // ==========================================================================
  if (quejasForm) {
    quejasForm.addEventListener('submit', function (e) {
      e.preventDefault();

      const nombre = document.getElementById('q-nombre').value.trim();
      const contacto = document.getElementById('q-contacto').value.trim();
      const tipo = document.getElementById('q-tipo').value;
      const mensaje = document.getElementById('q-mensaje').value.trim();

      if (!nombre || !mensaje) {
        if (quejasStatus) {
          quejasStatus.style.display = 'block';
          quejasStatus.textContent = 'Por favor completa tu nombre y el mensaje antes de enviar.';
        }
        return;
      }

      // Guardar también en el panel del admin
      const pqrsList = getPQRS();
      pqrsList.unshift({
        id: 'PQR-' + Date.now(),
        type: tipo,
        name: nombre,
        contact: contacto,
        message: mensaje,
        date: new Date().toLocaleDateString(),
        status: 'Nueva'
      });
      savePQRS(pqrsList);
      pushCloud('pqrs', pqrsList[0]);

      const pqrsLines = [
        `📋 *NUEVA SOLICITUD DE ${tipo.toUpperCase()} — AGUA MAGALY*`,
        '──────────────────────────',
        `👤 *Nombre:* ${nombre}`,
        contacto ? `📞 *Contacto:* ${contacto}` : '📞 *Contacto:* No suministrado',
        `📌 *Tipo:* ${tipo}`,
        `💬 *Mensaje:* ${mensaje}`,
        '──────────────────────────',
        'Enviado desde el portal web oficial de Agua Magaly.'
      ];

      const encodedPqrs = encodeURIComponent(pqrsLines.join('\n'));
      window.open(`https://api.whatsapp.com/send?phone=${WHATSAPP_NUMBER}&text=${encodedPqrs}`, '_blank', 'noopener');

      if (quejasStatus) {
        quejasStatus.style.display = 'block';
        quejasStatus.style.color = '#BFE0EE';
        quejasStatus.textContent = '¡Gracias! Tu reporte ha sido registrado y enviado por WhatsApp.';
      }
      quejasForm.reset();
    });
  }

  // ==========================================================================
  // RUTA /login y #login
  // Permite acceder al login poniendo "/login" o "#login" en la barra de direcciones
  // ==========================================================================
  function checkLoginRoute() {
    const hash = window.location.hash.toLowerCase();
    if (hash === '#login' || hash === '#/login' || hash === '#admin') {
      window.location.href = 'login.html';
    }
  }
  window.addEventListener('hashchange', checkLoginRoute);
  checkLoginRoute();

  // ==========================================================================
  // MENÚ DE NAVEGACIÓN MÓVIL
  // ==========================================================================
  const navToggle = document.getElementById('nav-toggle');
  const navMobile = document.getElementById('nav-mobile');

  if (navToggle && navMobile) {
    const setMobileMenu = (open) => {
      navMobile.classList.toggle('is-open', open);
      navToggle.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
    };

    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setMobileMenu(!navMobile.classList.contains('is-open'));
    });

    navMobile.addEventListener('click', (e) => {
      if (e.target.closest('a')) setMobileMenu(false);
    });

    document.addEventListener('click', (e) => {
      if (!navMobile.contains(e.target) && !navToggle.contains(e.target)) {
        setMobileMenu(false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setMobileMenu(false);
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) setMobileMenu(false);
    });
  }

  // ==========================================================================
  // ATAJO "VOLVER AL PANEL" (solo si hay una sesión de administrador o reparto)
  // ==========================================================================
  const staffReturn = document.getElementById('staff-return');
  if (staffReturn) {
    try {
      const raw = localStorage.getItem('magaly_session');
      const session = raw ? JSON.parse(raw) : null;
      const expired = session && session.expiresAt && Date.now() > session.expiresAt;
      if (session && session.userId && !expired) {
        const isDriver = session.role === 'driver';
        staffReturn.href = isDriver ? 'repartidor.html' : 'admin.html';
        const text = staffReturn.querySelector('.staff-return-text');
        if (text) text.textContent = isDriver ? 'Mi panel de reparto' : 'Volver al panel';
        staffReturn.setAttribute('aria-label', isDriver ? 'Volver a mi panel de reparto' : 'Volver al panel de administración');
        staffReturn.title = isDriver ? 'Volver a mi panel de reparto' : 'Volver al panel de administración';
        staffReturn.hidden = false;
      }
    } catch (err) {
      /* Si no se puede leer la sesión, el botón permanece oculto. */
    }
  }

})();
