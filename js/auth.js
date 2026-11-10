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
  let pendingTwoFactor = null;

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
      let started = null;
      try {
        started = await store().twofaStart(username, password);
      } catch (err) {
        started = null;
      }

      // Si la función de seguridad aún no está desplegada, se usa el login clásico.
      if (started && started.unavailable) started = null;

      if (started && !started.ok) {
        const msg = String(started.error || '');
        if (/usuario o contraseña|invalid login credentials/i.test(msg)) {
          return { ok: false, error: failedLogin(username, 'Usuario o contraseña incorrectos. Verifica e intenta de nuevo.') };
        }
        return { ok: false, error: msg || 'No se pudo iniciar sesión. Inténtalo de nuevo.' };
      }

      if (started && started.ok && started.twoFactor) {
        clearFailures(username);
        pendingTwoFactor = {
          challengeId: started.challengeId,
          username: username,
          remember: remember !== false,
          emailMasked: started.emailMasked || ''
        };
        return {
          ok: false,
          twoFactor: true,
          challengeId: started.challengeId,
          emailMasked: started.emailMasked || '',
          username: username
        };
      }

      let classic = !started;
      if (started && started.ok && !started.twoFactor) {
        if (started.session) {
          const applied = await store().setSession(started.session);
          if (!applied.ok) return { ok: false, error: applied.error };
        } else {
          classic = true;
        }
      }

      if (classic) {
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
        if (attempt.data && attempt.data.session) {
          store().setRealtimeAuth(attempt.data.session.access_token);
        }
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
  // Segundo paso: código por correo y recuperación
  // ---------------------------------------------------------------------------
  async function verifyTwoFactor(challengeId, code, remember) {
    const result = await store().twofaVerify(challengeId, code);
    if (!result.ok) {
      return { ok: false, error: result.error || 'Código incorrecto. Inténtalo de nuevo.' };
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

    clearFailures(me.username);
    pendingTwoFactor = null;
    writeSession(me, remember);
    return { ok: true, user: me, redirect: homeFor(me.role) };
  }

  async function resendTwoFactor(challengeId) {
    return store().twofaResend(challengeId);
  }

  async function recoverTwoFactor(rawUser, code, newPassword, remember) {
    const username = String(rawUser || '').trim().toLowerCase();
    if (!username || !code || !newPassword) {
      return { ok: false, error: 'Escribe tu usuario, el código de recuperación y una contraseña nueva.' };
    }

    const result = await store().twofaRecover(username, code, newPassword);
    if (!result.ok) {
      return { ok: false, error: result.error || 'No se pudo recuperar el acceso.' };
    }

    if (!result.session) {
      return { ok: true, passwordReset: true };
    }

    const me = await store().profile();
    if (!me) {
      await store().signOut();
      return { ok: false, error: 'La cuenta no tiene acceso al panel. Contacta al administrador.' };
    }
    if (!me.active) {
      await store().signOut();
      return { ok: false, error: 'La cuenta está desactivada. Contacta al administrador.' };
    }

    clearFailures(me.username);
    pendingTwoFactor = null;
    writeSession(me, remember);
    return { ok: true, user: me, redirect: homeFor(me.role) };
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
      const me = await store().profile();
      if (me && me.role === 'admin') {
        const status = await store().twofaStatus();
        if (status && status.ok && status.enabled) {
          return store().twofaChangePassword(currentPass, newPass);
        }
        if (status && !status.ok && !status.unavailable) {
          return { ok: false, error: status.error || 'No se pudo verificar la seguridad de la cuenta.' };
        }
      }
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

    const codeForm = document.getElementById('login-code-form');
    const codeInput = document.getElementById('login-code');
    const codeError = document.getElementById('login-code-error');
    const codeHint = document.getElementById('login-code-hint');
    const codeSubmit = codeForm ? codeForm.querySelector('button[type="submit"]') : null;
    const codeResend = document.getElementById('login-code-resend');
    const codeBack = document.getElementById('login-code-back');

    const recoveryWrap = document.getElementById('login-recovery-wrap');
    const recoveryLink = document.getElementById('login-recovery-link');
    const recoveryForm = document.getElementById('login-recovery-form');
    const recoveryError = document.getElementById('login-recovery-error');
    const recoveryBack = document.getElementById('login-recovery-back');
    const recoverySubmit = recoveryForm ? recoveryForm.querySelector('button[type="submit"]') : null;

    let rememberChoice = true;
    let challengeId = '';

    function showError(box, message) {
      if (!box) return;
      box.textContent = message;
      box.style.display = 'block';
    }

    function hideError(box) {
      if (!box) return;
      box.style.display = 'none';
    }

    function setBusy(btn, busy, label) {
      if (!btn) return;
      btn.disabled = busy;
      if (busy) {
        btn.dataset.label = btn.dataset.label || btn.textContent;
        btn.textContent = label || 'Un momento…';
      } else {
        btn.textContent = btn.dataset.label || btn.textContent;
      }
    }

    function showLoginStep() {
      form.style.display = '';
      if (codeForm) codeForm.style.display = 'none';
      if (recoveryForm) recoveryForm.style.display = 'none';
      if (recoveryWrap) recoveryWrap.style.display = '';
      hideError(codeError);
      hideError(recoveryError);
      challengeId = '';
    }

    function showCodeStep(result) {
      challengeId = result.challengeId || '';
      form.style.display = 'none';
      if (recoveryForm) recoveryForm.style.display = 'none';
      if (recoveryWrap) recoveryWrap.style.display = 'none';
      if (codeForm) codeForm.style.display = '';
      if (codeHint) {
        codeHint.textContent = result.emailMasked
          ? 'Enviamos un código de 6 dígitos a ' + result.emailMasked + '. Vence en 10 minutos.'
          : 'Enviamos un código de 6 dígitos a tu correo personal. Vence en 10 minutos.';
      }
      hideError(codeError);
      if (codeInput) { codeInput.value = ''; codeInput.focus(); }
    }

    function showRecoveryStep() {
      form.style.display = 'none';
      if (codeForm) codeForm.style.display = 'none';
      if (recoveryWrap) recoveryWrap.style.display = 'none';
      if (recoveryForm) recoveryForm.style.display = '';
      hideError(recoveryError);
      const input = document.getElementById('recovery-user');
      if (input) input.focus();
    }

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
      hideError(errorBox);
      setBusy(submitBtn, true, 'Verificando…');

      const remember = document.getElementById('login-remember');
      rememberChoice = remember ? remember.checked : true;
      const result = await login(
        document.getElementById('login-user').value,
        document.getElementById('login-pass').value,
        rememberChoice
      );

      if (result.ok) {
        window.location.href = result.redirect;
        return;
      }

      setBusy(submitBtn, false);

      if (result.twoFactor) {
        showCodeStep(result);
        return;
      }

      showError(errorBox, result.error);
      const pass = document.getElementById('login-pass');
      if (pass) { pass.focus(); pass.select(); }
    });

    if (codeForm) {
      codeForm.addEventListener('submit', async e => {
        e.preventDefault();
        hideError(codeError);
        const code = (codeInput ? codeInput.value : '').replace(/\D/g, '');
        if (code.length !== 6) {
          showError(codeError, 'Escribe los 6 dígitos del código.');
          if (codeInput) codeInput.focus();
          return;
        }
        setBusy(codeSubmit, true, 'Verificando…');
        const result = await verifyTwoFactor(challengeId, code, rememberChoice);
        if (result.ok) {
          window.location.href = result.redirect;
          return;
        }
        setBusy(codeSubmit, false);
        showError(codeError, result.error);
        if (codeInput) { codeInput.focus(); codeInput.select(); }
      });
    }

    if (codeResend) {
      codeResend.addEventListener('click', async () => {
        hideError(codeError);
        setBusy(codeResend, true, 'Enviando…');
        const result = await resendTwoFactor(challengeId);
        setBusy(codeResend, false);
        if (!result.ok) {
          showError(codeError, result.error || 'No se pudo reenviar el código.');
          return;
        }
        if (codeHint) {
          codeHint.textContent = 'Código reenviado' +
            (result.emailMasked ? ' a ' + result.emailMasked : '') + '. Revisa tu correo.';
        }
        if (codeInput) { codeInput.value = ''; codeInput.focus(); }
      });
    }

    if (codeBack) {
      codeBack.addEventListener('click', () => {
        showLoginStep();
        const pass = document.getElementById('login-pass');
        if (pass) { pass.focus(); pass.select(); }
      });
    }

    if (recoveryLink) {
      recoveryLink.addEventListener('click', showRecoveryStep);
    }

    if (recoveryBack) {
      recoveryBack.addEventListener('click', () => {
        showLoginStep();
        const user = document.getElementById('login-user');
        if (user) user.focus();
      });
    }

    if (recoveryForm) {
      recoveryForm.addEventListener('submit', async e => {
        e.preventDefault();
        hideError(recoveryError);
        const username = document.getElementById('recovery-user').value;
        const code = document.getElementById('recovery-code').value;
        const next = document.getElementById('recovery-pass').value;
        const repeat = document.getElementById('recovery-repeat').value;
        if (next !== repeat) {
          showError(recoveryError, 'Las contraseñas nuevas no coinciden.');
          return;
        }
        setBusy(recoverySubmit, true, 'Recuperando…');
        const result = await recoverTwoFactor(username, code, next, true);
        if (result.ok && result.redirect) {
          window.location.href = result.redirect;
          return;
        }
        setBusy(recoverySubmit, false);
        if (result.ok && result.passwordReset) {
          const userInput = document.getElementById('login-user');
          if (userInput) userInput.value = username;
          showLoginStep();
          showError(errorBox, 'Contraseña actualizada. La verificación en dos pasos quedó desactivada. Inicia sesión con tu nueva contraseña.');
          const pass = document.getElementById('login-pass');
          if (pass) { pass.value = ''; pass.focus(); }
          return;
        }
        showError(recoveryError, result.error);
      });
    }
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
    verifyTwoFactor,
    resendTwoFactor,
    recoverTwoFactor,
    homeFor,
    pathTo,
    readSession
  };
})();

/**
 * OJITO PARA VER LA CONTRASEÑA
 * Agrega un botón a cada campo de contraseña (también a los que se crean
 * después en formularios y ventanas) para mostrar u ocultar lo escrito.
 */
(function () {
  'use strict';

  const EYE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6A17.4 17.4 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/></svg>';

  function paint(btn, visible) {
    btn.innerHTML = visible ? EYE_OFF : EYE;
    btn.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
    btn.setAttribute('title', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
    btn.setAttribute('aria-pressed', String(visible));
  }

  function enhance(input) {
    if (input.dataset.eye || !input.parentNode) return;
    input.dataset.eye = '1';
    input.classList.add('pass-input');

    const wrap = document.createElement('span');
    wrap.className = 'pass-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pass-eye';
    paint(btn, false);
    btn.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      paint(btn, show);
      input.focus();
    });
    wrap.appendChild(btn);

    // Al enviar el formulario, la contraseña vuelve a quedar oculta.
    if (input.form) {
      input.form.addEventListener('submit', () => {
        input.type = 'password';
        paint(btn, false);
      });
    }
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    if (root.matches && root.matches('input[type="password"]')) enhance(root);
    root.querySelectorAll('input[type="password"]').forEach(enhance);
  }

  function start() {
    scan(document);
    new MutationObserver(list => {
      list.forEach(m => m.addedNodes.forEach(scan));
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
