/**
 * AGUA MAGALY — CAPA DE DATOS (STORE)
 * ---------------------------------------------------------------------------
 * Toda la aplicación habla SOLO con este módulo. Hoy persiste en localStorage,
 * pero la API es asíncrona y está aislada, de modo que conectar Supabase más
 * adelante consiste en reemplazar `LocalAdapter` por `SupabaseAdapter`
 * sin tocar el panel de administración ni el del repartidor.
 *
 *   MagalyStore.ready()                  -> espera la inicialización
 *   await MagalyStore.list('orders')     -> array de registros
 *   await MagalyStore.upsert('orders', o)-> crea o actualiza (por id)
 *   await MagalyStore.remove('orders', id)
 *   MagalyStore.subscribe(fn)            -> se dispara ante cualquier cambio
 */

window.MagalyStore = (function () {
  'use strict';

  // ==========================================================================
  // CLAVES DE ALMACENAMIENTO
  // ==========================================================================
  const KEYS = {
    products: 'magaly_products',
    orders: 'magaly_orders',
    routes: 'magaly_routes',
    pqrs: 'magaly_pqrs',
    users: 'magaly_users',
    settings: 'magaly_settings'
  };

  const ENTITIES = ['products', 'orders', 'routes', 'pqrs', 'users', 'settings'];

  // ==========================================================================
  // ESTADOS Y CATÁLOGOS
  // ==========================================================================
  const ORDER_STATUS = {
    pendiente: 'Pendiente',
    enruta: 'En ruta',
    entregado: 'Entregado',
    cancelado: 'Cancelado'
  };

  // Normaliza estados heredados (la tienda pública escribía "Finalizado")
  function normalizeStatus(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'en ruta' || raw === 'enruta') return ORDER_STATUS.enruta;
    if (raw === 'finalizado' || raw === 'entregado' || raw === 'completado') return ORDER_STATUS.entregado;
    if (raw === 'cancelado' || raw === 'anulado') return ORDER_STATUS.cancelado;
    return ORDER_STATUS.pendiente;
  }

  const EVENT_LABEL = {
    creado: 'Pedido creado',
    asignado: 'Asignado a repartidor',
    en_ruta: 'Salió a ruta',
    entregado: 'Entregado',
    no_entregado: 'No entregado',
    cancelado: 'Cancelado',
    pendiente: 'Volvió a pendiente',
    nota: 'Nota'
  };

  // ==========================================================================
  // UTILIDADES
  // ==========================================================================
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function formatMoney(amount) {
    return '$' + Number(amount || 0).toLocaleString('es-CO');
  }

  function formatDateTime(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' }) +
      ' · ' + d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  function formatTime(iso) {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d)) return '—';
    return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  function sameDay(a, b) {
    const d1 = new Date(a), d2 = new Date(b);
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
  }

  function relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff)) return '';
    const min = Math.round(diff / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return 'hace ' + min + ' min';
    const h = Math.round(min / 60);
    if (h < 24) return 'hace ' + h + ' h';
    const d = Math.round(h / 24);
    return 'hace ' + d + ' d';
  }

  // Intenta reconstruir la fecha de pedidos viejos: "Hoy, 09:30 AM", "Ayer, ..."
  function parseLegacyDate(text, fallbackIso) {
    if (!text || typeof text !== 'string') return fallbackIso || nowIso();
    const m = text.match(/(\d{1,2}):(\d{2})\s*([ap])\.?\s*m\.?/i);
    if (!m) return fallbackIso || nowIso();
    let hour = parseInt(m[1], 10) % 12;
    if (/p/i.test(m[3])) hour += 12;
    const d = new Date();
    if (/ayer/i.test(text)) d.setDate(d.getDate() - 1);
    d.setHours(hour, parseInt(m[2], 10), 0, 0);
    return d.toISOString();
  }

  function sortOrders(list) {
    return list.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  // ==========================================================================
  // ADAPTADOR LOCAL (reemplazable por Supabase)
  // ==========================================================================
  const LocalAdapter = {
    read(key) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        console.warn('[store] lectura inválida en', key, err);
        return null;
      }
    },
    write(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  };

  // ==========================================================================
  // DATOS SEMILLA
  // ==========================================================================
  const SEED = {
    products: [
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
    ],
    users: [
      {
        id: 'u_admin',
        role: 'admin',
        name: 'Administrador',
        username: 'admin',
        hash: '',
        phone: '',
        active: true,
        createdAt: nowIso()
      },
      {
        id: 'u_carlos',
        role: 'driver',
        name: 'Carlos Gómez',
        username: 'carlos',
        hash: '',
        phone: '305 413 6677',
        active: true,
        color: '#1C7FA8',
        createdAt: nowIso()
      },
      {
        id: 'u_andres',
        role: 'driver',
        name: 'Andrés Salgado',
        username: 'andres',
        hash: '',
        phone: '310 555 2211',
        active: true,
        color: '#C68A3D',
        createdAt: nowIso()
      }
    ],
    routes: [
      {
        id: 'R-1',
        name: 'Ruta Centro y Plaza Principal',
        driverId: 'u_carlos',
        time: '08:00 AM - 12:00 PM',
        status: 'En ruta',
        notes: 'Distribución prioritaria a tiendas y viviendas de la calle principal.'
      },
      {
        id: 'R-2',
        name: 'Ruta Sector La Loma y El Crucero',
        driverId: 'u_andres',
        time: '02:00 PM - 05:00 PM',
        status: 'Programada',
        notes: 'Despacho de pedidos residenciales y fincas aledañas.'
      }
    ],
    pqrs: [],
    settings: {
      businessName: 'Agua Magaly',
      phone: '573054136677',
      deliveryFee: 0,
      currency: 'COP'
    }
  };

  // ==========================================================================
  // NORMALIZADORES
  // ==========================================================================
  function normalizeOrder(raw) {
    const createdAt = raw.createdAt || parseLegacyDate(raw.date);
    const status = normalizeStatus(raw.status);
    const events = Array.isArray(raw.events) && raw.events.length
      ? raw.events
      : [{ type: 'creado', at: createdAt, by: 'Cliente (web)', note: '' }];

    return {
      id: raw.id || uid('ORD'),
      code: raw.code || raw.id || 'ORD',
      client: raw.client || 'Cliente',
      phone: raw.phone || '',
      address: raw.address || '',
      items: raw.items || '',
      total: Number(raw.total || 0),
      status: status,
      createdAt: createdAt,
      date: raw.date || formatDateTime(createdAt),
      driverId: raw.driverId || null,
      driverName: raw.driverName || '',
      payment: raw.payment || 'Efectivo',
      paid: !!raw.paid,
      notes: raw.notes || '',
      failReason: raw.failReason || '',
      geo: raw.geo || null,
      events: events
    };
  }

  function normalizeUser(raw) {
    return {
      id: raw.id || uid('u'),
      role: raw.role === 'admin' ? 'admin' : 'driver',
      name: raw.name || 'Sin nombre',
      username: (raw.username || '').toLowerCase(),
      hash: raw.hash || '',
      phone: raw.phone || '',
      active: raw.active !== false,
      color: raw.color || '#1C7FA8',
      createdAt: raw.createdAt || nowIso()
    };
  }

  function normalizeRoute(raw) {
    return {
      id: raw.id || uid('R'),
      name: raw.name || 'Ruta sin nombre',
      driverId: raw.driverId || null,
      time: raw.time || '',
      status: raw.status || 'Programada',
      notes: raw.notes || ''
    };
  }

  // ==========================================================================
  // HASH DE CONTRASEÑA (simbólico: es cliente, no reemplaza un backend)
  // ==========================================================================
  async function hashPassword(plain) {
    const value = 'magaly::' + String(plain || '');
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      try {
        const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (err) { /* cae al plan B */ }
    }
    let h = 5381;
    for (let i = 0; i < value.length; i++) h = ((h << 5) + h + value.charCodeAt(i)) >>> 0;
    return 'djb2_' + h.toString(16);
  }

  // ==========================================================================
  // SUSCRIPCIONES
  // ==========================================================================
  const listeners = new Set();

  function notify(entity) {
    listeners.forEach(fn => {
      try { fn(entity); } catch (err) { console.error('[store] listener', err); }
    });
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  // ==========================================================================
  // INICIALIZACIÓN
  // ==========================================================================
  let readyPromise = null;

  function ensure(key, fallback) {
    if (LocalAdapter.read(key) === null) LocalAdapter.write(key, fallback);
    return LocalAdapter.read(key);
  }

  async function seed() {
    ensure(KEYS.products, SEED.products);
    ensure(KEYS.orders, []);
    ensure(KEYS.routes, SEED.routes);
    ensure(KEYS.pqrs, SEED.pqrs);
    ensure(KEYS.settings, SEED.settings);

    // Migración de la colección de usuarios
    const users = ensure(KEYS.users, []);
    if (!Array.isArray(users) || users.length === 0) {
      const seeded = [];
      for (const u of SEED.users) {
        seeded.push(Object.assign({}, u, { hash: await hashPassword('1234') }));
      }
      LocalAdapter.write(KEYS.users, seeded);
    } else {
      // Asegura que exista al menos un administrador con clave conocida
      const hasAdmin = users.some(u => u.role === 'admin');
      if (!hasAdmin) {
        users.push(Object.assign({}, SEED.users[0], { hash: await hashPassword('1234') }));
        LocalAdapter.write(KEYS.users, users);
      }
    }

    // Migración de datos heredados: las rutas y pedidos antiguos guardaban el
    // nombre del repartidor en `driver` en lugar de `driverId`.
    const currentUsers = LocalAdapter.read(KEYS.users) || [];
    const driverByName = {};
    currentUsers.forEach(u => {
      if (u && u.role === 'driver' && u.name) {
        driverByName[String(u.name).trim().toLowerCase()] = u.id;
      }
    });

    const rawRoutes = LocalAdapter.read(KEYS.routes) || [];
    let routesChanged = false;
    const normalizedRoutes = rawRoutes.map(route => {
      if (!route.driverId && route.driver) {
        const match = driverByName[String(route.driver).trim().toLowerCase()];
        if (match) {
          route = Object.assign({}, route, { driverId: match });
          routesChanged = true;
        }
      }
      return normalizeRoute(route);
    });
    if (routesChanged) LocalAdapter.write(KEYS.routes, normalizedRoutes);

    // Normaliza pedidos heredados y agrega campos faltantes
    const rawOrders = LocalAdapter.read(KEYS.orders) || [];
    const normalized = rawOrders.map(normalizeOrder);
    if (JSON.stringify(rawOrders) !== JSON.stringify(normalized)) {
      LocalAdapter.write(KEYS.orders, normalized);
    }
  }

  function ready() {
    if (!readyPromise) readyPromise = seed();
    return readyPromise;
  }

  // ==========================================================================
  // API PÚBLICA
  // ==========================================================================
  async function list(entity) {
    await ready();
    if (!ENTITY_SET.has(entity)) throw new Error('Entidad desconocida: ' + entity);
    const data = LocalAdapter.read(KEYS[entity]);
    if (entity === 'settings') return Object.assign({}, SEED.settings, data || {});
    if (!Array.isArray(data)) return [];
    if (entity === 'orders') return sortOrders(data.map(normalizeOrder));
    if (entity === 'users') return data.map(normalizeUser);
    if (entity === 'routes') return data.map(normalizeRoute);
    return data;
  }

  async function saveAll(entity, items) {
    await ready();
    LocalAdapter.write(KEYS[entity], items);
    notify(entity);
    return items;
  }

  async function upsert(entity, record) {
    await ready();
    if (entity === 'settings') {
      const merged = Object.assign({}, await list('settings'), record);
      LocalAdapter.write(KEYS.settings, merged);
      notify('settings');
      return merged;
    }
    const items = await list(entity);
    const idx = items.findIndex(item => item.id === record.id);
    if (idx >= 0) items[idx] = Object.assign({}, items[idx], record);
    else items.unshift(record);
    await saveAll(entity, items);
    return record;
  }

  async function remove(entity, id) {
    await ready();
    const items = (await list(entity)).filter(item => item.id !== id);
    await saveAll(entity, items);
    return true;
  }

  const ENTITY_SET = new Set(ENTITIES);

  // Exporta una colección a CSV y la descarga
  function exportCsv(entity, rows) {
    const data = rows && rows.length ? rows : [];
    if (!data.length) return false;
    const flat = data.map(row => {
      const out = {};
      Object.keys(row).forEach(k => {
        if (k === 'events' || k === 'geo') return;
        out[k] = row[k];
      });
      return out;
    });
    const headers = Object.keys(flat[0]);
    const escape = v => '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"';
    const csv = [headers.join(';')]
      .concat(flat.map(row => headers.map(h => escape(row[h])).join(';')))
      .join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'agua-magaly-' + entity + '-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  // Sincroniza cambios hechos en otras pestañas del mismo navegador
  window.addEventListener('storage', e => {
    const entity = ENTITIES.find(k => KEYS[k] === e.key);
    if (entity) notify(entity);
  });

  return {
    KEYS,
    ORDER_STATUS,
    EVENT_LABEL,
    ready,
    list,
    saveAll,
    upsert,
    remove,
    subscribe,
    hashPassword,
    exportCsv,
    uid,
    // Helpers de formato compartidos por los paneles
    utils: {
      uid,
      nowIso,
      formatMoney,
      formatDateTime,
      formatTime,
      relativeTime,
      sameDay,
      normalizeStatus,
      parseLegacyDate
    }
  };
})();
