# Sistema de Operación y Estructura Territorial

Maqueta funcional para Oaxaca de Juárez. Se construye para vender el proyecto, no para operar
todavía. Todo se escribe en español, incluida la interfaz, los nombres de variables de dominio y los
mensajes al usuario.

## Reglas que no se negocian

**Ningún dato personal real entra a este proyecto.** La base solo contiene datos sembrados. Los
teléfonos sembrados usan el rango 951 100 0000 a 951 100 9999, que no corresponde a personas reales.
Nunca generes teléfonos con otro patrón.

**No hay login.** Se entra con un conmutador de rol. Por lo mismo no hay Row Level Security y el
filtrado por territorio vive en la capa de aplicación, en un único módulo `lib/permisos.ts`. Todo
acceso a datos pasa por ahí. Cuando el proyecto se apruebe, ese módulo se reemplaza por políticas de
base de datos, así que no dupliques la lógica de permisos en componentes.

**La sección electoral es la única unidad territorial exacta.** La colonia es referencia y
autocompletado, nunca fuente de verdad. Si hay conflicto entre colonia y sección, gana la sección.

**Nada de lo que el sistema puede calcular se le pide al usuario.** Ni conteos, ni fecha de captura,
ni quién capturó, ni sección cuando hay coordenada.

**Antes de escribir código de una fase, lee los tres documentos de `spec/`.** Si algo del spec choca
con lo que ibas a hacer, gana el spec. Si el spec no cubre un caso, anótalo en `PENDIENTES.md` en
lugar de inventar y seguir.

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
lib/permisos.ts      único punto de verdad de permisos
lib/territorio.ts    punto en polígono, normalización de teléfono, resolución de dirección
lib/supabase.ts      cliente
data/                secciones.geojson, colonias.geojson, demarcaciones.json
supabase/schema.sql  esquema
supabase/seed.sql    o scripts/sembrar.ts
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
