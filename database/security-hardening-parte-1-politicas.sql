-- AGUA MAGALY - endurecimiento, PARTE 1 de 3: politicas de acceso (RLS).
-- Ejecutar DESPUES de la parte anterior (una sola sentencia).
do $$
begin
execute 'drop policy if exists "staff_bootstrap_first_admin" on public.staff';
execute 'drop function if exists public.staff_is_empty()';
execute 'drop policy if exists "staff_read" on public.staff';
execute 'create policy "staff_read" on public.staff for select to authenticated using (id = auth.uid() or public.is_admin())';
execute 'drop policy if exists "staff_admin_manage" on public.staff';
execute 'create policy "staff_admin_manage" on public.staff for all to authenticated using (public.is_admin()) with check (public.is_admin())';
execute 'drop policy if exists "records_public_catalog" on public.records';
execute 'drop policy if exists "records_public_create" on public.records';
execute 'drop policy if exists "records_staff_read" on public.records';
execute 'drop policy if exists "records_staff_insert" on public.records';
execute 'drop policy if exists "records_staff_update" on public.records';
execute 'drop policy if exists "records_staff_delete" on public.records';
execute 'create policy "records_public_catalog" on public.records for select to anon, authenticated using (entity in (''products'', ''settings''))';
execute 'create policy "records_public_create" on public.records for insert to anon, authenticated with check (entity in (''orders'', ''pqrs'') and not public.is_staff())';
execute 'create policy "records_admin_insert" on public.records for insert to authenticated with check (public.is_admin())';
execute 'create policy "records_admin_update" on public.records for update to authenticated using (public.is_admin()) with check (public.is_admin())';
execute 'create policy "records_admin_delete" on public.records for delete to authenticated using (public.is_admin())';
execute 'create policy "records_driver_update" on public.records for update to authenticated using (public.is_staff() and entity = ''orders'' and data->>''driverId'' = auth.uid()::text) with check (public.is_staff() and entity = ''orders'' and data->>''driverId'' = auth.uid()::text)';
execute 'create policy "records_staff_read" on public.records for select to authenticated using (public.is_admin() or (public.is_staff() and (entity in (''products'', ''settings'') or (entity = ''orders'' and data->>''driverId'' = auth.uid()::text))))';
end
$$;
