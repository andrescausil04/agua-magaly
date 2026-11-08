# Librería de Supabase (copia local)

- Paquete: `@supabase/supabase-js`
- Versión fija: **2.119.0**
- Archivo: `supabase.min.js` (build UMD oficial)
- Origen: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/dist/umd/supabase.min.js`

## Por qué está aquí

Antes la web cargaba la librería desde un CDN externo con la versión flotante
`@2`. Eso significa que cualquier cambio publicado en el CDN entraba
automáticamente en el sitio (riesgo de cadena de suministro).

Ahora la librería se sirve desde el propio dominio y la versión está fija.
Para actualizarla:

1. Descargar el nuevo `supabase.min.js` de una versión concreta.
2. Reemplazar este archivo.
3. Probar login, catálogo, pedidos y tiempo real.
4. Actualizar la versión anotada arriba.
