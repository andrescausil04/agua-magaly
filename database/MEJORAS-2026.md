# Mejoras de noviembre 2026: qué cambió y cómo activarlo

> La verificación en dos pasos por correo (`staff-2fa` + `twofa.sql`) se
> mantiene tal cual. Estas mejoras no la tocan.

## Qué trae esta versión

| Mejora | Dónde se nota |
|---|---|
| **El total del pedido lo calcula el servidor** con los precios del catálogo | Ya no se puede enviar 10 pacas con total de $1 |
| **Límite contra spam**: máximo 3 pedidos (o 3 PQRS) por celular cada 10 minutos y 30 por minuto en total | Tienda y buzón de PQRS |
| **El repartidor no puede cambiar productos, total, cliente ni dirección** | Base de datos |
| **La función `create-staff` solo acepta llamadas de tu sitio** | Edge Function |
| **Código de pedido** `AM-XXXXXX` en el mensaje de WhatsApp | Tienda |
| **Seguir mi pedido** con código + celular | `seguimiento.html` |
| **Repetir mi último pedido** | Tienda (se guarda solo en el celular del cliente) |
| **Reportes**: ventas por día, producto, ruta, repartidor, horas pico y por cobrar | Panel → *Reportes* |
| **Inventario**: stock, producción, conteos y alerta de stock bajo; baja solo al entregar | Panel → *Inventario* |
| **Asignar por ruta**: al elegir la ruta se propone su repartidor | Detalle del pedido |
| **Aviso de pedido nuevo** con sonido y notificación | Panel → botón 🔔 |
| **App instalable del repartidor** que abre con mala señal y guarda los cambios hechos sin conexión | `repartidor.html` |

## Pasos para activarlo (en este orden)

1. **Publica la web** (push a `main`; GitHub Pages la actualiza en 1–2 minutos).
2. **Ejecuta el SQL**: Supabase → SQL Editor → New query → pega TODO
   `database/mejoras-2026.sql` → **Run**. Si tu herramienta solo acepta una
   sentencia o menos de 100 líneas, usa `database/mejoras-2026-compacto.sql`.
   Se puede ejecutar varias veces.
3. **Vuelve a desplegar** la función: `supabase functions deploy create-staff`.
   Si el sitio no está en `https://andrescausil04.github.io`:
   `supabase secrets set ALLOWED_ORIGINS="https://tu-dominio.com"`.
4. **Activa el inventario**: Panel → Inventario → *Activar control* en cada
   producto → **＋ Producción** con las pacas que hay hoy.

> ⚠️ Si vuelves a ejecutar el viejo `security-hardening.sql`, se pierden el
> total calculado y el anti-spam. Si pasa, ejecuta otra vez `mejoras-2026.sql`.

## Prueba rápida

- [ ] Un pedido desde la tienda muestra “Pedido AM-… registrado” y en el panel aparece con el total correcto.
- [ ] `seguimiento.html` muestra el pedido con el código y el celular, y no lo muestra con otro celular.
- [ ] Al marcar un pedido como entregado, baja el stock en *Inventario*.
- [ ] Con 🔔 activo, suena un aviso cuando llega un pedido.
- [ ] En el celular del repartidor aparece “Instalar la app” en *Perfil*.

## Si algo falla

| Síntoma | Solución |
|---|---|
| “El pedido no tiene productos válidos” | El producto está inactivo o se borró del catálogo. |
| Crear repartidores dice “Origen no permitido” | Configura `ALLOWED_ORIGINS` (paso 3). |
| La web sigue igual después del push | Espera 2 minutos y recarga con Ctrl + F5. |
