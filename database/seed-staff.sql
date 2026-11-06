-- ============================================================================
-- AGUA MAGALY — CUENTAS DEL EQUIPO
-- ----------------------------------------------------------------------------
-- Ejecuta este archivo DESPUÉS de:
--   1) database/schema.sql
--   2) haber creado las cuentas en Supabase → Authentication → Users
--
-- Crea la ficha de cada persona en public.staff a partir del correo:
--   admin@aguamagaly.app  → usuario "admin"  (administrador)
--   carlos@aguamagaly.app → usuario "carlos" (repartidor)
--   andres@aguamagaly.app → usuario "andres" (repartidor)
--
-- IMPORTANTE: este archivo es UNA SOLA sentencia (el editor SQL de Supabase
-- no acepta varias a la vez). Al ejecutarlo verás una fila por cada cuenta.
-- Se puede ejecutar varias veces sin duplicar nada.
-- ============================================================================

insert into public.staff (id, username, name, role, phone, color)
select
  u.id,
  lower(split_part(u.email, '@', 1)) as username,
  case lower(split_part(u.email, '@', 1))
    when 'admin'  then 'Administrador'
    when 'carlos' then 'Carlos Gómez'
    when 'andres' then 'Andrés Salgado'
    else initcap(split_part(u.email, '@', 1))
  end as name,
  case lower(split_part(u.email, '@', 1))
    when 'admin' then 'admin'
    else 'driver'
  end as role,
  '' as phone,
  case lower(split_part(u.email, '@', 1))
    when 'andres' then '#C68A3D'
    else '#1C7FA8'
  end as color
from auth.users u
where lower(u.email) like '%@aguamagaly.app'
on conflict (id) do update
  set username = excluded.username,
      name     = excluded.name,
      role     = excluded.role
returning username, name, role, active;
