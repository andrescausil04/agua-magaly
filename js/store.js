/**
 * AGUA MAGALY — CAPA DE DATOS (STORE)
 * ---------------------------------------------------------------------------
 * Toda la aplicación habla SOLO con este módulo.
 *
 * Tiene dos modos:
 *   • NUBE (Supabase): si js/config.js tiene supabaseUrl + supabaseAnonKey.
 *     Los pedidos de cualquier celular llegan al panel en tiempo real.
 *   • LOCAL: si no hay configuración, guarda en el navegador como antes.
 *
 *   MagalyStore.ready()                  -> espera la inicialización
 *   await MagalyStore.list('orders')     -> array de registros
 *   await MagalyStore.upsert('orders', o)-> crea o actualiza (por id)
 *   await MagalyStore.remove('orders', id)
 *   MagalyStore.subscribe(fn)            -> se dispara ante cualquier cambio
 *
 *   MagalyStore.isCloud()                -> true si está conectado a Supabase
 *   MagalyStore.signIn(email, pass)      -> inicio de sesión real
 *   MagalyStore.signOut()
 *   MagalyStore.profile()                -> ficha del usuario con sesión
 *   MagalyStore.updatePassword(actual, nueva)
 *   MagalyStore.createStaffAccount(datos) -> crea cuenta de repartidor
 */

window.MagalyStore = (function () {
  'use strict';

  // ==========================================================================
  // CONFIGURACIÓN
  // ==========================================================================
  const CONFIG = window.MAGALY_CONFIG || {};
  const CLOUD_CONFIGURED = !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
  const USERNAME_DOMAIN = CONFIG.usernameDomain || 'aguamagaly.app';
  // Librería oficial de Supabase alojada en el propio sitio, con versión fija.
  // Evita depender de un CDN externo (riesgo de cadena de suministro).
  const SDK_URLS = [
    /\/login\//.test(window.location.pathname)
      ? '../js/vendor/supabase.min.js'
      : 'js/vendor/supabase.min.js'
  ];

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
  // ADAPTADOR LOCAL
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
      dataConsent: !!raw.dataConsent,
      dataConsentAt: raw.dataConsentAt || '',
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

  // La tabla `staff` usa snake_case; la app usa camelCase.
  function normalizeStaff(raw) {
    return {
      id: raw.id,
      role: raw.role === 'admin' ? 'admin' : 'driver',
      name: raw.name || 'Sin nombre',
      username: (raw.username || '').toLowerCase(),
      hash: '',
      phone: raw.phone || '',
      active: raw.active !== false,
      color: raw.color || '#1C7FA8',
      createdAt: raw.created_at || nowIso()
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
  // HASH DE CONTRASEÑA (solo modo local)
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
  // CONEXIÓN A SUPABASE
  // ==========================================================================
  let sdk = null;
  let sb = null;
  let cloudActive = false;
  let cloudFailed = false;

  function loadSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve(window.supabase);
    return new Promise((resolve, reject) => {
      let index = 0;
      const tryNext = () => {
        if (index >= SDK_URLS.length) {
          reject(new Error('No se pudo cargar la librería de Supabase.'));
          return;
        }
        const script = document.createElement('script');
        script.src = SDK_URLS[index++];
        script.async = true;
        script.onload = () => {
          if (window.supabase && window.supabase.createClient) resolve(window.supabase);
          else tryNext();
        };
        script.onerror = tryNext;
        document.head.appendChild(script);
      };
      tryNext();
    });
  }

  function setRealtimeAuth(token) {
    if (!sb || !sb.realtime || typeof sb.realtime.setAuth !== 'function') return;
    try { sb.realtime.setAuth(token || null); } catch (err) { /* opcional */ }
  }

  function startRealtime() {
    if (!sb) return;
    try {
      sb.channel('magaly-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records' }, payload => {
          const row = (payload && payload.new && payload.new.entity) ? payload.new : ((payload && payload.old) || {});
          notify(row.entity || 'orders');
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, () => {
          notify('users');
        })
        .subscribe();
    } catch (err) {
      console.warn('[store] no se pudo activar el tiempo real', err);
    }
  }

  async function initCloud() {
    sdk = await loadSdk();
    sb = sdk.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'magaly_auth'
      }
    });

    try {
      const current = await sb.auth.getSession();
      if (current && current.data && current.data.session) {
        setRealtimeAuth(current.data.session.access_token);
      }
    } catch (err) { /* sin sesión todavía */ }

    // Mantiene el canal de tiempo real con el token del usuario conectado.
    sb.auth.onAuthStateChange((event, session) => {
      setRealtimeAuth(session ? session.access_token : null);
    });

    startRealtime();
    cloudActive = true;
  }

  // ==========================================================================
  // INICIALIZACIÓN
  // ==========================================================================
  let readyPromise = null;

  function ensure(key, fallback) {
    if (LocalAdapter.read(key) === null) LocalAdapter.write(key, fallback);
    return LocalAdapter.read(key);
  }

  async function seed(withLocalUsers) {
    ensure(KEYS.products, SEED.products);
    ensure(KEYS.orders, []);
    ensure(KEYS.routes, SEED.routes);
    ensure(KEYS.pqrs, SEED.pqrs);
    ensure(KEYS.settings, SEED.settings);

    // Las cuentas de prueba SOLO se crean en modo local sin nube configurada.
    // Si Supabase está configurado, jamás se siembran credenciales conocidas.
    if (withLocalUsers !== false) {
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
    if (!readyPromise) {
      readyPromise = (async () => {
        if (CLOUD_CONFIGURED) {
          try {
            await initCloud();
            cloudFailed = false;
            return;
          } catch (err) {
            console.error('[store] no se pudo conectar a Supabase.', err);
            cloudActive = false;
            cloudFailed = true;
            sb = null;
          }
        }
        // Nunca sembrar usuarios locales cuando la nube está configurada:
        // evita que un fallo de conexión habilite credenciales conocidas.
        await seed(!CLOUD_CONFIGURED);
      })();
    }
    return readyPromise;
  }

  // ==========================================================================
  // LECTURA
  // ==========================================================================
  async function cloudList(entity) {
    if (entity === 'users') {
      const { data, error } = await sb.from('staff').select('*').order('username', { ascending: true });
      if (error) throw error;
      return (data || []).map(normalizeStaff);
    }

    if (entity === 'settings') {
      const { data, error } = await sb.from('records').select('data').eq('entity', 'settings').eq('id', 'app').maybeSingle();
      if (error) throw error;
      return Object.assign({}, SEED.settings, (data && data.data) || {});
    }

    const { data, error } = await sb.from('records').select('data').eq('entity', entity);
    if (error) throw error;

    const rows = (data || []).map(r => r && r.data).filter(Boolean);
    if (entity === 'orders') return sortOrders(rows.map(normalizeOrder));
    if (entity === 'routes') return rows.map(normalizeRoute);
    return rows;
  }

  async function list(entity) {
    await ready();
    if (!ENTITY_SET.has(entity)) throw new Error('Entidad desconocida: ' + entity);

    if (cloudActive) return cloudList(entity);

    const data = LocalAdapter.read(KEYS[entity]);
    if (entity === 'settings') return Object.assign({}, SEED.settings, data || {});
    if (!Array.isArray(data)) return [];
    if (entity === 'orders') return sortOrders(data.map(normalizeOrder));
    if (entity === 'users') return data.map(normalizeUser);
    if (entity === 'routes') return data.map(normalizeRoute);
    return data;
  }

  // ==========================================================================
  // ESCRITURA
  // ==========================================================================
  async function hasSession() {
    if (!sb) return false;
    try {
      const { data } = await sb.auth.getSession();
      return !!(data && data.session);
    } catch (err) {
      return false;
    }
  }

  async function saveAll(entity, items) {
    await ready();
    if (!cloudActive) {
      LocalAdapter.write(KEYS[entity], items);
      notify(entity);
      return items;
    }
    for (const item of items) await upsert(entity, item);
    return items;
  }

  async function upsert(entity, record) {
    await ready();

    if (!cloudActive) {
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

    // ---- NUBE ----
    if (entity === 'settings') {
      const merged = Object.assign({}, await list('settings'), record);
      const { error } = await sb.from('records').upsert(
        { entity: 'settings', id: 'app', data: merged },
        { onConflict: 'entity,id' }
      );
      if (error) throw error;
      notify('settings');
      return merged;
    }

    if (entity === 'users') {
      const row = {
        username: record.username,
        name: record.name,
        phone: record.phone || '',
        role: record.role === 'admin' ? 'admin' : 'driver',
        color: record.color || '#1C7FA8',
        active: record.active !== false
      };
      const { error } = await sb.from('staff').update(row).eq('id', record.id);
      if (error) throw error;
      notify('users');
      return record;
    }

    const row = { entity: entity, id: record.id, data: record };

    // El público puede CREAR pedidos y PQRS; el equipo puede editar.
    if (entity === 'orders' || entity === 'pqrs') {
      const signedIn = await hasSession();
      const query = signedIn
        ? sb.from('records').upsert(row, { onConflict: 'entity,id' })
        : sb.from('records').insert(row);
      const { error } = await query;
      if (error) throw error;
      notify(entity);
      return record;
    }

    const { error } = await sb.from('records').upsert(row, { onConflict: 'entity,id' });
    if (error) throw error;
    notify(entity);
    return record;
  }

  /**
   * Actualiza un registro existente sin permitir crearlo por accidente.
   * En pedidos, el repartidor solo puede tocar los que tiene asignados;
   * la base de datos también lo exige.
   */
  async function update(entity, id, record) {
    await ready();
    if (!cloudActive) return upsert(entity, record);
    if (entity === 'users' || entity === 'settings') return upsert(entity, record);

    const { data, error } = await sb.from('records')
      .update({ data: record })
      .eq('entity', entity)
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!data || !data.length) {
      throw new Error('No se pudo guardar el cambio: permiso denegado o registro inexistente.');
    }
    notify(entity);
    return record;
  }

  async function remove(entity, id) {
    await ready();

    if (!cloudActive) {
      const items = (await list(entity)).filter(item => item.id !== id);
      await saveAll(entity, items);
      return true;
    }

    if (entity === 'users') {
      const { error } = await sb.from('staff').delete().eq('id', id);
      if (error) throw error;
      notify('users');
      return true;
    }

    const { error } = await sb.from('records').delete().eq('entity', entity).eq('id', id);
    if (error) throw error;
    notify(entity);
    return true;
  }

  const ENTITY_SET = new Set(ENTITIES);

  // ==========================================================================
  // AUTENTICACIÓN EN LA NUBE
  // ==========================================================================
  function emailFor(username) {
    const value = String(username || '').trim().toLowerCase();
    if (!value) return '';
    if (value.indexOf('@') >= 0) return value;
    return value + '@' + USERNAME_DOMAIN;
  }

  function friendlyAuthError(message) {
    const text = String(message || '');
    if (/invalid login credentials/i.test(text)) return 'Usuario o contraseña incorrectos.';
    if (/email not confirmed/i.test(text)) return 'La cuenta aún no está confirmada. Pide al administrador que la active.';
    if (/user already registered/i.test(text)) return 'Ese usuario ya existe.';
    if (/password should be at least/i.test(text)) return 'La contraseña debe tener al menos 8 caracteres.';
    if (/rate limit|too many/i.test(text)) return 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.';
    return text || 'No se pudo completar la operación.';
  }

  /**
   * Política mínima de contraseñas: 8+ caracteres con letras y números.
   * Devuelve el mensaje de error o una cadena vacía si es válida.
   */
  function passwordIssue(password) {
    const value = String(password || '');
    if (value.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
      return 'La contraseña debe incluir al menos una letra y un número.';
    }
    return '';
  }

  async function signIn(email, password) {
    await ready();
    if (!cloudActive) return { data: null, error: { message: 'Sin conexión a la nube.' } };
    return sb.auth.signInWithPassword({ email: email, password: password });
  }

  async function signOut() {
    await ready();
    if (!cloudActive) return;
    try { await sb.auth.signOut(); } catch (err) { /* ignora */ }
  }

  async function profile() {
    await ready();
    if (!cloudActive) return null;
    let session = null;
    try {
      const res = await sb.auth.getSession();
      session = res && res.data && res.data.session;
    } catch (err) {
      return null;
    }
    if (!session) return null;

    const { data, error } = await sb.from('staff').select('*').eq('id', session.user.id).maybeSingle();
    if (error) {
      console.warn('[store] no se pudo leer la ficha del usuario', error);
      return null;
    }
    return data ? normalizeStaff(data) : null;
  }

  async function updatePassword(currentPass, newPass) {
    await ready();
    if (!cloudActive) return { ok: false, error: 'Sin conexión a la nube.' };

    const me = await profile();
    if (!me) return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.' };
    const issue = passwordIssue(newPass);
    if (issue) return { ok: false, error: issue };

    const check = await sb.auth.signInWithPassword({
      email: emailFor(me.username),
      password: String(currentPass || '')
    });
    if (check.error) return { ok: false, error: 'La contraseña actual no es correcta.' };

    const { error } = await sb.auth.updateUser({ password: String(newPass) });
    if (error) return { ok: false, error: friendlyAuthError(error.message) };
    return { ok: true };
  }

  /**
   * Crea la cuenta de acceso de un repartidor y su ficha en `staff`.
   * Usa un cliente temporal para no cerrar la sesión del administrador.
   */
  async function createStaffAccount(input) {
    await ready();
    if (!cloudActive) return { ok: false, error: 'Sin conexión a la nube.' };

    const username = String(input.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,}$/.test(username)) {
      return { ok: false, error: 'El usuario debe tener al menos 3 letras o números, sin espacios.' };
    }
    const password = String(input.password || '');
    const issue = passwordIssue(password);
    if (issue) return { ok: false, error: issue };

    // 1) Vía segura recomendada: Edge Function con service_role.
    //    Solo funciona si el administrador la desplegó y está autenticado.
    try {
      const { data, error } = await sb.functions.invoke('create-staff', {
        body: {
          username: username,
          name: input.name || username,
          phone: input.phone || '',
          password: password,
          role: input.role === 'admin' ? 'admin' : 'driver',
          color: input.color || '#1C7FA8',
          active: input.active !== false
        }
      });
      if (!error && data && data.ok) {
        notify('users');
        return { ok: true, id: data.id };
      }
      if (data && data.error) return { ok: false, error: data.error };
      const msg = String((error && (error.message || error)) || '');
      // Si la función aún no está desplegada, se usa el método anterior.
      if (msg && !/not found|404|failed to send|fetch/i.test(msg)) {
        return { ok: false, error: friendlyAuthError(msg) };
      }
    } catch (err) {
      // Sin Edge Function: continúa con el alta clásica.
    }

    let temp = null;
    try {
      temp = sdk.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: 'magaly_setup_temp'
        }
      });
    } catch (err) {
      return { ok: false, error: 'No se pudo preparar la creación de la cuenta.' };
    }

    const { data, error } = await temp.auth.signUp({
      email: emailFor(username),
      password: password
    });

    if (error) return { ok: false, error: friendlyAuthError(error.message) };

    const user = data && data.user;
    if (!user || !user.id) {
      return { ok: false, error: 'No se pudo crear la cuenta de acceso.' };
    }
    if (Array.isArray(user.identities) && user.identities.length === 0) {
      return { ok: false, error: 'Ese usuario ya existe. Prueba con otro.' };
    }

    try { await temp.auth.signOut(); } catch (err) { /* ignora */ }

    const row = {
      id: user.id,
      username: username,
      name: input.name || username,
      phone: input.phone || '',
      role: input.role === 'admin' ? 'admin' : 'driver',
      color: input.color || '#1C7FA8',
      active: input.active !== false
    };

    const { error: insertError } = await sb.from('staff').insert(row);
    if (insertError) {
      return {
        ok: false,
        error: 'La cuenta se creó, pero falta habilitarla. Inténtalo de nuevo o avísame.'
      };
    }

    notify('users');
    return { ok: true, id: user.id };
  }

  /**
   * Sube la imagen de un producto al almacenamiento de Supabase y devuelve su
   * enlace público. Sin nube la guarda como data URL (solo para pruebas).
   */
  async function uploadImage(file) {
    await ready();
    if (!file || !file.size) throw new Error('No se seleccionó ninguna imagen.');

    const type = String(file.type || '').toLowerCase();
    if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(type)) {
      throw new Error('Formato no válido. Usa JPG, PNG, WEBP, GIF o AVIF.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('La imagen no puede pesar más de 5 MB.');
    }

    if (!cloudActive) {
      if (file.size > 300 * 1024) {
        throw new Error('Sin conexión a la nube, usa una imagen de menos de 300 KB.');
      }
      return await readAsDataUrl(file);
    }

    const ext = type === 'image/jpeg' ? 'jpg' : type.split('/')[1];
    const path = 'productos/' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
    const { error } = await sb.storage.from('products').upload(path, file, {
      cacheControl: '31536000',
      upsert: false,
      contentType: type
    });
    if (error) {
      const msg = String(error.message || '');
      if (/bucket/i.test(msg)) {
        throw new Error('Falta activar el almacén de imágenes. Ejecuta database/storage-productos.sql en Supabase.');
      }
      throw new Error('No se pudo subir la imagen. Inténtalo de nuevo.');
    }
    const { data } = sb.storage.from('products').getPublicUrl(path);
    return data.publicUrl;
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      reader.readAsDataURL(file);
    });
  }

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
    update,
    remove,
    subscribe,
    hashPassword,
    passwordIssue,
    uploadImage,
    exportCsv,
    uid,
    isCloud: () => cloudActive,
    cloudConfigured: () => CLOUD_CONFIGURED,
    cloudFailed: () => cloudFailed,
    emailFor,
    signIn,
    signOut,
    profile,
    updatePassword,
    createStaffAccount,
    setRealtimeAuth,
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
