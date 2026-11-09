-- ============================================================================
-- AGUA MAGALY — MEJORAS DE SEGURIDAD, SEGUIMIENTO E INVENTARIO (noviembre 2026)
-- ----------------------------------------------------------------------------
-- Pégalo en Supabase → SQL Editor → New query → Run.
-- Se puede ejecutar varias veces sin romper nada.
--
-- Publica primero la nueva versión de la web y luego ejecuta este archivo.
-- No cambia la verificación en dos pasos por correo (staff-2fa / twofa.sql).
--
-- Si tu herramienta solo acepta UNA sentencia o menos de 100 líneas, usa
-- database/mejoras-2026-compacto.sql (hace exactamente lo mismo).
--
-- Qué agrega:
--   1. El total del pedido se calcula en el servidor con los precios reales.
--   2. Límite contra spam en pedidos y PQRS.
--   3. El repartidor ya no puede cambiar los productos de un pedido.
--   4. Seguimiento público del pedido con código + celular.
--   5. Inventario: el stock baja solo al entregar y sube si se revierte.
-- ============================================================================

-- @@ 1. Estructura: nueva entidad "stock" y fecha de creación de cada registro.
alter table public.records drop constraint if exists records_entity_check;
-- @@
alter table public.records add constraint records_entity_check check (entity in ('products', 'orders', 'routes', 'pqrs', 'settings', 'stock'));
-- @@
alter table public.records add column if not exists created_at timestamptz not null default now();
-- @@
create index if not exists records_entity_created_idx on public.records (entity, created_at desc);

-- @@ 2. Pedidos y PQRS públicos: saneamiento, total real y límite anti-spam.
create or replace function public.sanitize_public_record()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  d jsonb; line jsonb; p jsonb; q integer; price numeric; total numeric := 0;
  clean_lines jsonb := '[]'::jsonb; names text[] := '{}'; phone text; code text; recent integer;
begin
  if public.is_staff() then return new; end if;
  d := coalesce(new.data, '{}'::jsonb);
  select count(*) into recent from public.records r
   where r.entity in ('orders', 'pqrs') and r.created_at > now() - interval '1 minute' and r.data->>'source' = 'web';
  if recent >= 30 then raise exception 'Estamos recibiendo muchas solicitudes. Intenta de nuevo en un minuto.'; end if;
  if new.entity = 'orders' then
    phone := right(regexp_replace(coalesce(d->>'phone', ''), '\D', '', 'g'), 10);
    if phone !~ '^3[0-9]{9}$' then raise exception 'El celular debe tener 10 dígitos y empezar por 3.'; end if;
    select count(*) into recent from public.records r
     where r.entity = 'orders' and r.created_at > now() - interval '10 minutes' and r.data->>'phone' = phone;
    if recent >= 3 then raise exception 'Ya recibimos varios pedidos de este número. Espera unos minutos o escríbenos por WhatsApp.'; end if;
    if jsonb_typeof(d->'lines') = 'array' then
      for line in select value from jsonb_array_elements(d->'lines') limit 20 loop
        begin q := (line->>'qty')::integer; exception when others then q := 0; end;
        if q is null or q < 1 or q > 999 then continue; end if;
        select r.data into p from public.records r
         where r.entity = 'products' and r.id = line->>'id' and coalesce(r.data->>'active', 'true') <> 'false';
        if p is null then continue; end if;
        begin price := greatest(0, (p->>'price')::numeric); exception when others then price := 0; end;
        total := total + price * q;
        names := names || (q || ' × ' || coalesce(p->>'name', 'Producto'));
        clean_lines := clean_lines || jsonb_build_object('id', line->>'id', 'name', p->>'name', 'qty', q, 'price', price);
      end loop;
    end if;
    if jsonb_array_length(clean_lines) = 0 then raise exception 'El pedido no tiene productos válidos.'; end if;
    code := upper(coalesce(d->>'code', ''));
    if code !~ '^AM-[A-Z0-9]{6}$' or exists (select 1 from public.records r where r.entity = 'orders' and r.data->>'code' = code) then
      code := 'AM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    end if;
    d := d || jsonb_build_object(
      'code', code, 'status', 'Pendiente', 'driverId', null, 'driverName', '', 'routeId', null, 'routeName', '',
      'paid', false, 'payment', '', 'source', 'web', 'createdAt', now(), 'phone', phone,
      'lines', clean_lines, 'items', array_to_string(names, ', '), 'total', total,
      'events', jsonb_build_array(jsonb_build_object('type', 'creado', 'at', now(), 'by', 'Cliente (web)', 'note', 'Pedido enviado desde la tienda')),
      'client', left(coalesce(d->>'client', ''), 120), 'address', left(coalesce(d->>'address', ''), 240),
      'notes', left(coalesce(d->>'notes', ''), 600));
    new.id := left(coalesce(new.id, code), 60);
  elsif new.entity = 'pqrs' then
    if coalesce(d->>'contact', '') <> '' then
      select count(*) into recent from public.records r
       where r.entity = 'pqrs' and r.created_at > now() - interval '10 minutes' and r.data->>'contact' = left(d->>'contact', 80);
      if recent >= 3 then raise exception 'Ya recibimos varios mensajes de este contacto. Espera unos minutos.'; end if;
    end if;
    d := d || jsonb_build_object(
      'status', 'Nueva', 'createdAt', now(), 'source', 'web',
      'name', left(coalesce(d->>'name', ''), 120), 'contact', left(coalesce(d->>'contact', ''), 80),
      'message', left(coalesce(d->>'message', ''), 2000), 'type', left(coalesce(d->>'type', 'Solicitud'), 60));
  end if;
  new.data := d;
  return new;
end;
$fn$;
-- @@
drop trigger if exists records_sanitize_public on public.records;
-- @@
create trigger records_sanitize_public before insert on public.records for each row execute function public.sanitize_public_record();

-- @@ 3. El repartidor no puede cambiar datos base ni productos del pedido.
create or replace function public.guard_record_update()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare k text;
begin
  if public.is_admin() then return new; end if;
  if new.entity = 'orders' then
    foreach k in array array['driverId', 'client', 'phone', 'address', 'total', 'code', 'items', 'routeId'] loop
      if coalesce(old.data->>k, '') <> coalesce(new.data->>k, '') then
        raise exception 'No puedes cambiar los datos base del pedido (%).', k;
      end if;
    end loop;
    if coalesce(old.data->'lines', '[]'::jsonb) <> coalesce(new.data->'lines', '[]'::jsonb) then
      raise exception 'No puedes cambiar los productos del pedido.';
    end if;
  end if;
  return new;
end;
$fn$;
-- @@
drop trigger if exists records_guard_update on public.records;
-- @@
create trigger records_guard_update before update on public.records for each row execute function public.guard_record_update();

-- @@ 4. Inventario: descuenta al entregar y devuelve si el pedido deja de estar entregado.
create or replace function public.apply_stock_on_delivery()
returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare sign integer := 0; line jsonb; q numeric; who text; mid text;
begin
  if coalesce(new.data->>'status', '') = 'Entregado' and coalesce(old.data->>'status', '') <> 'Entregado' then sign := -1;
  elsif coalesce(old.data->>'status', '') = 'Entregado' and coalesce(new.data->>'status', '') <> 'Entregado' then sign := 1;
  else return new; end if;
  if jsonb_typeof(new.data->'lines') <> 'array' then return new; end if;
  select s.name into who from public.staff s where s.id = auth.uid();
  for line in select value from jsonb_array_elements(new.data->'lines') loop
    begin q := (line->>'qty')::numeric; exception when others then q := 0; end;
    if coalesce(q, 0) <= 0 then continue; end if;
    update public.records r
       set data = jsonb_set(r.data, '{stock}', to_jsonb((r.data->>'stock')::numeric + sign * q), true)
     where r.entity = 'products' and r.id = line->>'id' and jsonb_typeof(r.data->'stock') = 'number';
    if found then
      mid := 'MOV-' || replace(gen_random_uuid()::text, '-', '');
      insert into public.records (entity, id, data) values ('stock', mid,
        jsonb_build_object('id', mid, 'productId', line->>'id', 'qty', sign * q,
          'type', case when sign < 0 then 'venta' else 'reverso' end,
          'note', case when sign < 0 then 'Entrega ' else 'Se revirtió la entrega ' end || coalesce(new.data->>'code', ''),
          'orderId', new.id, 'at', now(), 'by', coalesce(who, 'Sistema')));
    end if;
  end loop;
  return new;
end;
$fn$;
-- @@
drop trigger if exists records_stock_on_delivery on public.records;
-- @@
create trigger records_stock_on_delivery after update on public.records for each row when (new.entity = 'orders') execute function public.apply_stock_on_delivery();

-- @@ 5. Seguimiento público: solo con código + celular, y solo datos básicos.
create or replace function public.track_order(p_code text, p_phone text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare r jsonb; digits text;
begin
  digits := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
  if length(digits) < 10 or length(btrim(coalesce(p_code, ''))) < 6 then return null; end if;
  select x.data into r from public.records x
   where x.entity = 'orders' and upper(x.data->>'code') = upper(btrim(p_code))
     and right(regexp_replace(coalesce(x.data->>'phone', ''), '\D', '', 'g'), 10) = digits
   limit 1;
  if r is null then return null; end if;
  return jsonb_build_object(
    'code', r->>'code', 'status', r->>'status', 'items', r->>'items', 'total', r->'total',
    'createdAt', r->>'createdAt', 'driver', nullif(split_part(coalesce(r->>'driverName', ''), ' ', 1), ''),
    'events', coalesce((select jsonb_agg(jsonb_build_object('type', e->>'type', 'at', e->>'at') order by e->>'at')
      from jsonb_array_elements(case when jsonb_typeof(r->'events') = 'array' then r->'events' else '[]'::jsonb end) e
      where e->>'type' in ('creado', 'asignado', 'en_ruta', 'entregado', 'no_entregado', 'cancelado', 'pendiente')), '[]'::jsonb));
end;
$fn$;
-- @@
revoke all on function public.track_order(text, text) from public;
-- @@
grant execute on function public.track_order(text, text) to anon, authenticated;

-- ============================================================================
-- FIN
-- ============================================================================
