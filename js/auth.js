/**
 * AGUA MAGALY — AUTENTICACIÓN CON ROLES
 * ---------------------------------------------------------------------------
 * Roles: 'admin' (panel completo) y 'driver' (panel del repartidor).
 * Las credenciales viven en MagalyStore ('users') con la contraseña hasheada.
 *
 * Nota honesta: al ser una app sin servidor, esto controla la navegación y
 * separa roles, pero NO protege los datos frente a alguien con acceso a la
 * consola del navegador. Cuando conectes Supabase, la autenticación real se
 * resuelve en el backend.
 */

window.MagalyAuth = (function () {
  'use strict';

  const SESSION_KEY = 'magaly_session';
  const SESSION_DAYS = 30;

  function store() { return window.MagalyStore; }

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
    localStorage.removeItem(SESSION_KEY);
    window.location.href = pathTo('login.html');
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

    const users = await store().list('users');
    const user = users.find(u => u.username === username);

    if (!user) {
      return { ok: false, error: 'Ese usuario no existe. Verifica con el administrador.' };
    }
    if (!user.active) {
      return { ok: false, error: 'Esta cuenta está desactivada. Contacta al administrador.' };
    }

    const hash = await store().hashPassword(password);
    if (hash !== user.hash) {
      return { ok: false, error: 'Contraseña incorrecta. Inténtalo de nuevo.' };
    }

    writeSession(user, remember);
    return { ok: true, user: user, redirect: homeFor(user.role) };
  }

  // ---------------------------------------------------------------------------
  // Guardias de página
  // ---------------------------------------------------------------------------
  async function currentUser() {
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
    return user;
  }

  /**
   * Cambia la contraseña del usuario indicado verificando la actual.
   */
  async function changePassword(userId, currentPass, newPass) {
    const users = await store().list('users');
    const user = users.find(u => u.id === userId);
    if (!user) return { ok: false, error: 'Usuario no encontrado.' };

    const currentHash = await store().hashPassword(currentPass);
    if (currentHash !== user.hash) return { ok: false, error: 'La contraseña actual no es correcta.' };
    if (String(newPass || '').length < 4) return { ok: false, error: 'La nueva contraseña debe tener al menos 4 caracteres.' };

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

    if (demoBox) {
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
