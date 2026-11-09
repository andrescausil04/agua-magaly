/**
 * AGUA MAGALY — AUTENTICACIÓN CON ROLES
 * ---------------------------------------------------------------------------
 * Roles: 'admin' (panel completo) y 'driver' (panel del repartidor).
 *
 * Dos modos, igual que MagalyStore:
 *   • NUBE: la contraseña la verifica Supabase (seguro). El usuario "admin"
 *     inicia sesión con admin@aguamagaly.app.
 *   • LOCAL: credenciales guardadas en el navegador (modo de respaldo).
 */

window.MagalyAuth = (function () {
  'use strict';

  const SESSION_KEY = 'magaly_session';
  const SESSION_DAYS = 30;

  // Cierre automático por inactividad (20 minutos sin usar el panel).
  const IDLE_LIMIT_MS = 20 * 60 * 1000;
  const IDLE_CHECK_MS = 30 * 1000;

  // Límite de intentos fallidos de inicio de sesión.
  // Es una barrera adicional en el navegador; Supabase también limita en el servidor.
  const ATTEMPTS_KEY = 'magaly_login_attempts';
  const MAX_ATTEMPTS = 5;
  const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
  const BLOCK_MS = 15 * 60 * 1000;

  let idleTimer = null;

  function store() { return window.MagalyStore; }

  // ---------------------------------------------------------------------------
  // Intentos de inicio de sesión
  // ---------------------------------------------------------------------------
  function readAttempts(username) {
    try {
      const all = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{}');
      const item = all[username];
      return item && typeof item === 'object' ? item : null;
    } catch (err) {
      return null;
    }
  }

  function writeAttempts(username, data) {
    try {
      const all = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{}');
      if (data) all[username] = data;
      else delete all[username];
      localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(all));
    } catch (err) { /* almacenamiento no disponible */ }
  }

  function lockMinutesLeft(username) {
    const item = readAttempts(username);
    if (!item || !item.blockedUntil) return 0;
    const left = item.blockedUntil - Date.now();
    return left > 0 ? Math.ceil(left / 60000) : 0;
  }

  function registerFailure(username) {
    const now = Date.now();
    let item = readAttempts(username) || { count: 0, first: now };
    if (!item.first || now - item.first > ATTEMPT_WINDOW_MS) {
      item = { count: 0, first: now };
    }
    item.count = Number(item.count || 0) + 1;
    if (item.count >= MAX_ATTEMPTS) {
      item.blockedUntil = now + BLOCK_MS;
    }
    writeAttempts(username, item);
    return MAX_ATTEMPTS - item.count;
  }

  function clearFailures(username) {
    writeAttempts(username, null);
  }

  // Devuelve un mensaje claro y descuenta el intento fallido.
  function failedLogin(username, message) {
    const left = registerFailure(username);
    if (left <= 0) {
      return message + ' Por seguridad, espera 15 minutos antes de volver a intentar.';
    }
    return message + ' Te quedan ' + left + ' intento(s).';
  }

  // ---------------------------------------------------------------------------
  // Cierre de sesión por inactividad
  // ---------------------------------------------------------------------------
  function startIdleGuard() {
    if (idleTimer) return;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(name => document.addEventListener(name, bump, { passive: true }));

    const onVisible = () => { if (!document.hidden) bump(); };
    document.addEventListener('visibilitychange', onVisible);

    idleTimer = setInterval(() => {
      if (Date.now() - last < IDLE_LIMIT_MS) return;
      stopIdleGuard();
      try { sessionStorage.setItem('magaly_idle_logout', '1'); } catch (err) { /* ignora */ }
      logout();
    }, IDLE_CHECK_MS);
  }

  function stopIdleGuard() {
    if (idleTimer) {
      clearInterval(idleTimer);
      idleTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Rutas (funciona tanto en / como en /login/)
  // ---------------------------------------------------------------------------
  function inLoginFolder() {
    return /\/login\/(index\.html)?$/.test(window.location.pathname);
  }

  function pathTo(file) {
    return inLoginFolder() ? '../' + file : file;
  }

  // ---------------------------------------------------------------------------
  // Sesión
  // ---------------------------------------------------------------------------
  function readSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !data.userId) return null;
      if (data.expiresAt && Date.now() > data.expiresAt) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return data;
    } catch (err) {
      return null;
    }
  }

  function writeSession(user, remember) {
    const ttl = (remember === false ? 12 * 60 * 60 * 1000 : SESSION_DAYS * 24 * 60 * 60 * 1000);
    const data = {
      userId: user.id,
      role: user.role,
      name: user.name,
      username: user.username,
      expiresAt: Date.now() + ttl
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    return data;
  }

  function logout() {
    stopIdleGuard();
    localStorage.removeItem(SESSION_KEY);
    const goLogin = () => { window.location.href = pathTo('login.html'); };
    if (store() && store().isCloud && store().isCloud()) {
      store().signOut().then(goLogin).catch(goLogin);
      return;
    }
    goLogin();
  }

  function homeFor(role) {
    return role === 'driver' ? pathTo('repartidor.html') : pathTo('admin.html');
  }

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------
  async function login(rawUser, rawPass, remember) {
    await store().ready();
    const username = String(rawUser || '').trim().toLowerCase();
    const password = String(rawPass || '');
    if (!username || !password) {
      return { ok: false, error: 'Escribe tu usuario y contraseña.' };
    }

    // Bloqueo temporal tras varios intentos fallidos.
    const locked = lockMinutesLeft(username);
    if (locked > 0) {
      return { ok: false, error: 'Demasiados intentos fallidos. Por seguridad, espera ' + locked + ' minuto(s) e inténtalo de nuevo.' };
    }

    // Si la nube está configurada pero no responde, NO se permite el modo local.
    // Así nunca se puede entrar con las credenciales de prueba por un fallo.
    if (store().cloudConfigured && store().cloudConfigured() && !store().isCloud()) {
      return { ok: false, error: 'No se pudo conectar con el servidor de Agua Magaly. Revisa tu internet e inténtalo de nuevo.' };
    }

    // ---- NUBE: Supabase verifica la contraseña ----
    if (store().isCloud()) {
      const attempt = await store().signIn(store().emailFor(username), password);
      if (attempt.error) {
        const msg = String(attempt.error.message || '');
        if (/invalid login credentials/i.test(msg)) {
          return { ok: false, error: failedLogin(username, 'Usuario o contraseña incorrectos. Verifica e intenta de nuevo.') };
        }
        if (/email not confirmed/i.test(msg)) {
          return { ok: false, error: 'Esta cuenta aún no está confirmada. Pide al administrador que la active.' };
        }
        return { ok: false, error: 'No se pudo entrar: ' + msg };
      }

      const me = await store().profile();
      if (!me) {
        await store().signOut();
        return { ok: false, error: 'Esta cuenta no tiene acceso al panel. Contacta al administrador.' };
      }
      if (!me.active) {
        await store().signOut();
        return { ok: false, error: 'Esta cuenta está desactivada. Contacta al administrador.' };
      }

      if (attempt.data && attempt.data.session) {
        store().setRealtimeAuth(attempt.data.session.access_token);
      }
      clearFailures(username);
      writeSession(me, remember);
      return { ok: true, user: me, redirect: homeFor(me.role) };
    }

    // ---- LOCAL ----
    const users = await store().list('users');
    const user = users.find(u => u.username === username);

    if (!user) {
      return { ok: false, error: failedLogin(username, 'Usuario o contraseña incorrectos. Verifica e intenta de nuevo.') };
    }
    if (!user.active) {
      return { ok: false, error: 'Esta cuenta está desactivada. Contacta al administrador.' };
    }

    const hash = await store().hashPassword(password);
    if (hash !== user.hash) {
      return { ok: false, error: failedLogin(username, 'Usuario o contraseña incorrectos. Verifica e intenta de nuevo.') };
    }

    clearFailures(username);
    writeSession(user, remember);
    return { ok: true, user: user, redirect: homeFor(user.role) };
  }

  // ---------------------------------------------------------------------------
  // Guardias de página
  // ---------------------------------------------------------------------------
  async function currentUser() {
    await store().ready();
    if (store() && store().cloudConfigured && store().cloudConfigured() && !store().isCloud()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    if (store() && store().isCloud && store().isCloud()) {
      const me = await store().profile();
      if (!me || !me.active) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      // Refresca el espejo local por si cambió el nombre o el rol.
      const mirror = readSession();
      if (mirror) writeSession(me, true);
      return me;
    }

    const session = readSession();
    if (!session) return null;
    const users = await store().list('users');
    const user = users.find(u => u.id === session.userId);
    if (!user || !user.active) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return user;
  }

  /**
   * Protege la página. `requiredRole` puede ser 'admin', 'driver' o null
   * (cualquier usuario con sesión válida).
   */
  async function requireRole(requiredRole) {
    const user = await currentUser();
    if (!user) {
      window.location.replace(pathTo('login.html'));
      return null;
    }
    if (requiredRole && user.role !== requiredRole) {
      window.location.replace(homeFor(user.role));
      return null;
    }
    // Con sesión válida, vigila la inactividad mientras se usa el panel.
    startIdleGuard();
    return user;
  }

  /**
   * Cambia la contraseña del usuario indicado verificando la actual.
   */
  async function changePassword(userId, currentPass, newPass) {
    if (store() && store().isCloud && store().isCloud()) {
      return store().updatePassword(currentPass, newPass);
    }

    const users = await store().list('users');
    const user = users.find(u => u.id === userId);
    if (!user) return { ok: false, error: 'Usuario no encontrado.' };

    const currentHash = await store().hashPassword(currentPass);
    if (currentHash !== user.hash) return { ok: false, error: 'La contraseña actual no es correcta.' };
    const issue = store().passwordIssue ? store().passwordIssue(newPass) : '';
    if (issue) return { ok: false, error: issue };

    user.hash = await store().hashPassword(newPass);
    await store().upsert('users', user);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Pantalla de login
  // ---------------------------------------------------------------------------
  function initLoginPage() {
    const form = document.getElementById('login-form');
    if (!form) return;

    // Si ya hay sesión, entra directo a su panel
    currentUser().then(user => {
      if (user) window.location.replace(homeFor(user.role));
    });

    const errorBox = document.getElementById('login-error');
    const submitBtn = form.querySelector('button[type="submit"]');
    const demoBox = document.getElementById('login-demo');

    // Si llegó aquí por el cierre automático de inactividad, se lo explicamos.
    let idleLogout = '';
    try {
      idleLogout = sessionStorage.getItem('magaly_idle_logout') || '';
      if (idleLogout) sessionStorage.removeItem('magaly_idle_logout');
    } catch (err) { /* ignora */ }
    if (idleLogout && errorBox) {
      errorBox.textContent = 'Tu sesión se cerró por inactividad. Ingresa de nuevo para continuar.';
      errorBox.style.display = 'block';
    }

    if (demoBox) {
      if (store().cloudConfigured && store().cloudConfigured()) {
        demoBox.innerHTML = '<strong>Acceso del equipo</strong>' +
          '<div style="margin-top:6px;font-size:13px">' +
          'Usa el usuario y la contraseña que te entregó el administrador.' +
          '</div>';
      } else {
        store().ready().then(async () => {
          const users = await store().list('users');
          const defaultHash = await store().hashPassword('1234');
          const openUsers = users.filter(u => u.active && u.hash === defaultHash);
          if (!openUsers.length) {
            demoBox.innerHTML = '<strong>Accesos del equipo</strong>' +
              '<div style="margin-top:6px;font-size:13px">' +
              'Usa el usuario y la contraseña que te entregó el administrador.' +
              '</div>';
            return;
          }
          demoBox.innerHTML = '<strong>Accesos con clave inicial</strong>' +
            '<div style="margin-top:6px;font-size:13px;line-height:1.7">' +
            openUsers.map(u =>
              (u.role === 'admin' ? 'Administrador' : 'Repartidor ' + u.name.split(' ')[0]) +
              ': <code>' + u.username + '</code> / <code>1234</code>'
            ).join('<br>') +
            '</div>';
        });
      }
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (errorBox) errorBox.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.label = submitBtn.dataset.label || submitBtn.textContent;
        submitBtn.textContent = 'Verificando…';
      }

      const remember = document.getElementById('login-remember');
      const result = await login(
        document.getElementById('login-user').value,
        document.getElementById('login-pass').value,
        remember ? remember.checked : true
      );

      if (result.ok) {
        window.location.href = result.redirect;
        return;
      }

      if (errorBox) {
        errorBox.textContent = result.error;
        errorBox.style.display = 'block';
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = submitBtn.dataset.label || 'Entrar';
      }
      const pass = document.getElementById('login-pass');
      if (pass) { pass.focus(); pass.select(); }
    });
  }

  // ---------------------------------------------------------------------------
  // Botones de cerrar sesión presentes en cualquier página
  // ---------------------------------------------------------------------------
  function bindLogoutButtons() {
    document.querySelectorAll('[data-logout]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        logout();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initLoginPage();
    bindLogoutButtons();
  });

  return {
    login,
    logout,
    currentUser,
    requireRole,
    changePassword,
    homeFor,
    pathTo,
    readSession
  };
})();
