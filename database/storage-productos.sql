-- AGUA MAGALY - almacen de imagenes de productos.
-- Ejecutar UNA sola vez en Supabase > SQL Editor > New query > Run.
-- Es UNA sola sentencia (do $$ ... $$) para herramientas que solo
-- permiten una consulta por ejecucion. No usa comillas dollar anidadas.

do $storage$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('products', 'products', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif','image/avif'])
  on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif'];

  execute 'drop policy if exists "products_public_read" on storage.objects';
  execute 'create policy "products_public_read" on storage.objects for select to anon, authenticated using (bucket_id = ''products'')';

  execute 'drop policy if exists "products_admin_insert" on storage.objects';
  execute 'create policy "products_admin_insert" on storage.objects for insert to authenticated with check (bucket_id = ''products'' and public.is_admin())';

  execute 'drop policy if exists "products_admin_update" on storage.objects';
  execute 'create policy "products_admin_update" on storage.objects for update to authenticated using (bucket_id = ''products'' and public.is_admin()) with check (bucket_id = ''products'' and public.is_admin())';

  execute 'drop policy if exists "products_admin_delete" on storage.objects';
  execute 'create policy "products_admin_delete" on storage.objects for delete to authenticated using (bucket_id = ''products'' and public.is_admin())';
end
$storage$;
