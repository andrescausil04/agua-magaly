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
--
-- Seguridad:
--   * Cualquier visitante puede CREAR pedidos y PQRS (formulario público).
--   * Solo el personal con sesión iniciada puede LEER pedidos/PQRS y editar.
--   * El catálogo de productos y los ajustes son de lectura pública.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PERSONAL
-- ----------------------------------------------------------------------------
create table if not exists public.staff (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique not null,
  name        text not null default '',
  phone       text not null default '',
  role        text not null default 'driver' check (role in ('admin', 'driver')),
  color       text not null default '#1C7FA8',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

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

create or replace function public.staff_is_empty()
returns boolean
language sql stable security definer set search_path = public
as $$
  select not exists (select 1 from public.staff);
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
alter table public.staff   enable row level security;
alter table public.records enable row level security;

grant select, insert, update, delete on public.records to anon, authenticated;
grant select, insert, update, delete on public.staff   to authenticated;

-- Personal: lo puede ver el equipo; solo el administrador lo gestiona.
drop policy if exists "staff_read" on public.staff;
create policy "staff_read" on public.staff
  for select to authenticated
  using (public.is_staff());

drop policy if exists "staff_bootstrap_first_admin" on public.staff;
create policy "staff_bootstrap_first_admin" on public.staff
  for insert to authenticated
  with check (public.staff_is_empty());

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

-- Datos: los clientes pueden crear pedidos y PQRS.
drop policy if exists "records_public_create" on public.records;
create policy "records_public_create" on public.records
  for insert to anon, authenticated
  with check (entity in ('orders', 'pqrs'));

-- Datos: el equipo puede leer todo.
drop policy if exists "records_staff_read" on public.records;
create policy "records_staff_read" on public.records
  for select to authenticated
  using (public.is_staff());

-- Datos: el equipo puede crear, editar y borrar.
drop policy if exists "records_staff_insert" on public.records;
create policy "records_staff_insert" on public.records
  for insert to authenticated
  with check (public.is_staff());

drop policy if exists "records_staff_update" on public.records;
create policy "records_staff_update" on public.records
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "records_staff_delete" on public.records;
create policy "records_staff_delete" on public.records
  for delete to authenticated
  using (public.is_staff());

-- ----------------------------------------------------------------------------
-- 5. TIEMPO REAL (para que el panel se actualice solo)
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
