-- ============================================================================
-- AGUA MAGALY — DATOS INICIALES (CATÁLOGO Y AJUSTES)
-- ----------------------------------------------------------------------------
-- Ejecuta este archivo UNA vez, después de database/schema.sql.
-- Deja la tienda con los dos productos reales y los datos del negocio.
--
-- Usa "on conflict do nothing": si ya existen, NO los sobrescribe.
-- ============================================================================

insert into public.records (entity, id, data) values

('products', '250', '{
  "id": "250",
  "name": "Paca de agua 250 ml",
  "badge": "Venta por Paca (50 uds)",
  "desc": "Paca completa de 50 bolsitas individuales de 250 ml. Presentación ideal para consumo diario personal, tiendas de barrio y colegios.",
  "price": 4000,
  "unit": "/ paca de 250ml",
  "image": "assets/bolsa-250ml.jpg",
  "active": true
}'::jsonb),

('products', '3L', '{
  "id": "3L",
  "name": "Paca de agua 3 Litros",
  "badge": "Venta por Paca",
  "desc": "Paca resistente de agua tratada en presentación de 3 Litros con agarraderas ergonómicas. Diseñada para abastecimiento de hogares, fincas y restaurantes.",
  "price": 4000,
  "unit": "/ paca de 3L",
  "image": "assets/bolsa-3l.jpg",
  "active": true
}'::jsonb),

('settings', 'app', '{
  "businessName": "Agua Magaly",
  "phone": "573054136677",
  "deliveryFee": 0,
  "currency": "COP"
}'::jsonb)

on conflict (entity, id) do nothing;

-- Revisión rápida: deben aparecer 3 filas.
select entity, id from public.records order by entity, id;
