-- AGUA MAGALY - almacen de imagenes de productos.
-- Ejecutar UNA sola vez en Supabase > SQL Editor > New query > Run.
-- No usa comillas dollar: son sentencias normales, una por linea.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('products', 'products', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif','image/avif'])
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','image/avif'];

drop policy if exists "products_public_read" on storage.objects;
create policy "products_public_read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'products');

drop policy if exists "products_admin_insert" on storage.objects;
create policy "products_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'products' and public.is_admin());

drop policy if exists "products_admin_update" on storage.objects;
create policy "products_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'products' and public.is_admin())
  with check (bucket_id = 'products' and public.is_admin());

drop policy if exists "products_admin_delete" on storage.objects;
create policy "products_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'products' and public.is_admin());
