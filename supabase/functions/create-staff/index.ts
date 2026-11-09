// ============================================================================
// AGUA MAGALY — EDGE FUNCTION: crear cuentas de reparto de forma segura
// ----------------------------------------------------------------------------
// Solo un administrador autenticado puede crear cuentas. Usa la clave
// service_role en el servidor (nunca en el navegador).
//
// Despliegue:
//   1. Instala la CLI:  npm i -g supabase
//   2. Inicia sesión:   supabase login
//   3. Vincula:         supabase link --project-ref glppntnfoxognhqueuoc
//   4. Despliega:       supabase functions deploy create-staff
//
// Después de desplegarla, en Supabase puedes desactivar el registro público:
//   Authentication → Providers → Email → "Allow new users to sign up" = OFF
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

// Solo estos sitios pueden llamar a la función desde el navegador.
// Para cambiarlos sin tocar el código:
//   supabase secrets set ALLOWED_ORIGINS="https://tu-dominio.com,https://otro.com"
const DEFAULT_ORIGINS = ['https://andrescausil04.github.io'];
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || DEFAULT_ORIGINS.join(','))
  .split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);

let corsHeaders: Record<string, string> = {};

function buildCors(req: Request) {
  const origin = (req.headers.get('Origin') || '').replace(/\/$/, '');
  const allowed = ALLOWED_ORIGINS.includes(origin);
  corsHeaders = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {})
  };
  return { origin, allowed };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}


function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

Deno.serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === 'OPTIONS') {
    return new Response(cors.allowed ? 'ok' : 'origen no permitido', { status: cors.allowed ? 200 : 403, headers: corsHeaders });
  }
  if (cors.origin && !cors.allowed) return json({ ok: false, error: 'Origen no permitido.' }, 403);
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ ok: false, error: 'Configuración del servidor incompleta.' }, 500);
  }

  // 1. Verificar quién llama (debe ser un administrador activo).
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return json({ ok: false, error: 'Sesión requerida.' }, 401);
  }

  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData?.user) {
    return json({ ok: false, error: 'Sesión inválida.' }, 401);
  }

  const { data: profile, error: profileError } = await caller
    .from('staff')
    .select('role, active')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || !profile || !profile.active || profile.role !== 'admin') {
    return json({ ok: false, error: 'Solo el administrador puede crear cuentas.' }, 403);
  }


  // 2. Validar datos.
  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: 'Datos inválidos.' }, 400); }

  const username = clean(body.username, 40).toLowerCase();
  const name = clean(body.name, 120) || username;
  const phone = clean(body.phone, 40);
  const personalEmail = clean(body.email, 254).toLowerCase();
  const password = String(body.password || '');
  const role = body.role === 'admin' ? 'admin' : 'driver';
  const color = /^#[0-9a-f]{3,8}$/i.test(String(body.color || '')) ? String(body.color) : '#1C7FA8';

  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    return json({ ok: false, error: 'El usuario debe tener entre 3 y 40 letras o números, sin espacios.' }, 400);
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return json({ ok: false, error: 'La contraseña debe tener 8+ caracteres con letras y números.' }, 400);
  }

  // El correo de acceso es interno; el correo personal se guarda en `staff`.
  const authEmail = `${username}@aguamagaly.app`;

  // 3. Crear la cuenta con service_role (solo en el servidor).
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { username }
  });

  if (createError || !created?.user?.id) {
    const msg = String(createError?.message || '');
    if (/already|exists|registered/i.test(msg)) {
      return json({ ok: false, error: 'Ese usuario ya existe. Prueba con otro.' }, 409);
    }
    return json({ ok: false, error: 'No se pudo crear la cuenta de acceso.' }, 400);
  }

  // 4. Crear su ficha en staff.
  const { error: insertError } = await admin.from('staff').insert({
    id: created.user.id,
    username,
    name,
    phone,
    email: personalEmail,
    role,
    color,
    active: body.active !== false
  });

  if (insertError) {
    // Revertir la cuenta para no dejar usuarios huérfanos.
    try { await admin.auth.admin.deleteUser(created.user.id); } catch { /* ignora */ }
    const msg = String(insertError.message || '');
    if (/duplicate|unique/i.test(msg)) {
      return json({ ok: false, error: 'Ese usuario ya está en uso.' }, 409);
    }
    return json({ ok: false, error: 'No se pudo habilitar la ficha del usuario.' }, 400);
  }

  return json({ ok: true, id: created.user.id });
});
