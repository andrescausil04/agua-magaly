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

## 6. Crear la cuenta del administrador

En **Authentication** → **Users** → **Add user** → **Create new user**:

| Correo                 | Contraseña temporal | Auto Confirm |
| ---------------------- | ------------------- | ------------ |
| `admin@aguamagaly.app` | `Magaly2026`        | ✅ Sí        |

> El usuario para entrar a la web es `admin`.
> Después de entrar, cámbiale la contraseña en **Mi cuenta**.
>
> Los repartidores **no** hace falta crearlos aquí: se crean desde el panel,
> en la sección **Repartidores → Nuevo repartidor**.

Luego, en **SQL Editor** → **+ New query**, pega `database\seed-staff.sql` y
dale **Run**. Eso crea la ficha de la cuenta (rol de administrador).

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

1. Entra como `admin` / `Magaly2026`.
2. Desde otro celular, haz un pedido en la tienda.
3. En el panel debe aparecer el pedido **sin recargar** (tiempo real).

---

## Si algo falla

- **“Usuario o contraseña incorrectos”** → revisa que la cuenta exista en
  **Authentication → Users** y que el correo termine en `@aguamagaly.app`.
- **El pedido no aparece en el panel** → revisa que `js/config.js` tenga los
  dos datos correctos y que hayas ejecutado `schema.sql`.
- **“Esta cuenta no tiene acceso al panel”** → falta ejecutar
  `seed-staff.sql`.
