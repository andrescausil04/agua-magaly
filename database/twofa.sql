-- AGUA MAGALY - verificacion en dos pasos por correo (una sola sentencia).
-- Pegar TODO en Supabase > SQL Editor > New query > Run.
-- La tabla staff_2fa NO es accesible desde el navegador: solo la Edge Function
-- con service_role puede leer y escribir los codigos y sus hashes.
do $twofa$
begin
  execute 'alter table public.staff add column if not exists email text not null default ''''';
  execute 'create table if not exists public.staff_2fa (
    staff_id uuid primary key references public.staff(id) on delete cascade,
    email text not null default '''',
    enabled boolean not null default false,
    password_salt text,
    password_hash text,
    pending_email text,
    pending_hash text,
    pending_salt text,
    pending_expires timestamptz,
    pending_attempts integer not null default 0,
    pending_sent_at timestamptz,
    pending_password_salt text,
    pending_password_hash text,
    otp_hash text,
    otp_salt text,
    otp_expires timestamptz,
    otp_attempts integer not null default 0,
    otp_sent_at timestamptz,
    otp_sends integer not null default 0,
    otp_window_start timestamptz,
    challenge_id uuid,
    challenge_expires timestamptz,
    recovery_hashes jsonb not null default ''[]''::jsonb,
    recovery_attempts integer not null default 0,
    recovery_last_attempt timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )';
  execute 'create index if not exists staff_2fa_challenge_idx on public.staff_2fa (challenge_id)';
  execute 'alter table public.staff_2fa enable row level security';
  execute 'revoke all on public.staff_2fa from anon, authenticated';
  execute 'grant all on public.staff_2fa to service_role';
end
$twofa$;
