# Sistema de Operación y Estructura Territorial

Maqueta funcional para Oaxaca de Juárez. Se construye para vender el proyecto, no para operar
todavía. Todo se escribe en español, incluida la interfaz, los nombres de variables de dominio y los
mensajes al usuario.

## Reglas que no se negocian

**Este proyecto ya recibe datos personales reales.** Dejó de ser maqueta el 8 de octubre de 2026,
cuando se aprobó y se montó la base nueva con login y RLS. Los teléfonos sembrados que queden del
rango 951 100 0000 a 951 100 9999 son de prueba y se pueden distinguir por ahí, pero la base ya no
es un patio de juegos: cualquier renglón nuevo puede ser una persona real. Lo que se borra, se
borró de verdad.

Hay dos pendientes bloqueantes anotados en `PENDIENTES.md` que deben resolverse antes de capturar
en campo con gente real: el aviso de privacidad sigue marcado como provisional pendiente de
revisión legal, y no está definida la política de retención ni quién responde por los datos.

**Hay login, y por lo tanto hay Row Level Security.** Se entra con correo y contraseña contra
Supabase Auth. Ya no existe el conmutador de rol: el rol sale de la sesión, no de un selector.

El filtrado **no** vive en la capa de aplicación. Vive en políticas de base de datos, en
`supabase/seguridad.sql`, que es el único punto de verdad de permisos. No dupliques esa lógica en
componentes ni en consultas: si una pantalla necesita menos datos, pídele menos a la base, no
filtres después. Si una política bloquea algo que debería pasar, se arregla la política.

`usuarios.id` **es** el id de `auth.users`, así que `auth.uid()` sirve directo en las políticas.
Las bajas se hacen con `activo = false`, nunca borrando.

Dos trampas que ya costaron caro y no hay que repetir:

- **Toda vista lleva `with (security_invoker = true)`.** Sin eso la vista corre con los permisos de
  quien la creó, se salta RLS, y un brigadista lee toda la base por ahí aunque las tablas estén
  bien protegidas.
- **La envoltura `(select ...)` alrededor de una llamada en una política solo vale si la expresión
  no referencia columnas.** Con una columna dentro se vuelve un subplan correlacionado y la
  política falla en los `INSERT ... SELECT` que arma PostgREST.

**La sección electoral es la única unidad territorial exacta.** La colonia es referencia y
autocompletado, nunca fuente de verdad. Si hay conflicto entre colonia y sección, gana la sección.

**Nada de lo que el sistema puede calcular se le pide al usuario.** Ni conteos, ni fecha de captura,
ni quién capturó, ni sección cuando hay coordenada.

**Antes de escribir código de una fase, lee los tres documentos de `spec/`.** Si algo del spec choca
con lo que ibas a hacer, gana el spec. Si el spec no cubre un caso, anótalo en `PENDIENTES.md` en
lugar de inventar y seguir.

Con una excepción ya registrada: `spec/alcance.md` describe un conmutador de rol y dice
"Row Level Security. Fuera, por la decisión de no tener login". Eso quedó superado el 8 de octubre
de 2026. En todo lo demás el spec sigue mandando.

## Pila

Next.js con App Router y TypeScript, Tailwind, shadcn/ui, Supabase (Postgres con PostGIS),
MapLibre GL con mapa base de CARTO, Recharts, TanStack Table, react-hook-form con zod, date-fns.
Despliegue en Vercel.

No agregues librerías fuera de esta lista sin anotarlo primero en `PENDIENTES.md`. En particular:
nada de three.js, nada de motores de sincronización, nada de librerías de calendario. La vista de
calendario se arma con una rejilla propia.

## Estructura

```
app/                 rutas del App Router
components/          componentes de interfaz
components/mapa/     todo lo de MapLibre, aislado
lib/territorio.ts    punto en polígono, normalización de teléfono, resolución de dirección
lib/supabase.ts      cliente
data/                secciones.geojson, colonias.geojson, demarcaciones.json
supabase/schema.sql    estructura, consolidada
supabase/seguridad.sql permisos, RLS y políticas. Único punto de verdad de permisos
supabase/migraciones-maqueta-v1/  historia de la maqueta. No aplicar, ver LEER.md
scripts/sembrar.ts   sembrado
spec/                los tres documentos de especificación
PENDIENTES.md        decisiones que no estaban en el spec
```

## Cartografía

Los archivos de `data/` ya vienen limpios, en EPSG:4326, con la demarcación pegada a cada sección.
No los regeneres, no los reproyectes, no toques shapefiles.

Seis secciones vienen marcadas con `sustituta: true`. Son secciones que el reseccionamiento del INE
partió en otras nuevas que todavía no tienen geometría publicada en esta versión. Se pintan normal,
con el color de su demarcación. En su ficha aparece una nota discreta que dice
"Geometría de referencia, pendiente de actualizar con el marco vigente". No las escondas ni las
trates distinto en los conteos.

## Cómo trabajar

Una fase a la vez, en el orden de `PROMPT.md`. Al terminar cada fase corre `npm run build` y arregla
lo que truene antes de seguir. No empieces la siguiente sin que la anterior compile.

No escribas pruebas automatizadas en este proyecto, es una maqueta con fecha de presentación.
Sí verifica manualmente que cada pantalla cargue en 390 píxeles de ancho y en 1280.

## Reglas del andamiaje de Next.js

@AGENTS.md
