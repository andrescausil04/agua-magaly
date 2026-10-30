/**
 * AGUA MAGALY — UI COMPARTIDA
 * Toasts, diálogos de confirmación, escape de HTML y utilidades de formato.
 */

window.MagalyUI = (function () {
  'use strict';

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function money(amount) {
    return window.MagalyStore ? window.MagalyStore.utils.formatMoney(amount) : '$' + (amount || 0);
  }

  // ---------------------------------------------------------------------------
  // Toasts
  // ---------------------------------------------------------------------------
  function toastLayer() {
    let layer = document.getElementById('toast-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'toast-layer';
      layer.className = 'toast-layer';
      document.body.appendChild(layer);
    }
    return layer;
  }

  function toast(message, type) {
    const layer = toastLayer();
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.setAttribute('role', 'status');
    const icon = type === 'success' ? '✓' : type === 'error' ? '⚠' : type === 'warn' ? '!' : 'i';
    el.innerHTML = '<span class="toast-icon">' + icon + '</span><span>' + esc(message) + '</span>';
    layer.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    setTimeout(() => {
      el.classList.remove('is-visible');
      setTimeout(() => el.remove(), 260);
    }, 3200);
  }

  // ---------------------------------------------------------------------------
  // Confirmación
  // ---------------------------------------------------------------------------
  function confirmDialog(options) {
    const opts = Object.assign({
      title: '¿Confirmar acción?',
      message: '',
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      danger: false
    }, options || {});

    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'ui-dialog-overlay';
      overlay.innerHTML =
        '<div class="ui-dialog" role="dialog" aria-modal="true">' +
          '<h3>' + esc(opts.title) + '</h3>' +
          (opts.message ? '<p>' + esc(opts.message) + '</p>' : '') +
          '<div class="ui-dialog-actions">' +
            '<button type="button" class="btn btn-ghost" data-cancel>' + esc(opts.cancelText) + '</button>' +
            '<button type="button" class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-ok>' + esc(opts.confirmText) + '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('is-open'));

      const close = value => {
        overlay.classList.remove('is-open');
        setTimeout(() => overlay.remove(), 200);
        document.removeEventListener('keydown', onKey);
        resolve(value);
      };

      const onKey = e => {
        if (e.key === 'Escape') close(false);
        if (e.key === 'Enter') close(true);
      };

      overlay.querySelector('[data-ok]').addEventListener('click', () => close(true));
      overlay.querySelector('[data-cancel]').addEventListener('click', () => close(false));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
      document.addEventListener('keydown', onKey);
      overlay.querySelector('[data-ok]').focus();
    });
  }

  // ---------------------------------------------------------------------------
  // Prompt simple (una línea de texto)
  // ---------------------------------------------------------------------------
  function promptDialog(options) {
    const opts = Object.assign({
      title: 'Escribe un valor',
      label: '',
      value: '',
      placeholder: '',
      confirmText: 'Guardar',
      multiline: false
    }, options || {});

    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'ui-dialog-overlay';
      const field = opts.multiline
        ? '<textarea data-input rows="3" placeholder="' + esc(opts.placeholder) + '">' + esc(opts.value) + '</textarea>'
        : '<input type="text" data-input value="' + esc(opts.value) + '" placeholder="' + esc(opts.placeholder) + '">';

      overlay.innerHTML =
        '<div class="ui-dialog" role="dialog" aria-modal="true">' +
          '<h3>' + esc(opts.title) + '</h3>' +
          (opts.label ? '<p>' + esc(opts.label) + '</p>' : '') +
          '<div class="ui-field">' + field + '</div>' +
          '<div class="ui-dialog-actions">' +
            '<button type="button" class="btn btn-ghost" data-cancel>Cancelar</button>' +
            '<button type="button" class="btn btn-primary" data-ok>' + esc(opts.confirmText) + '</button>' +
          '</div>' +
        '</div>';

      document.body.appendChild(overlay);
      const input = overlay.querySelector('[data-input]');
      requestAnimationFrame(() => {
        overlay.classList.add('is-open');
        input.focus();
        input.select();
      });

      const close = value => {
        overlay.classList.remove('is-open');
        setTimeout(() => overlay.remove(), 200);
        document.removeEventListener('keydown', onKey);
        resolve(value);
      };

      const onKey = e => {
        if (e.key === 'Escape') close(null);
        if (e.key === 'Enter' && !opts.multiline) close(input.value);
      };

      overlay.querySelector('[data-ok]').addEventListener('click', () => close(input.value));
      overlay.querySelector('[data-cancel]').addEventListener('click', () => close(null));
      overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
      document.addEventListener('keydown', onKey);
    });
  }

  // ---------------------------------------------------------------------------
  // Drawer lateral (detalle de pedido)
  // ---------------------------------------------------------------------------
  function openDrawer(html) {
    closeDrawer();
    const overlay = document.createElement('div');
    overlay.className = 'ui-drawer-overlay';
    overlay.id = 'detail-drawer';
    overlay.innerHTML = '<aside class="ui-drawer" role="dialog" aria-modal="true">' + html + '</aside>';
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    overlay.addEventListener('click', e => { if (e.target === overlay) closeDrawer(); });
    document.addEventListener('keydown', drawerKeyHandler);
    return overlay.querySelector('.ui-drawer');
  }

  function drawerKeyHandler(e) {
    if (e.key === 'Escape') closeDrawer();
  }

  function closeDrawer() {
    const overlay = document.getElementById('detail-drawer');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    document.removeEventListener('keydown', drawerKeyHandler);
    setTimeout(() => overlay.remove(), 220);
  }

  // ---------------------------------------------------------------------------
  // Varios
  // ---------------------------------------------------------------------------
  function initials(name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w.charAt(0).toUpperCase())
      .join('');
  }

  function debounce(fn, wait) {
    let t;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait || 250);
    };
  }

  function emptyState(title, subtitle, icon) {
    return '<div class="empty-state">' +
      '<div class="empty-icon">' + (icon || '📭') + '</div>' +
      '<strong>' + esc(title) + '</strong>' +
      (subtitle ? '<p>' + esc(subtitle) + '</p>' : '') +
      '</div>';
  }

  return {
    esc,
    money,
    toast,
    confirm: confirmDialog,
    prompt: promptDialog,
    openDrawer,
    closeDrawer,
    initials,
    debounce,
    emptyState
  };
})();
