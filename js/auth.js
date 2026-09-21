/**
 * AGUA MAGALY — MÓDULO DE AUTENTICACIÓN
 * Gestión de acceso administrativo (usuario: admin, contraseña: 1234)
 */

(function () {
  'use strict';

  const AUTH_KEY = 'agua_magaly_admin_session';

  // Credenciales autorizadas
  const CREDENTIALS = {
    username: 'admin',
    password: '1234'
  };

  /**
   * Determina la ruta correcta a admin.html dependiendo de si se está en /login/ o en la raíz
   */
  function getAdminPath() {
    return window.location.pathname.endsWith('/login/') || window.location.pathname.endsWith('/login/index.html')
      ? '../admin.html'
      : 'admin.html';
  }

  function getLoginPath() {
    return 'login.html';
  }

  /**
   * Verifica si hay una sesión activa
   */
  function isAuthenticated() {
    return sessionStorage.getItem(AUTH_KEY) === 'true';
  }

  // ==========================================================================
  // PANTALLA DE LOGIN (login.html o login/index.html)
  // ==========================================================================
  const loginForm = document.getElementById('login-form');
  const loginError = document.getElementById('login-error');

  if (loginForm) {
    // Si ya tiene sesión activa, dirigir directamente al panel
    if (isAuthenticated()) {
      window.location.href = getAdminPath();
      return;
    }

    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();

      const userInput = document.getElementById('login-user').value.trim();
      const passInput = document.getElementById('login-pass').value.trim();

      if (userInput === CREDENTIALS.username && passInput === CREDENTIALS.password) {
        sessionStorage.setItem(AUTH_KEY, 'true');
        if (loginError) loginError.style.display = 'none';
        window.location.href = getAdminPath();
      } else {
        if (loginError) {
          loginError.style.display = 'block';
          loginError.textContent = 'Usuario o contraseña incorrectos. Verifica tus datos.';
        }
      }
    });
  }

  // ==========================================================================
  // PANEL ADMINISTRADOR (admin.html)
  // ==========================================================================
  const adminPage = document.getElementById('admin-page');
  const logoutBtn = document.getElementById('logout-btn');

  if (adminPage) {
    // Si NO está autenticado, redirigir al login
    if (!isAuthenticated()) {
      window.location.href = getLoginPath();
      return;
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', function (e) {
        e.preventDefault();
        sessionStorage.removeItem(AUTH_KEY);
        window.location.href = 'index.html';
      });
    }
  }

})();
