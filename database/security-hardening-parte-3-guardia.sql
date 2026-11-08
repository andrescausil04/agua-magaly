-- AGUA MAGALY - endurecimiento, PARTE 3 de 3: proteccion de los pedidos del repartidor.
-- Ejecutar DESPUES de la parte anterior (una sola sentencia).
do $$
begin
execute 'create or replace function public.guard_record_update() returns trigger language plpgsql security definer set search_path = public as $fn$ begin if public.is_admin() then return new; end if; if new.entity = ''orders'' then if coalesce(old.data->>''driverId'','''') <> coalesce(new.data->>''driverId'','''') then raise exception ''No puedes reasignar un pedido.''; end if; if coalesce(old.data->>''client'','''') <> coalesce(new.data->>''client'','''') or coalesce(old.data->>''phone'','''') <> coalesce(new.data->>''phone'','''') or coalesce(old.data->>''address'','''') <> coalesce(new.data->>''address'','''') or coalesce(old.data->>''total'','''') <> coalesce(new.data->>''total'','''') or coalesce(old.data->>''code'','''') <> coalesce(new.data->>''code'','''') then raise exception ''No puedes cambiar los datos base del pedido.''; end if; end if; return new; end; $fn$;';
execute 'drop trigger if exists records_guard_update on public.records';
execute 'create trigger records_guard_update before update on public.records for each row execute function public.guard_record_update()';
execute 'revoke update, delete on public.records from anon';
end
$$;
