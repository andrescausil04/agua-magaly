# Seguridad de Agua Magaly — guía práctica

Esta guía explica, en orden, cómo dejar la web con el nivel de seguridad
profesional que pediste. Lo que ya quedó hecho en el código y lo que hay que
activar en Supabase.

---

## 1. Qué se endureció en la web (ya está en el código)

### 1.1 La base de datos ya no confía en el navegador

Antes, cualquier persona con una cuenta de reparto podía:

- Leer toda la lista del personal.
- Crear, editar o borrar productos, rutas, pedidos y quejas.
- Cambiar el estado, el repartidor o el cobro de un pedido ajeno.
- Enviar pedidos con un total inventado.

El archivo **`database/security-hardening.sql`** corrige eso:

- El repartidor **solo ve y actualiza sus pedidos asignados**.
- El administrador sigue teniendo control total.
- El público **solo puede leer el catálogo** y **crear** pedidos/PQRS.
- Un pedido enviado desde la web se **sanea solo**: el servidor fuerza estado
  “Pendiente”, sin repartidor, sin cobro y con un total válido.
- Se eliminó la política que permitía a cualquier usuario autenticado crearse
  una ficha de personal cuando la tabla estaba vacía.

### 1.2 Se cerró la puerta trasera del “modo local”

Antes, si Supabase no cargaba, la web podía caer en modo local y aceptar el
usuario `admin` con clave `1234`. Ahora:

- Si Supabase está configurado y no responde, **no se permite entrar** con
  credenciales locales.
- Las cuentas de prueba **nunca** se crean cuando hay nube configurada.
- La pantalla de login ya no muestra claves de prueba cuando hay nube.

### 1.3 Se eliminaron los riesgos de XSS

Los nombres, descripciones, badges e imágenes de los productos ahora se
**escapan** antes de mostrarse. Los colores del personal se validan como
hexadecimales. Así, aunque alguien lograra guardar código malicioso en un
producto, el navegador lo muestra como texto y no lo ejecuta.

### 1.4 La librería de Supabase ya no viene de un CDN

Antes se cargaba desde `cdn.jsdelivr.net` con la versión flotante `@2`. Ahora
está **alojada en el propio sitio** con la versión fija **2.119.0**
(`js/vendor/supabase.min.js`). Esto elimina el riesgo de que un cambio externo
entre sin avisar.

### 1.5 Cabeceras de seguridad

Todas las páginas incluyen:

- **Content-Security-Policy (CSP):** solo se ejecuta JavaScript del propio
  sitio; solo se conecta a Supabase; las fuentes vienen de Google Fonts.
- **Referrer-Policy:** no se filtra la URL completa a otros sitios.

> GitHub Pages no permite cabeceras HTTP personalizadas. Por eso la CSP va en
> `<meta>`. Si algún día pones Cloudflare delante del dominio, se pueden añadir
> `Strict-Transport-Security`, `X-Frame-Options` y `X-Content-Type-Options`
> desde ahí.

### 1.6 Contraseñas más fuertes

Ahora se exige un mínimo de **8 caracteres con letras y números** al crear o
cambiar contraseñas. (Supabase permite subir aún más el mínimo; ver punto 3.)

### 1.7 Cierre por inactividad y límite de intentos

- **Cierre por inactividad:** si el panel de administración o de reparto pasa
  **20 minutos sin actividad** (mouse, teclado, toque o desplazamiento), la
  sesión se cierra y vuelve al login con el aviso “Tu sesión se cerró por
  inactividad”.
- **Límite de intentos:** tras **5 intentos fallidos** con el mismo usuario, el
  navegador bloquea ese usuario **15 minutos**. Es una barrera adicional; el
  servidor de Supabase también aplica sus propios límites. El bloqueo se guarda
  en el navegador, así que no afecta a otros equipos.

### 1.8 Aviso de privacidad y consentimiento

- La tienda incluye una casilla obligatoria de **autorización de datos
  personales** antes de enviar el pedido. Sin ella no se genera el mensaje de
  WhatsApp.
- El pedido guarda `dataConsent` y `dataConsentAt` como constancia.
- La página **`privacidad.html`** explica responsable, datos, finalidad,
  derechos (Ley 1581 de 2012), seguridad, conservación y ubicación del
  repartidor. Está enlazada desde el pie de página y desde la casilla.

### 1.9 Consentimiento de ubicación del repartidor

- La ubicación es **opcional**. El repartidor la autoriza desde **Perfil →
  Permiso de ubicación** o la primera vez que inicia una entrega.
- Si dice “Ahora no”, puede entregar igual; el pedido se registra **sin
  coordenadas**.
- Puede retirar el permiso cuando quiera. El navegador solo la comparte al
  iniciar o confirmar una entrega.

---

## 2. Aplicar el SQL de seguridad (obligatorio)

1. Entra a Supabase → **SQL Editor** → **New query**.
2. Abre `database/security-hardening.sql`, copia **todo** y pégalo.
3. Pulsa **Run**. Debe terminar sin errores.

> El archivo es **una sola sentencia** y mide **33 líneas** a propósito: algunas
> herramientas (asistentes con MCP, validadores SQL) solo leen las primeras 100
> líneas del texto pegado y devuelven “Unterminated dollar-quoted string at
> Line: 101”. Con 33 líneas ese corte ya no puede ocurrir.
>
> **Plan B** si tu herramienta sigue fallando: ejecuta una por una las tres
> partes, en orden:
> 1. `database/security-hardening-parte-1-politicas.sql`
> 2. `database/security-hardening-parte-2-saneamiento.sql`
> 3. `database/security-hardening-parte-3-guardia.sql`
>
> Cada parte es también una sola sentencia y mide menos de 25 líneas.
4. Prueba de inmediato:
   - Entra como **administrador**: debe ver pedidos, productos y personal.
   - Entra como **repartidor**: debe ver solo sus pedidos y su perfil.
   - Haz un pedido de prueba desde la tienda: debe aparecer “Pendiente” y sin
     repartidor asignado.

Si algo falla, no ejecutes `schema.sql` encima: primero revisa el mensaje de
error. El script es idempotente, así que puedes volver a ejecutarlo.

---

## 3. Configuración recomendada en el panel de Supabase

### 3.1 Registro público: desactivarlo

Hoy el registro está abierto (`disable_signup: false`). Como el administrador
crea las cuentas desde el panel, lo correcto es cerrarlo.

**Importante:** si lo cierras sin desplegar antes la Edge Function, el panel
del administrador ya no podrá crear repartidores.

Pasos:

1. Despliega la función `create-staff` (punto 4).
2. Ve a **Authentication → Providers → Email**.
3. Desactiva **“Allow new users to sign up”**.
4. Guarda.

### 3.2 Política de contraseñas

En **Authentication → Policies** (o **Settings → Auth** según la versión):

- Longitud mínima: **8** (o 12 si el equipo lo acepta).
- Exigir **letras y números**.
- Activar **“Prevent use of leaked passwords”** si está disponible.
- Caducidad de sesión: un valor razonable (7–30 días).

### 3.3 MFA para el administrador

En **Authentication → Multi-Factor Authentication**, activa **TOTP**. Luego,
desde el perfil del administrador, vincula una app como Google Authenticator o
Authy. Así, aunque alguien robe la contraseña, no puede entrar sin el código.

### 3.4 Límites de intentos

En **Authentication → Rate Limits**, deja los valores por defecto o baja el
límite de intentos por correo/IP. Esto frena ataques de fuerza bruta desde el
servidor. La web además bloquea 15 minutos el usuario tras 5 fallos seguidos
(punto 1.7).

### 3.5 Copias de seguridad

- Plan gratuito: descarga periódicamente un respaldo desde **Database →
  Backups**.
- Plan de pago: activa **Point-in-Time Recovery (PITR)**.
- Guarda una copia fuera de Supabase (por ejemplo, en un disco o nube privada).

### 3.6 Claves y accesos

- La clave **publishable/anon** puede estar en el navegador: es normal.
- La clave **service_role** **nunca** debe aparecer en el sitio, en GitHub ni en
  `js/config.js`. Solo vive en la Edge Function.
- Revisa **Project Settings → API** y rota las claves si alguna vez se filtró
  una.
- Limita quién tiene acceso al panel de Supabase (idealmente solo el dueño).

### 3.7 Registro de actividad

Supabase guarda logs de Auth y de la API. Revísalos de vez en cuando en
**Logs → Auth** y **Logs → API** para detectar intentos raros.

---

## 4. Desplegar la Edge Function `create-staff` (recomendado)

La función está en `supabase/functions/create-staff/index.ts`. Solo un
administrador autenticado puede usarla, y crea la cuenta con la clave privada
**en el servidor**.

Requisitos: tener instalada la CLI de Supabase y acceso al proyecto.

```bash
npm i -g supabase
supabase login
supabase link --project-ref glppntnfoxognhqueuoc
supabase functions deploy create-staff
```

Cuando esté desplegada:

1. El panel del administrador la usará automáticamente al crear un repartidor.
2. Si aún no está desplegada, el panel sigue usando el método anterior
   (registro con clave pública). Por eso el orden correcto es: **primero
   desplegar, después cerrar el registro público**.

---

## 5. Qué hacer si algo se rompe

| Síntoma | Causa probable | Solución |
|---|---|---|
| El repartidor no ve sus pedidos | El pedido no tiene `driverId` o el SQL no se aplicó | Asígnale el pedido desde el panel y vuelve a ejecutar el SQL |
| El administrador no puede crear repartidores | Se cerró el registro y la Edge Function no está desplegada | Despliega la función o vuelve a abrir el registro temporalmente |
| La web no carga el login | Sin internet o Supabase caído | Es intencional: no se permite el modo local con credenciales de prueba |
| Un producto muestra texto raro | El campo traía HTML | Ya se escapa; si persiste, revisa el dato en Supabase |
| La consola muestra un error de CSP | Se añadió un script o fuente externa | Añade el dominio a la CSP de los HTML o aloja el recurso en el sitio |
| Al ejecutar el SQL sale “Unterminated dollar-quoted string at Line: 101, Column: 1” | La herramienta solo lee las primeras 100 líneas del texto pegado y corta el bloque `do $$ … $$` a la mitad | Usa `database/security-hardening.sql` (33 líneas). Si aún falla, ejecuta en orden las partes 1, 2 y 3 |
| Al ejecutar el SQL sale “Unterminated dollar-quoted” sin número de línea | Se copió una versión antigua (con comillas dollar anidadas) | Vuelve a copiar `database/security-hardening.sql` actualizado y ejecútalo completo |
| Al ejecutar `storage-productos.sql` sale “Only singular query allowed” | La herramienta solo acepta una sentencia por ejecución | Usa la versión actual del archivo: es **una sola sentencia** `do $$ … $$` de 27 líneas |

---

## 6. Lista de verificación final

- [ ] Ejecuté `database/security-hardening.sql` sin errores.
- [ ] Probé el panel de administrador.
- [ ] Probé el panel de repartidor con un pedido asignado.
- [ ] Hice un pedido de prueba desde la tienda.
- [ ] Desplegué la Edge Function `create-staff`.
- [ ] Cerré el registro público en Supabase.
- [ ] Activé la política de contraseñas y MFA del administrador.
- [ ] Revisé que `js/config.js` no tenga la clave `service_role`.
- [ ] Programé una copia de seguridad.
- [ ] Probé el cierre por inactividad (20 minutos) y el bloqueo tras 5 intentos.
- [ ] Revisé que la casilla de autorización de datos bloquee el pedido sin marcar.
- [ ] Probé el permiso de ubicación del repartidor (permitir, rechazar y retirar).
- [ ] Ejecuté `database/storage-productos.sql` para habilitar las fotos de producto.
