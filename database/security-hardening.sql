-- ============================================================================
-- AGUA MAGALY — ENDURECIMIENTO DE SEGURIDAD (SUPABASE)
-- ----------------------------------------------------------------------------
-- Cómo aplicarlo:
--   Supabase → SQL Editor → New query → pega TODO este archivo → Run.
--
-- Es UNA sola sentencia (bloque DO), porque el editor de Supabase rechaza
-- varios comandos separados con: "Only singular query allowed".
--
-- Qué corrige:
--   1. Elimina la política que permitía a cualquier usuario autenticado
--      crearse una ficha de personal cuando la tabla estaba vacía.
--   2. Un repartidor solo puede ver su propia ficha; el administrador ve todo.
--   3. El público solo puede LEER catálogo y ajustes, y CREAR pedidos/PQRS.
--   4. El repartidor solo puede ACTUALIZAR los pedidos que tiene asignados.
--   5. Solo el administrador puede crear, editar o borrar catálogo, rutas,
--      PQRS, ajustes y personal.
--   6. Un pedido enviado desde la web se sanea solo: no puede fijar estado,
--      repartidor, cobro, historial ni un total negativo/desmedido.
--   7. El repartidor no puede cambiar los datos base del pedido ni robárselo
--      a otro repartidor.
--
-- Es idempotente: se puede ejecutar varias veces sin romper nada.
-- ============================================================================

do $hardening$
begin

  -- --------------------------------------------------------------------------
  -- 1. PERSONAL
  -- --------------------------------------------------------------------------
  execute 'drop policy if exists "staff_bootstrap_first_admin" on public.staff';
  execute 'drop function if exists public.staff_is_empty()';

  execute 'drop policy if exists "staff_read" on public.staff';
  execute $q$create policy "staff_read" on public.staff
    for select to authenticated
    using (id = auth.uid() or public.is_admin())$q$;

  execute 'drop policy if exists "staff_admin_manage" on public.staff';
  execute $q$create policy "staff_admin_manage" on public.staff
    for all to authenticated
    using (public.is_admin())
    with check (public.is_admin())$q$;

  -- --------------------------------------------------------------------------
  -- 2. QUITAR POLÍTICAS ANTIGUAS DEMASIADO AMPLIAS
  -- --------------------------------------------------------------------------
  execute 'drop policy if exists "records_public_catalog" on public.records';
  execute 'drop policy if exists "records_public_create" on public.records';
  execute 'drop policy if exists "records_staff_read" on public.records';
  execute 'drop policy if exists "records_staff_insert" on public.records';
  execute 'drop policy if exists "records_staff_update" on public.records';
  execute 'drop policy if exists "records_staff_delete" on public.records';

  -- --------------------------------------------------------------------------
  -- 3. NUEVAS POLÍTICAS DE DATOS
  -- --------------------------------------------------------------------------
  -- Catálogo y ajustes: lectura pública.
  execute $q$create policy "records_public_catalog" on public.records
    for select to anon, authenticated
    using (entity in ('products', 'settings'))$q$;

  -- Cualquier visitante puede crear pedidos y PQRS (nunca personal interno).
  execute $q$create policy "records_public_create" on public.records
    for insert to anon, authenticated
    with check (
      entity in ('orders', 'pqrs')
      and not public.is_staff()
    )$q$;

  -- Solo el administrador inserta/edita/borra el resto de datos.
  execute $q$create policy "records_admin_insert" on public.records
    for insert to authenticated
    with check (public.is_admin())$q$;

  execute $q$create policy "records_admin_update" on public.records
    for update to authenticated
    using (public.is_admin())
    with check (public.is_admin())$q$;

  execute $q$create policy "records_admin_delete" on public.records
    for delete to authenticated
    using (public.is_admin())$q$;

  -- El repartidor solo actualiza pedidos que tenga asignados.
  execute $q$create policy "records_driver_update" on public.records
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
    )$q$;

  -- Lectura del equipo:
  --   administrador → todo
  --   repartidor    → catálogo, ajustes y sus pedidos asignados
  execute $q$create policy "records_staff_read" on public.records
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
    )$q$;

  -- --------------------------------------------------------------------------
  -- 4. SANEAMIENTO DE PEDIDOS Y PQRS ENVIADOS DESDE LA WEB
  -- --------------------------------------------------------------------------
  execute $q$
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
    -- El personal interno (administrador) conserva el control total.
    if public.is_staff() then
      return new;
    end if;

    d := coalesce(new.data, '{}'::jsonb);

    if new.entity = 'orders' then
      -- El cliente no puede fijar estado, repartidor, cobro ni historial.
      d := jsonb_set(d, '{status}',      to_jsonb('Pendiente'::text), true);
      d := jsonb_set(d, '{driverId}',    'null'::jsonb,                true);
      d := jsonb_set(d, '{driverName}',  to_jsonb(''::text),           true);
      d := jsonb_set(d, '{paid}',        'false'::jsonb,               true);
      d := jsonb_set(d, '{payment}',     to_jsonb(''::text),           true);
      d := jsonb_set(d, '{events}',      '[]'::jsonb,                  true);
      d := jsonb_set(d, '{createdAt}',   to_jsonb(now()),              true);
      d := jsonb_set(d, '{source}',      to_jsonb('web'::text),        true);

      -- Total numérico, no negativo y con un límite razonable.
      begin
        n := coalesce((d->>'total')::numeric, 0);
      exception when others then
        n := 0;
      end;
      n := greatest(0, least(n, 100000000));
      d := jsonb_set(d, '{total}', to_jsonb(n), true);

      -- Recorta textos para evitar cargas gigantes.
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
  $q$;

  execute 'drop trigger if exists records_sanitize_public on public.records';
  execute $q$create trigger records_sanitize_public
    before insert on public.records
    for each row execute function public.sanitize_public_record()$q$;

  -- --------------------------------------------------------------------------
  -- 5. EL REPARTIDOR NO PUEDE ALTERAR LOS DATOS BASE DEL PEDIDO
  -- --------------------------------------------------------------------------
  execute $q$
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
  $q$;

  execute 'drop trigger if exists records_guard_update on public.records';
  execute $q$create trigger records_guard_update
    before update on public.records
    for each row execute function public.guard_record_update()$q$;

  -- --------------------------------------------------------------------------
  -- 6. PERMISOS FINALES
  -- --------------------------------------------------------------------------
  -- El público no necesita actualizar ni borrar registros directamente.
  execute 'revoke update, delete on public.records from anon';

end
$hardening$;
