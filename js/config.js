/**
 * AGUA MAGALY — CONFIGURACIÓN DE LA BASE DE DATOS
 * ---------------------------------------------------------------------------
 * Estos dos datos los entrega Supabase en:
 *   Project Settings (⚙️) → API
 *
 *   supabaseUrl      → "Project URL"        (ej. https://abcd1234.supabase.co)
 *   supabaseAnonKey  → "anon public" key    (texto largo que empieza con eyJ...)
 *
 * IMPORTANTE: usa SIEMPRE la clave "anon public".
 * NUNCA pongas aquí la clave "service_role": esa es privada y da acceso total.
 *
 * Si los dos campos están vacíos, la web sigue funcionando como antes
 * (guardando los pedidos solo en el navegador de cada equipo).
 */
window.MAGALY_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',

  // El usuario "admin" inicia sesión con admin@aguamagaly.app
  usernameDomain: 'aguamagaly.app'
};
