// ============================================================================
// AGUA MAGALY — EDGE FUNCTION: verificacion en dos pasos por correo
// ----------------------------------------------------------------------------
// El administrador recibe un codigo de 6 digitos en su correo personal.
// Los repartidores siguen entrando solo con contrasena (por ahora).
//
// Despliegue (Supabase Dashboard o CLI):
//   supabase functions deploy staff-2fa
//
// Secretos necesarios (Supabase > Edge Functions > Secrets):
//   RESEND_API_KEY   (recomendado)  y  RESEND_FROM
//   o SENDGRID_API_KEY y SENDGRID_FROM
//
// La clave service_role la entrega Supabase automaticamente a la funcion.
// Nunca se escribe en el navegador ni en js/config.js.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const USERNAME_DOMAIN = Deno.env.get('USERNAME_DOMAIN') || 'aguamagaly.app';
const OTP_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;
const OTP_COOLDOWN_SECONDS = 60;
const OTP_MAX_SENDS = 5;
const OTP_WINDOW_MINUTES = 60;
const RECOVERY_MAX_ATTEMPTS = 10;
const RECOVERY_WINDOW_MINUTES = 15;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function clean(value: unknown, max = 200) {
  return String(value === null || value === undefined ? '' : value).trim().slice(0, max);
}

function emailFor(username: string) {
  const value = clean(username, 80).toLowerCase();
  if (!value) return '';
  if (value.indexOf('@') >= 0) return value;
  return value + '@' + USERNAME_DOMAIN;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 254;
}

function passwordIssue(value: string) {
  if (value.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return 'La contraseña debe incluir al menos una letra y un número.';
  }
  return '';
}

function randomBytes(n: number) {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64(bytes: Uint8Array) {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return btoa(out);
}

function randomSalt() {
  return base64(randomBytes(16));
}

function randomDigits(n: number) {
  const bytes = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += String(bytes[i] % 10);
  return out;
}

function randomRecoveryCode() {
  const bytes = randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i++) out += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  return out.slice(0, 4) + '-' + out.slice(4);
}

function normalizeRecovery(value: string) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

async function hashSecret(secret: string, salt: string, iterations = 120000) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
    key,
    256
  );
  return base64(new Uint8Array(bits));
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verifyHash(secret: string, salt: string, expected: string) {
  if (!secret || !salt || !expected) return false;
  const hash = await hashSecret(secret, salt);
  return safeEqual(hash, expected);
}

function maskEmail(email: string) {
  const parts = String(email || '').split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return '';
  return parts[0].slice(0, 1) + '***@' + parts[1];
}

function minutesLeft(iso: string | null) {
  if (!iso) return 0;
  const left = new Date(iso).getTime() - Date.now();
  return left > 0 ? Math.ceil(left / 60000) : 0;
}

function secondsLeft(iso: string | null) {
  if (!iso) return 0;
  const left = new Date(iso).getTime() - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

function randomAuthPassword() {
  return base64(randomBytes(32)).replace(/[^A-Za-z0-9]/g, '').slice(0, 36) + 'Aa1';
}

async function sendEmail(to: string, code: string) {
  const subject = 'Tu código de seguridad de Agua Magaly';
  const text =
    'Tu código de seguridad de Agua Magaly es: ' + code + '\n\n' +
    'Vence en ' + OTP_MINUTES + ' minutos. Si no fuiste tú, ignora este mensaje y cambia tu contraseña.';
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#173042">' +
      '<h2 style="margin:0 0 6px;color:#1C7FA8">Agua Magaly</h2>' +
      '<p style="margin:0 0 18px;font-size:15px">Escribe este código para completar tu inicio de sesión:</p>' +
      '<div style="font-size:34px;font-weight:700;letter-spacing:8px;background:#F2F8FB;border:1px solid #CFE3EC;border-radius:12px;padding:18px;text-align:center;color:#0F4C66">' + code + '</div>' +
      '<p style="margin:18px 0 0;font-size:13px;line-height:1.6;color:#5B6B75">Vence en ' + OTP_MINUTES + ' minutos y sirve una sola vez. Si no fuiste tú, ignora este mensaje y cambia tu contraseña.</p>' +
    '</div>';

  const resendKey = Deno.env.get('RESEND_API_KEY');
  const sendgridKey = Deno.env.get('SENDGRID_API_KEY');

  if (resendKey) {
    const from = Deno.env.get('RESEND_FROM') || 'Agua Magaly <onboarding@resend.dev>';
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + resendKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from, to: [to], subject: subject, html: html, text: text })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[staff-2fa] Resend respondio', res.status, detail);
      throw new Error('No se pudo enviar el correo. Revisa la configuración de Resend.');
    }
    return;
  }

  if (sendgridKey) {
    const from = Deno.env.get('SENDGRID_FROM') || 'no-reply@aguamagaly.app';
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + sendgridKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from, name: 'Agua Magaly' },
        subject: subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html }
        ]
      })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[staff-2fa] SendGrid respondio', res.status, detail);
      throw new Error('No se pudo enviar el correo. Revisa la configuración de SendGrid.');
    }
    return;
  }

  throw new Error('Falta configurar el correo saliente. Agrega RESEND_API_KEY o SENDGRID_API_KEY en Supabase.');
}

function makeClients() {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) {
    throw new Error('Configuración del servidor incompleta.');
  }
  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return { anonClient: anonClient, admin: admin, url: url, anonKey: anonKey };
}

async function getCaller(req: Request, admin: any, url: string, anonKey: string) {
  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data, error } = await caller.auth.getUser();
  if (error || !data || !data.user) return null;

  const { data: staff, error: staffError } = await admin
    .from('staff')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();

  if (staffError || !staff || !staff.active) return null;
  return { user: data.user, staff: staff };
}

async function load2fa(admin: any, staffId: string) {
  const { data, error } = await admin
    .from('staff_2fa')
    .select('*')
    .eq('staff_id', staffId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function save2fa(admin: any, staffId: string, patch: Record<string, unknown>) {
  const { data: existing, error: readError } = await admin
    .from('staff_2fa')
    .select('staff_id')
    .eq('staff_id', staffId)
    .maybeSingle();
  if (readError) throw readError;

  if (existing) {
    const { error } = await admin
      .from('staff_2fa')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('staff_id', staffId);
    if (error) throw error;
    return;
  }

  const { error } = await admin
    .from('staff_2fa')
    .insert({ staff_id: staffId, ...patch });
  if (error) throw error;
}

function clearChallenge() {
  return {
    otp_hash: null,
    otp_salt: null,
    otp_expires: null,
    otp_attempts: 0,
    challenge_id: null,
    challenge_expires: null
  };
}

function clearPending() {
  return {
    pending_email: null,
    pending_hash: null,
    pending_salt: null,
    pending_expires: null,
    pending_attempts: 0,
    pending_sent_at: null,
    pending_password_salt: null,
    pending_password_hash: null
  };
}

function clearAllSecrets() {
  return {
    enabled: false,
    email: '',
    password_salt: null,
    password_hash: null,
    recovery_hashes: [],
    recovery_attempts: 0,
    recovery_last_attempt: null,
    ...clearPending(),
    ...clearChallenge(),
    otp_sent_at: null,
    otp_sends: 0,
    otp_window_start: null
  };
}

async function handleStart(anonClient: any, admin: any, body: any) {
  const username = clean(body.username, 80).toLowerCase();
  const password = String(body.password || '');
  if (!username || !password) {
    return json({ ok: false, error: 'Escribe tu usuario y contraseña.' }, 400);
  }

  const { data: staff, error } = await admin
    .from('staff')
    .select('*')
    .eq('username', username)
    .maybeSingle();

  if (error) throw error;
  if (!staff) {
    return json({ ok: false, error: 'Usuario o contraseña incorrectos. Verifica e intenta de nuevo.' });
  }
  if (!staff.active) {
    return json({ ok: false, error: 'Esta cuenta está desactivada. Contacta al administrador.' });
  }

  const row = await load2fa(admin, staff.id);

  if (row && row.enabled && row.email) {
    let valid = false;
    if (row.password_hash && row.password_salt) {
      valid = await verifyHash(password, row.password_salt, row.password_hash);
    } else {
      const check = await anonClient.auth.signInWithPassword({
        email: emailFor(staff.username),
        password: password
      });
      valid = !check.error;
    }
    if (!valid) {
      return json({ ok: false, error: 'Usuario o contraseña incorrectos. Verifica e intenta de nuevo.' });
    }

    const wait = secondsLeft(row.otp_sent_at ? new Date(new Date(row.otp_sent_at).getTime() + OTP_COOLDOWN_SECONDS * 1000).toISOString() : null);
    if (wait > 0) {
      return json({ ok: false, error: 'Espera ' + wait + ' segundo(s) antes de pedir otro código.' });
    }

    const now = Date.now();
    const windowStart = row.otp_window_start ? new Date(row.otp_window_start).getTime() : 0;
    let sends = Number(row.otp_sends || 0);
    if (!windowStart || now - windowStart > OTP_WINDOW_MINUTES * 60 * 1000) {
      sends = 0;
    }
    if (sends >= OTP_MAX_SENDS) {
      return json({ ok: false, error: 'Pediste demasiados códigos. Espera una hora e inténtalo de nuevo.' });
    }

    const code = randomDigits(6);
    const salt = randomSalt();
    const hash = await hashSecret(code, salt);
    const expires = new Date(now + OTP_MINUTES * 60 * 1000).toISOString();
    const challengeId = crypto.randomUUID();

    await save2fa(admin, staff.id, {
      otp_hash: hash,
      otp_salt: salt,
      otp_expires: expires,
      otp_attempts: 0,
      otp_sent_at: new Date(now).toISOString(),
      otp_sends: sends + 1,
      otp_window_start: sends === 0 ? new Date(now).toISOString() : row.otp_window_start,
      challenge_id: challengeId,
      challenge_expires: expires
    });

    try {
      await sendEmail(row.email, code);
    } catch (err) {
      await save2fa(admin, staff.id, clearChallenge());
      const msg = err instanceof Error ? err.message : 'No se pudo enviar el correo.';
      return json({ ok: false, error: msg }, 502);
    }

    return json({
      ok: true,
      twoFactor: true,
      challengeId: challengeId,
      emailMasked: maskEmail(row.email)
    });
  }

  // Sin verificacion en dos pasos: se valida la contrasena y se devuelve la sesion.
  const attempt = await anonClient.auth.signInWithPassword({
    email: emailFor(staff.username),
    password: password
  });
  if (attempt.error || !attempt.data || !attempt.data.session) {
    return json({ ok: false, error: 'Usuario o contraseña incorrectos. Verifica e intenta de nuevo.' });
  }

  return json({
    ok: true,
    twoFactor: false,
    session: {
      access_token: attempt.data.session.access_token,
      refresh_token: attempt.data.session.refresh_token
    }
  });
}

async function handleVerify(admin: any, body: any) {
  const challengeId = clean(body.challengeId, 80);
  const code = clean(body.code, 12).replace(/\D/g, '');
  if (!challengeId || code.length !== 6) {
    return json({ ok: false, error: 'Escribe el código de 6 dígitos.' }, 400);
  }

  const { data: row, error } = await admin
    .from('staff_2fa')
    .select('*')
    .eq('challenge_id', challengeId)
    .maybeSingle();
  if (error) throw error;
  if (!row) {
    return json({ ok: false, error: 'El código expiró. Vuelve a iniciar sesión.' });
  }
  if (!row.challenge_expires || new Date(row.challenge_expires).getTime() < Date.now()) {
    await save2fa(admin, row.staff_id, clearChallenge());
    return json({ ok: false, error: 'El código expiró. Vuelve a iniciar sesión.' });
  }
  if (Number(row.otp_attempts || 0) >= MAX_OTP_ATTEMPTS) {
    await save2fa(admin, row.staff_id, clearChallenge());
    return json({ ok: false, error: 'Demasiados intentos con este código. Vuelve a iniciar sesión.' });
  }

  const valid = await verifyHash(code, row.otp_salt, row.otp_hash);
  if (!valid) {
    const attempts = Number(row.otp_attempts || 0) + 1;
    const patch: Record<string, unknown> = { otp_attempts: attempts };
    if (attempts >= MAX_OTP_ATTEMPTS) Object.assign(patch, clearChallenge());
    await save2fa(admin, row.staff_id, patch);
    return json({
      ok: false,
      error: attempts >= MAX_OTP_ATTEMPTS
        ? 'Demasiados intentos con este código. Vuelve a iniciar sesión.'
        : 'Código incorrecto. Te quedan ' + (MAX_OTP_ATTEMPTS - attempts) + ' intento(s).'
    });
  }

  const { data: staff, error: staffError } = await admin
    .from('staff')
    .select('*')
    .eq('id', row.staff_id)
    .maybeSingle();
  if (staffError) throw staffError;
  if (!staff || !staff.active) {
    return json({ ok: false, error: 'Esta cuenta está desactivada. Contacta al administrador.' });
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: emailFor(staff.username)
  });
  if (linkError || !link || !link.properties || !link.properties.hashed_token) {
    console.error('[staff-2fa] generateLink', linkError);
    return json({ ok: false, error: 'No se pudo completar el inicio de sesión. Inténtalo de nuevo.' }, 500);
  }

  await save2fa(admin, row.staff_id, clearChallenge());
  return json({ ok: true, tokenHash: link.properties.hashed_token });
}

async function handleResend(admin: any, body: any) {
  const challengeId = clean(body.challengeId, 80);
  if (!challengeId) return json({ ok: false, error: 'Sesión de verificación no válida.' }, 400);

  const { data: row, error } = await admin
    .from('staff_2fa')
    .select('*')
    .eq('challenge_id', challengeId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return json({ ok: false, error: 'El código expiró. Vuelve a iniciar sesión.' });
  if (!row.challenge_expires || new Date(row.challenge_expires).getTime() < Date.now()) {
    await save2fa(admin, row.staff_id, clearChallenge());
    return json({ ok: false, error: 'El código expiró. Vuelve a iniciar sesión.' });
  }

  const wait = secondsLeft(row.otp_sent_at ? new Date(new Date(row.otp_sent_at).getTime() + OTP_COOLDOWN_SECONDS * 1000).toISOString() : null);
  if (wait > 0) {
    return json({ ok: false, error: 'Espera ' + wait + ' segundo(s) antes de pedir otro código.' });
  }

  const now = Date.now();
  const windowStart = row.otp_window_start ? new Date(row.otp_window_start).getTime() : 0;
  let sends = Number(row.otp_sends || 0);
  if (!windowStart || now - windowStart > OTP_WINDOW_MINUTES * 60 * 1000) sends = 0;
  if (sends >= OTP_MAX_SENDS) {
    return json({ ok: false, error: 'Pediste demasiados códigos. Espera una hora e inténtalo de nuevo.' });
  }

  const code = randomDigits(6);
  const salt = randomSalt();
  const hash = await hashSecret(code, salt);
  const expires = new Date(now + OTP_MINUTES * 60 * 1000).toISOString();

  await save2fa(admin, row.staff_id, {
    otp_hash: hash,
    otp_salt: salt,
    otp_expires: expires,
    otp_attempts: 0,
    otp_sent_at: new Date(now).toISOString(),
    otp_sends: sends + 1,
    otp_window_start: sends === 0 ? new Date(now).toISOString() : row.otp_window_start,
    challenge_expires: expires
  });

  try {
    await sendEmail(row.email, code);
  } catch (err) {
    await save2fa(admin, row.staff_id, clearChallenge());
    const msg = err instanceof Error ? err.message : 'No se pudo enviar el correo.';
    return json({ ok: false, error: msg }, 502);
  }

  return json({ ok: true, emailMasked: maskEmail(row.email) });
}

async function handleRecover(anonClient: any, admin: any, body: any) {
  const username = clean(body.username, 80).toLowerCase();
  const code = normalizeRecovery(clean(body.code, 24));
  const newPassword = String(body.newPassword || '');

  if (!username || !code) {
    return json({ ok: false, error: 'Escribe tu usuario y el código de recuperación.' }, 400);
  }
  const issue = passwordIssue(newPassword);
  if (issue) return json({ ok: false, error: issue }, 400);

  const { data: staff, error } = await admin
    .from('staff')
    .select('*')
    .eq('username', username)
    .maybeSingle();
  if (error) throw error;
  if (!staff || !staff.active) {
    return json({ ok: false, error: 'Código de recuperación inválido.' });
  }

  const row = await load2fa(admin, staff.id);
  if (!row || !row.enabled || !Array.isArray(row.recovery_hashes) || !row.recovery_hashes.length) {
    return json({ ok: false, error: 'No hay códigos de recuperación disponibles. Usa el panel de Supabase o contacta al administrador.' });
  }

  const last = row.recovery_last_attempt ? new Date(row.recovery_last_attempt).getTime() : 0;
  if (last && Date.now() - last < RECOVERY_WINDOW_MINUTES * 60 * 1000 && Number(row.recovery_attempts || 0) >= RECOVERY_MAX_ATTEMPTS) {
    return json({ ok: false, error: 'Demasiados intentos. Espera ' + RECOVERY_WINDOW_MINUTES + ' minutos e inténtalo de nuevo.' });
  }

  let matched = -1;
  for (let i = 0; i < row.recovery_hashes.length; i++) {
    const item = row.recovery_hashes[i] || {};
    if (await verifyHash(code, String(item.salt || ''), String(item.hash || ''))) {
      matched = i;
      break;
    }
  }

  if (matched < 0) {
    const attempts = (last && Date.now() - last < RECOVERY_WINDOW_MINUTES * 60 * 1000)
      ? Number(row.recovery_attempts || 0) + 1
      : 1;
    await save2fa(admin, staff.id, {
      recovery_attempts: attempts,
      recovery_last_attempt: new Date().toISOString()
    });
    return json({ ok: false, error: 'Código de recuperación inválido.' });
  }

  const { error: passError } = await admin.auth.admin.updateUserById(staff.id, {
    password: newPassword
  });
  if (passError) {
    console.error('[staff-2fa] updateUserById recover', passError);
    return json({ ok: false, error: 'No se pudo actualizar la contraseña. Inténtalo de nuevo.' }, 500);
  }

  await save2fa(admin, staff.id, clearAllSecrets());

  const signIn = await anonClient.auth.signInWithPassword({
    email: emailFor(staff.username),
    password: newPassword
  });
  if (signIn.error || !signIn.data || !signIn.data.session) {
    return json({ ok: true, passwordReset: true });
  }

  return json({
    ok: true,
    session: {
      access_token: signIn.data.session.access_token,
      refresh_token: signIn.data.session.refresh_token
    }
  });
}

async function requireAdmin(req: Request, admin: any, url: string, anonKey: string) {
  const caller = await getCaller(req, admin, url, anonKey);
  if (!caller) return { error: json({ ok: false, error: 'Sesión requerida.' }, 401) };
  if (caller.staff.role !== 'admin') {
    return { error: json({ ok: false, error: 'Solo el administrador puede usar esta opción.' }, 403) };
  }
  return { caller: caller };
}

async function handleStatus(req: Request, admin: any, url: string, anonKey: string) {
  const guard = await requireAdmin(req, admin, url, anonKey);
  if (guard.error) return guard.error;
  const staff = guard.caller.staff;
  const row = await load2fa(admin, staff.id);
  return json({
    ok: true,
    enabled: !!(row && row.enabled),
    email: (row && row.email) || '',
    emailMasked: maskEmail((row && row.email) || ''),
    recoveryCount: row && Array.isArray(row.recovery_hashes) ? row.recovery_hashes.length : 0
  });
}

async function handleSetupStart(req: Request, admin: any, anonClient: any, url: string, anonKey: string, body: any) {
  const guard = await requireAdmin(req, admin, url, anonKey);
  if (guard.error) return guard.error;
  const staff = guard.caller.staff;

  const email = clean(body.email, 254).toLowerCase();
  const password = String(body.password || '');
  if (!isEmail(email)) {
    return json({ ok: false, error: 'Escribe un correo válido, por ejemplo nombre@gmail.com.' }, 400);
  }
  if (!password) {
    return json({ ok: false, error: 'Escribe tu contraseña actual para confirmar el cambio.' }, 400);
  }

  const row = await load2fa(admin, staff.id);
  const enabled = !!(row && row.enabled);

  if (enabled) {
    if (!(await verifyHash(password, row.password_salt, row.password_hash))) {
      return json({ ok: false, error: 'La contraseña actual no es correcta.' }, 400);
    }
  } else {
    const check = await anonClient.auth.signInWithPassword({
      email: emailFor(staff.username),
      password: password
    });
    if (check.error) {
      return json({ ok: false, error: 'La contraseña actual no es correcta.' }, 400);
    }
  }

  if (row && row.pending_sent_at && secondsLeft(new Date(new Date(row.pending_sent_at).getTime() + OTP_COOLDOWN_SECONDS * 1000).toISOString()) > 0) {
    return json({ ok: false, error: 'Espera un minuto antes de pedir otro código.' });
  }

  const code = randomDigits(6);
  const salt = randomSalt();
  const hash = await hashSecret(code, salt);
  const passwordSalt = enabled ? row.password_salt : randomSalt();
  const passwordHash = enabled ? row.password_hash : await hashSecret(password, passwordSalt);

  await save2fa(admin, staff.id, {
    pending_email: email,
    pending_hash: hash,
    pending_salt: salt,
    pending_expires: new Date(Date.now() + OTP_MINUTES * 60 * 1000).toISOString(),
    pending_attempts: 0,
    pending_sent_at: new Date().toISOString(),
    pending_password_salt: passwordSalt,
    pending_password_hash: passwordHash
  });

  try {
    await sendEmail(email, code);
  } catch (err) {
    await save2fa(admin, staff.id, clearPending());
    const msg = err instanceof Error ? err.message : 'No se pudo enviar el correo.';
    return json({ ok: false, error: msg }, 502);
  }

  return json({ ok: true, emailMasked: maskEmail(email) });
}

async function handleSetupVerify(req: Request, admin: any, url: string, anonKey: string, body: any) {
  const guard = await requireAdmin(req, admin, url, anonKey);
  if (guard.error) return guard.error;
  const staff = guard.caller.staff;

  const code = clean(body.code, 12).replace(/\D/g, '');
  if (code.length !== 6) {
    return json({ ok: false, error: 'Escribe el código de 6 dígitos.' }, 400);
  }

  const row = await load2fa(admin, staff.id);
  if (!row || !row.pending_email || !row.pending_expires) {
    return json({ ok: false, error: 'Primero pide un código de confirmación.' }, 400);
  }
  if (new Date(row.pending_expires).getTime() < Date.now()) {
    await save2fa(admin, staff.id, clearPending());
    return json({ ok: false, error: 'El código expiró. Pide uno nuevo.' });
  }
  if (Number(row.pending_attempts || 0) >= MAX_OTP_ATTEMPTS) {
    await save2fa(admin, staff.id, clearPending());
    return json({ ok: false, error: 'Demasiados intentos. Pide un código nuevo.' });
  }

  const valid = await verifyHash(code, row.pending_salt, row.pending_hash);
  if (!valid) {
    const attempts = Number(row.pending_attempts || 0) + 1;
    const patch: Record<string, unknown> = { pending_attempts: attempts };
    if (attempts >= MAX_OTP_ATTEMPTS) Object.assign(patch, clearPending());
    await save2fa(admin, staff.id, patch);
    return json({
      ok: false,
      error: attempts >= MAX_OTP_ATTEMPTS
        ? 'Demasiados intentos. Pide un código nuevo.'
        : 'Código incorrecto. Te quedan ' + (MAX_OTP_ATTEMPTS - attempts) + ' intento(s).'
    });
  }

  const recoveryCodes: string[] = [];
  const recoveryHashes: Array<{ salt: string; hash: string }> = [];
  for (let i = 0; i < 10; i++) {
    const plain = randomRecoveryCode();
    const salt = randomSalt();
    recoveryCodes.push(plain);
    recoveryHashes.push({ salt: salt, hash: await hashSecret(normalizeRecovery(plain), salt) });
  }

  const enabling = !(row.enabled && row.password_hash);
  const patch: Record<string, unknown> = {
    email: row.pending_email,
    enabled: true,
    recovery_hashes: recoveryHashes,
    recovery_attempts: 0,
    recovery_last_attempt: null,
    ...clearPending(),
    ...clearChallenge()
  };

  if (enabling) {
    if (!row.pending_password_hash || !row.pending_password_salt) {
      return json({ ok: false, error: 'No se pudo preparar la verificación. Inténtalo de nuevo.' }, 400);
    }
    patch.password_hash = row.pending_password_hash;
    patch.password_salt = row.pending_password_salt;
  }

  await save2fa(admin, staff.id, patch);

  if (enabling) {
    const { error: rotateError } = await admin.auth.admin.updateUserById(staff.id, {
      password: randomAuthPassword()
    });
    if (rotateError) {
      console.error('[staff-2fa] rotate password', rotateError);
      await save2fa(admin, staff.id, {
        enabled: false,
        password_hash: null,
        password_salt: null,
        recovery_hashes: []
      });
      return json({ ok: false, error: 'No se pudo activar la verificación. Inténtalo de nuevo.' }, 500);
    }
  }

  return json({
    ok: true,
    recoveryCodes: recoveryCodes,
    emailMasked: maskEmail(String(row.pending_email))
  });
}

async function handleDisable(req: Request, admin: any, url: string, anonKey: string, body: any) {
  const guard = await requireAdmin(req, admin, url, anonKey);
  if (guard.error) return guard.error;
  const staff = guard.caller.staff;

  const password = String(body.password || '');
  const row = await load2fa(admin, staff.id);
  if (!row || !row.enabled) return json({ ok: true });

  if (!(await verifyHash(password, row.password_salt, row.password_hash))) {
    return json({ ok: false, error: 'La contraseña actual no es correcta.' }, 400);
  }

  const { error } = await admin.auth.admin.updateUserById(staff.id, { password: password });
  if (error) {
    console.error('[staff-2fa] restore password', error);
    return json({ ok: false, error: 'No se pudo desactivar. Inténtalo de nuevo.' }, 500);
  }

  await save2fa(admin, staff.id, clearAllSecrets());
  return json({ ok: true });
}

async function handleRegenerate(req: Request, admin: any, url: string, anonKey: string, body: any) {
  const guard = await requireAdmin(req, admin, url, anonKey);
  if (guard.error) return guard.error;
  const staff = guard.caller.staff;

  const password = String(body.password || '');
  const row = await load2fa(admin, staff.id);
  if (!row || !row.enabled) {
    return json({ ok: false, error: 'La verificación en dos pasos no está activada.' }, 400);
  }
  if (!(await verifyHash(password, row.password_salt, row.password_hash))) {
    return json({ ok: false, error: 'La contraseña actual no es correcta.' }, 400);
  }

  const recoveryCodes: string[] = [];
  const recoveryHashes: Array<{ salt: string; hash: string }> = [];
  for (let i = 0; i < 10; i++) {
    const plain = randomRecoveryCode();
    const salt = randomSalt();
    recoveryCodes.push(plain);
    recoveryHashes.push({ salt: salt, hash: await hashSecret(normalizeRecovery(plain), salt) });
  }

  await save2fa(admin, staff.id, {
    recovery_hashes: recoveryHashes,
    recovery_attempts: 0,
    recovery_last_attempt: null
  });

  return json({ ok: true, recoveryCodes: recoveryCodes });
}

async function handleChangePassword(req: Request, admin: any, anonClient: any, url: string, anonKey: string, body: any) {
  const guard = await requireAdmin(req, admin, url, anonKey);
  if (guard.error) return guard.error;
  const staff = guard.caller.staff;

  const current = String(body.currentPassword || '');
  const next = String(body.newPassword || '');
  const issue = passwordIssue(next);
  if (issue) return json({ ok: false, error: issue }, 400);

  const row = await load2fa(admin, staff.id);
  if (row && row.enabled && row.password_hash) {
    if (!(await verifyHash(current, row.password_salt, row.password_hash))) {
      return json({ ok: false, error: 'La contraseña actual no es correcta.' }, 400);
    }
    const salt = randomSalt();
    const hash = await hashSecret(next, salt);
    await save2fa(admin, staff.id, { password_salt: salt, password_hash: hash });
    const { error } = await admin.auth.admin.updateUserById(staff.id, { password: randomAuthPassword() });
    if (error) {
      console.error('[staff-2fa] change password rotate', error);
      return json({ ok: false, error: 'No se pudo guardar la contraseña. Inténtalo de nuevo.' }, 500);
    }
    return json({ ok: true });
  }

  const check = await anonClient.auth.signInWithPassword({
    email: emailFor(staff.username),
    password: current
  });
  if (check.error) {
    return json({ ok: false, error: 'La contraseña actual no es correcta.' }, 400);
  }
  const { error } = await admin.auth.admin.updateUserById(staff.id, { password: next });
  if (error) {
    return json({ ok: false, error: 'No se pudo guardar la contraseña. Inténtalo de nuevo.' }, 500);
  }
  return json({ ok: true });
}

async function handleAdminReset(req: Request, admin: any, url: string, anonKey: string, body: any) {
  const guard = await requireAdmin(req, admin, url, anonKey);
  if (guard.error) return guard.error;
  const caller = guard.caller;

  const staffId = clean(body.staffId, 60);
  const newPassword = String(body.newPassword || '');
  const issue = passwordIssue(newPassword);
  if (issue) return json({ ok: false, error: issue }, 400);
  if (!staffId) return json({ ok: false, error: 'Usuario no indicado.' }, 400);
  if (staffId === caller.staff.id) {
    return json({ ok: false, error: 'Usa «Mi cuenta» para cambiar tu propia contraseña.' }, 400);
  }

  const { data: target, error } = await admin
    .from('staff')
    .select('*')
    .eq('id', staffId)
    .maybeSingle();
  if (error) throw error;
  if (!target) return json({ ok: false, error: 'Usuario no encontrado.' }, 404);
  if (target.role === 'admin') {
    return json({ ok: false, error: 'No puedes restablecer la cuenta de otro administrador.' }, 403);
  }

  const { error: passError } = await admin.auth.admin.updateUserById(staffId, { password: newPassword });
  if (passError) {
    console.error('[staff-2fa] admin reset', passError);
    return json({ ok: false, error: 'No se pudo restablecer la contraseña.' }, 500);
  }

  await save2fa(admin, staffId, clearAllSecrets());
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido.' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Datos inválidos.' }, 400);
  }

  const action = clean(body.action, 40);
  if (!action) return json({ ok: false, error: 'Acción no indicada.' }, 400);

  try {
    const clients = makeClients();
    const admin = clients.admin;
    const anonClient = clients.anonClient;

    switch (action) {
      case 'start':
        return await handleStart(anonClient, admin, body);
      case 'verify':
        return await handleVerify(admin, body);
      case 'resend':
        return await handleResend(admin, body);
      case 'recover':
        return await handleRecover(anonClient, admin, body);
      case 'status':
        return await handleStatus(req, admin, clients.url, clients.anonKey);
      case 'setup-start':
        return await handleSetupStart(req, admin, anonClient, clients.url, clients.anonKey, body);
      case 'setup-verify':
        return await handleSetupVerify(req, admin, clients.url, clients.anonKey, body);
      case 'disable':
        return await handleDisable(req, admin, clients.url, clients.anonKey, body);
      case 'regenerate':
        return await handleRegenerate(req, admin, clients.url, clients.anonKey, body);
      case 'change-password':
        return await handleChangePassword(req, admin, anonClient, clients.url, clients.anonKey, body);
      case 'admin-reset':
        return await handleAdminReset(req, admin, clients.url, clients.anonKey, body);
      default:
        return json({ ok: false, error: 'Acción no válida.' }, 400);
    }
  } catch (err) {
    console.error('[staff-2fa] error inesperado', err);
    const msg = err instanceof Error ? err.message : 'Error inesperado.';
    return json({ ok: false, error: msg }, 500);
  }
});
