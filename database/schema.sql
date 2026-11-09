-- ============================================================================
-- AGUA MAGALY — BASE DE DATOS (SUPABASE)
-- ----------------------------------------------------------------------------
-- Pega TODO este archivo en Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin romper nada.
--
-- Diseño:
--   * public.staff    → personal (administrador y repartidores) ligado al
--                       inicio de sesión de Supabase.
--   * public.records  → todos los datos de la app (pedidos, PQRS, productos,
--                       rutas y ajustes), guardados como JSON.
--   * public.staff_2fa → datos privados de la verificación en dos pasos
--                       (solo los usa la Edge Function `staff-2fa`).
--
-- Seguridad:
--   * Cualquier visitante puede CREAR pedidos y PQRS (formulario público),
--     pero el servidor sanea esos datos (estado, repartidor, cobro, total).
--   * Solo el personal con sesión iniciada puede LEER pedidos/PQRS.
--   * El repartidor solo ve y actualiza sus pedidos asignados.
--   * El administrador gestiona todo el catálogo, rutas, PQRS y personal.
--   * El catálogo de productos y los ajustes son de lectura pública.
--   * Para bases ya creadas, aplica también database/security-hardening.sql.
--   * DESPUÉS de este archivo ejecuta database/mejoras-2026.sql (doble factor,
--     total calculado en el servidor, anti-spam, seguimiento e inventario).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PERSONAL
-- ----------------------------------------------------------------------------
create table if not exists public.staff (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique not null,
  name        text not null default '',
  phone       text not null default '',
  email       text not null default '',
  role        text not null default 'driver' check (role in ('admin', 'driver')),
  color       text not null default '#1C7FA8',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Para bases ya creadas (la columna email se agregó con la verificación 2FA).
alter table public.staff add column if not exists email text not null default '';

-- ----------------------------------------------------------------------------
-- 2. DATOS DE LA APLICACIÓN
-- ----------------------------------------------------------------------------
create table if not exists public.records (
  entity      text not null check (entity in ('products', 'orders', 'routes', 'pqrs', 'settings')),
  id          text not null,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  primary key (entity, id)
);

create index if not exists records_entity_updated_idx
  on public.records (entity, updated_at desc);

-- ----------------------------------------------------------------------------
-- 2b. VERIFICACIÓN EN DOS PASOS (privada)
-- ----------------------------------------------------------------------------
-- Guarda el correo personal del administrador, el hash de su contraseña real,
-- los códigos de un solo uso y los códigos de recuperación. El navegador NO
-- puede leer esta tabla: solo la Edge Function `staff-2fa` con service_role.
create table if not exists public.staff_2fa (
  staff_id              uuid primary key references public.staff (id) on delete cascade,
  email                 text not null default '',
  enabled               boolean not null default false,
  password_salt         text,
  password_hash         text,
  pending_email         text,
  pending_hash          text,
  pending_salt          text,
  pending_expires       timestamptz,
  pending_attempts      integer not null default 0,
  pending_sent_at       timestamptz,
  pending_password_salt text,
  pending_password_hash text,
  otp_hash              text,
  otp_salt              text,
  otp_expires           timestamptz,
  otp_attempts          integer not null default 0,
  otp_sent_at           timestamptz,
  otp_sends             integer not null default 0,
  otp_window_start      timestamptz,
  challenge_id          uuid,
  challenge_expires     timestamptz,
  recovery_hashes       jsonb not null default '[]'::jsonb,
  recovery_attempts     integer not null default 0,
  recovery_last_attempt timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists staff_2fa_challenge_idx
  on public.staff_2fa (challenge_id);

-- ----------------------------------------------------------------------------
-- 3. FUNCIONES DE APOYO
-- ----------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.active
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.id = auth.uid() and s.active and s.role = 'admin'
  );
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists records_touch on public.records;
create trigger records_touch
  before update on public.records
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. PERMISOS Y SEGURIDAD POR FILAS (RLS)
-- ----------------------------------------------------------------------------
alter table public.staff     enable row level security;
alter table public.records   enable row level security;
alter table public.staff_2fa enable row level security;

grant select, insert, update, delete on public.records to anon, authenticated;
grant select, insert, update, delete on public.staff   to authenticated;

-- La verificación 2FA solo la usa la Edge Function con service_role.
revoke all on public.staff_2fa from anon, authenticated;
grant all on public.staff_2fa to service_role;

-- Personal: cada quien ve su ficha; solo el administrador ve y gestiona todo.
drop policy if exists "staff_read" on public.staff;
create policy "staff_read" on public.staff
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists "staff_admin_manage" on public.staff;
create policy "staff_admin_manage" on public.staff
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Datos: catálogo público de productos y ajustes.
drop policy if exists "records_public_catalog" on public.records;
create policy "records_public_catalog" on public.records
  for select to anon, authenticated
  using (entity in ('products', 'settings'));

-- Datos: los clientes pueden crear pedidos y PQRS (nunca el personal).
drop policy if exists "records_public_create" on public.records;
create policy "records_public_create" on public.records
  for insert to anon, authenticated
  with check (entity in ('orders', 'pqrs') and not public.is_staff());

-- Datos: solo el administrador crea, edita y borra el resto.
drop policy if exists "records_admin_insert" on public.records;
create policy "records_admin_insert" on public.records
  for insert to authenticated
  with check (public.is_admin());

drop policy if exists "records_admin_update" on public.records;
create policy "records_admin_update" on public.records
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "records_admin_delete" on public.records;
create policy "records_admin_delete" on public.records
  for delete to authenticated
  using (public.is_admin());

-- Datos: el repartidor solo actualiza sus pedidos asignados.
drop policy if exists "records_driver_update" on public.records;
create policy "records_driver_update" on public.records
  for update to authenticated
  using (
    public.is_staff()
    and entity = 'orders'
    and data->>'driverId' = auth.uid()::text
  )
  with check (
    public.is_staff()
    and entity = 'orders'
    and data->>'driverId' = auth.uid()::text
  );

-- Datos: lectura del equipo (admin todo; repartidor catálogo, ajustes y lo suyo).
drop policy if exists "records_staff_read" on public.records;
create policy "records_staff_read" on public.records
  for select to authenticated
  using (
    public.is_admin()
    or (
      public.is_staff()
      and (
        entity in ('products', 'settings')
        or (entity = 'orders' and data->>'driverId' = auth.uid()::text)
      )
    )
  );

-- El público no necesita actualizar ni borrar registros.
revoke update, delete on public.records from anon;

-- ----------------------------------------------------------------------------
-- 5. SANEAMIENTO Y PROTECCIÓN DE PEDIDOS
-- ----------------------------------------------------------------------------
create or replace function public.sanitize_public_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  d jsonb;
  n numeric;
begin
  if public.is_staff() then
    return new;
  end if;

  d := coalesce(new.data, '{}'::jsonb);

  if new.entity = 'orders' then
    d := jsonb_set(d, '{status}',      to_jsonb('Pendiente'::text), true);
    d := jsonb_set(d, '{driverId}',    'null'::jsonb,                true);
    d := jsonb_set(d, '{driverName}',  to_jsonb(''::text),           true);
    d := jsonb_set(d, '{paid}',        'false'::jsonb,               true);
    d := jsonb_set(d, '{payment}',     to_jsonb(''::text),           true);
    d := jsonb_set(d, '{events}',      '[]'::jsonb,                  true);
    d := jsonb_set(d, '{createdAt}',   to_jsonb(now()),              true);
    d := jsonb_set(d, '{source}',      to_jsonb('web'::text),        true);

    begin
      n := coalesce((d->>'total')::numeric, 0);
    exception when others then
      n := 0;
    end;
    n := greatest(0, least(n, 100000000));
    d := jsonb_set(d, '{total}', to_jsonb(n), true);

    d := jsonb_set(d, '{client}',  to_jsonb(left(coalesce(d->>'client',''),  120)), true);
    d := jsonb_set(d, '{phone}',   to_jsonb(left(coalesce(d->>'phone',''),    40)), true);
    d := jsonb_set(d, '{address}', to_jsonb(left(coalesce(d->>'address',''), 240)), true);
    d := jsonb_set(d, '{items}',   to_jsonb(left(coalesce(d->>'items',''),   600)), true);
    d := jsonb_set(d, '{notes}',   to_jsonb(left(coalesce(d->>'notes',''),   600)), true);

  elsif new.entity = 'pqrs' then
    d := jsonb_set(d, '{status}',    to_jsonb('Nueva'::text), true);
    d := jsonb_set(d, '{createdAt}', to_jsonb(now()),         true);
    d := jsonb_set(d, '{name}',      to_jsonb(left(coalesce(d->>'name',''),    120)), true);
    d := jsonb_set(d, '{contact}',   to_jsonb(left(coalesce(d->>'contact',''),  80)), true);
    d := jsonb_set(d, '{message}',   to_jsonb(left(coalesce(d->>'message',''), 2000)), true);
    d := jsonb_set(d, '{type}',      to_jsonb(left(coalesce(d->>'type','Solicitud'), 60)), true);
  end if;

  new.data := d;
  return new;
end;
$fn$;

drop trigger if exists records_sanitize_public on public.records;
create trigger records_sanitize_public
  before insert on public.records
  for each row execute function public.sanitize_public_record();

create or replace function public.guard_record_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.entity = 'orders' then
    if coalesce(old.data->>'driverId','') <> coalesce(new.data->>'driverId','') then
      raise exception 'No puedes reasignar un pedido.';
    end if;
    if coalesce(old.data->>'client','')  <> coalesce(new.data->>'client','')
       or coalesce(old.data->>'phone','')   <> coalesce(new.data->>'phone','')
       or coalesce(old.data->>'address','') <> coalesce(new.data->>'address','')
       or coalesce(old.data->>'total','')   <> coalesce(new.data->>'total','')
       or coalesce(old.data->>'code','')    <> coalesce(new.data->>'code','') then
      raise exception 'No puedes cambiar los datos base del pedido.';
    end if;
  end if;

  return new;
end;
$fn$;

drop trigger if exists records_guard_update on public.records;
create trigger records_guard_update
  before update on public.records
  for each row execute function public.guard_record_update();

-- ----------------------------------------------------------------------------
-- 6. TIEMPO REAL (para que el panel se actualice solo)
-- ----------------------------------------------------------------------------
alter table public.records replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'records'
  ) then
    alter publication supabase_realtime add table public.records;
  end if;
end;
$$;

-- ============================================================================
-- FIN
-- ============================================================================
