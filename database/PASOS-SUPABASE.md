# Conectar Agua Magaly a la base de datos (Supabase)

Esta guía deja la web conectada a una base de datos **gratis**, para que los
pedidos que hagan los clientes desde **cualquier celular** lleguen solos al
panel del administrador.

Tiempo aproximado: **10 minutos**.

---

## 1. Crear la cuenta

1. Entra a **https://supabase.com**
2. Clic en **Start your project**.
3. Regístrate con **GitHub** o con tu correo. Es gratis.

## 2. Crear el proyecto

1. Clic en **New project**.
2. **Name:** `agua-magaly`
3. **Database Password:** clic en **Generate a password** y guárdala en un lugar
   seguro (no la necesitas para la web, pero no la pierdas).
4. **Region:** `South America (São Paulo)`
5. **Plan:** `Free`
6. Clic en **Create new project** y espera 1–2 minutos.

## 3. Permitir el acceso sin confirmar correo

La web no envía correos de confirmación, así que hay que desactivarlo:

1. Menú izquierdo → **Authentication** → **Sign In / Providers**
   (en algunas versiones: **Providers**).
2. Abre **Email**.
3. Apaga **Confirm email**.
4. Clic en **Save**.

## 4. Crear las tablas

1. Menú izquierdo → **SQL Editor** → **+ New query**.
2. Abre el archivo `database\schema.sql` con el Bloc de notas, copia **todo**
   el contenido y pégalo en Supabase.
3. Clic en **Run** (o `Ctrl + Enter`).
4. Debe aparecer **“Success. No rows returned”**.

## 5. Cargar el catálogo y los ajustes

1. **SQL Editor** → **+ New query**.
2. Copia y pega todo `database\seed-data.sql`.
3. **Run**. Debe crear los 2 productos y los ajustes del negocio.
4. Abajo, en **Results**, deben aparecer **3 filas**: `products/250`,
   `products/3L` y `settings/app`.

> ⚠️ El editor SQL de Supabase acepta **una sola sentencia por ejecución**.
> Si ves el error **“Only singular query allowed”**, es porque se pegó texto
> de más (o se ejecutó una selección parcial). Solución: borra todo con
> `Ctrl + A` + `Supr`, pega de nuevo el archivo completo y pulsa **Run** sin
> seleccionar nada.
>
> Estos archivos ya están preparados para funcionar así: cada uno es una sola
> sentencia y, al ejecutarlo, muestra las filas resultantes.

## 6. Crear la cuenta del administrador

En **Authentication** → **Users** → **Add user** → **Create new user**:

| Correo                 | Contraseña              | Auto Confirm |
| ---------------------- | ----------------------- | ------------ |
| `admin@aguamagaly.app` | (la que elijas, 12+ y única) | ✅ Sí   |

> El usuario para entrar a la web es `admin`.
>
> **Nunca escribas la contraseña real en este archivo ni en ningún otro del
> repositorio**: este proyecto se publica en GitHub Pages y cualquiera puede
> leerlo. Guárdala solo en tu gestor de contraseñas.
>
> Los repartidores **no** hace falta crearlos aquí: se crean desde el panel,
> en la sección **Repartidores → Nuevo repartidor**.

Luego, en **SQL Editor** → **+ New query**, pega `database\seed-staff.sql` y
dale **Run**. Eso crea la ficha de la cuenta (rol de administrador) y debe
mostrar una fila: `admin | Administrador | admin | true`.

> Si prefieres crear también a Carlos y Andrés aquí, usa
> `carlos@aguamagaly.app` y `andres@aguamagaly.app` con la misma contraseña
> temporal y ejecuta `seed-staff.sql` después.

## 7. Copiar los dos datos de conexión

1. Menú izquierdo → **Project Settings** (⚙️) → **API**.
2. Copia:
   - **Project URL** → algo como `https://abcd1234.supabase.co`
   - **anon public** → un texto largo que empieza con `eyJ...`

> ⚠️ **Nunca** uses la clave `service_role`. Esa es privada y da acceso total
> a la base de datos.

Pega esos dos datos en el archivo `js/config.js`:

```js
window.MAGALY_CONFIG = {
  supabaseUrl: 'https://TU-PROYECTO.supabase.co',
  supabaseAnonKey: 'eyJ...TU_CLAVE_ANON...',
  usernameDomain: 'aguamagaly.app'
};
```

## 8. Listo

Abre la web y prueba:

1. Entra como `admin` con la contraseña que definiste (no la escribas aquí).
2. Desde otro celular, haz un pedido en la tienda.
3. En el panel debe aparecer el pedido **sin recargar** (tiempo real).

## 9. Endurecer la seguridad (obligatorio)

Después de que todo funcione, ejecuta una vez
`database\security-hardening.sql` en el **SQL Editor**. Ese archivo:

- Hace que el repartidor solo vea y actualice **sus** pedidos.
- Impide que un pedido enviado desde la web traiga estado, repartidor o total
  inventados.
- Cierra la política que permitía crear fichas de personal sin ser admin.

El archivo es **una sola sentencia** y mide **33 líneas** a propósito: algunas
herramientas solo leen las primeras 100 líneas del texto pegado. Si la tuya
sigue fallando, ejecuta en orden
`security-hardening-parte-1-politicas.sql`, `-parte-2-saneamiento.sql` y
`-parte-3-guardia.sql`.

Los pasos completos (Edge Function, contraseñas, MFA, copias de seguridad)
están en **`database\SEGURIDAD.md`**.

---

## Si algo falla

- **“Usuario o contraseña incorrectos”** → revisa que la cuenta exista en
  **Authentication → Users** y que el correo termine en `@aguamagaly.app`.
- **El pedido no aparece en el panel** → revisa que `js/config.js` tenga los
  dos datos correctos y que hayas ejecutado `schema.sql`.
- **“Esta cuenta no tiene acceso al panel”** → falta ejecutar
  `seed-staff.sql`.
