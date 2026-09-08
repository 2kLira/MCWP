# Modelo de datos

## Decisión de fondo

Reunión, actividad de activismo y recorrido son **una sola tabla** `actividades` con una columna
`tipo`. Comparten campos, ciclo de vida, responsable, colaboradores y cierre. Separarlas convertiría
cada consulta del tablero, la agenda y los reportes en tres consultas unidas.

Persona y actividad **no se relacionan directo**. Se relacionan a través de `participaciones`. Eso es
lo que hace posible el historial de cada persona y lo que permite que alguien registrado en un
recorrido aparezca después en una reunión sin duplicarse.

Las problemáticas se cuelgan de la **participación**, no de la persona. Una persona puede mencionar
agua en un recorrido de marzo y seguridad en otro de junio, y ambas menciones deben conservar su
actividad, su fecha y su sección para poder consolidarse por territorio y por evento.

## Territorio

```sql
create table demarcaciones (
  id          serial primary key,
  nombre      text not null unique,
  slug        text not null unique,
  centro_lat  double precision,
  centro_lng  double precision
);

create table secciones (
  clave            text primary key,          -- '0524', cuatro dígitos con ceros
  numero           integer not null unique,
  demarcacion_id   integer not null references demarcaciones(id),
  distrito_local   integer,
  distrito_federal integer,
  area_km2         numeric(8,3),
  centro_lat       double precision,
  centro_lng       double precision,
  es_sustituta     boolean not null default false,
  nota             text
);

create table colonias (
  id            serial primary key,
  nombre        text not null,
  cp            text,
  demarcacion_principal_id integer references demarcaciones(id)
);

create table colonia_seccion (
  colonia_id     integer references colonias(id),
  seccion_clave  text references secciones(clave),
  traslape_pct   numeric(5,1) not null,
  primary key (colonia_id, seccion_clave)
);
```

La geometría va aparte, en PostGIS, para no arrastrar polígonos en cada consulta normal:

```sql
create extension if not exists postgis;

create table secciones_geom (
  clave text primary key references secciones(clave),
  geom  geometry(MultiPolygon, 4326) not null
);
create index secciones_geom_gix on secciones_geom using gist (geom);
```

Y una función que resuelve el punto en polígono:

```sql
create or replace function seccion_por_punto(lng double precision, lat double precision)
returns text language sql stable as $$
  select clave from secciones_geom
  where st_contains(geom, st_setsrid(st_point(lng, lat), 4326))
  limit 1;
$$;
```

Esa función es el respaldo del servidor. En el cliente la misma resolución se hace contra
`secciones.geojson` cacheado, para que funcione sin red y sin espera. Ambas rutas deben dar el mismo
resultado.

## Usuarios y responsables

```sql
create type rol_usuario as enum ('admin','resp_demarcacion','resp_seccion','colaborador');

create table usuarios (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  telefono       text,
  rol            rol_usuario not null,
  demarcacion_id integer references demarcaciones(id),
  seccion_clave  text references secciones(clave),
  activo         boolean not null default true,
  created_at     timestamptz not null default now()
);
```

Responsable de actividad no es un rol de usuario, es un puesto dentro de una actividad concreta. Vive
en `actividades.responsable_id`.

Las asignaciones territoriales van en su propia tabla, con vigencia, para que dar de baja a alguien
no borre historia y para que la consulta de secciones sin responsable sea trivial:

```sql
create table asignaciones_responsable (
  id             serial primary key,
  usuario_id     uuid not null references usuarios(id),
  ambito         text not null check (ambito in ('demarcacion','seccion')),
  demarcacion_id integer references demarcaciones(id),
  seccion_clave  text references secciones(clave),
  desde          date not null default current_date,
  hasta          date
);
create unique index una_asignacion_vigente_por_seccion
  on asignaciones_responsable (seccion_clave) where hasta is null and ambito = 'seccion';
```

## Personas

```sql
create table personas (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  telefono_norm      text unique,               -- 10 dígitos, sin nada más
  telefono_raw       text,
  calle              text,
  colonia_id         integer references colonias(id),
  seccion_clave      text references secciones(clave),
  demarcacion_id     integer references demarcaciones(id),
  lat                double precision,
  lng                double precision,
  origen_ubicacion   text check (origen_ubicacion in ('gps','mapa','manual')),
  quiere_participar  boolean not null default false,
  quiere_info        boolean not null default false,
  aviso_version      text,
  consentimiento_en  timestamptz,
  registrada_por     uuid references usuarios(id),
  actividad_origen   uuid references actividades(id),
  created_at         timestamptz not null default now()
);
```

`demarcacion_id` se guarda denormalizado aunque se pueda derivar de la sección. Es lo que hace que
los reportes por demarcación no tengan que unir tres tablas en cada consulta.

`aviso_version` y `consentimiento_en` son obligatorios en el formulario aunque el texto del aviso
todavía sea provisional. Es un campo barato hoy que evita que la base sea inservible mañana.

## Deduplicación

El teléfono normalizado es la llave. Normalizar significa quedarse con los últimos 10 dígitos:

```sql
create or replace function normalizar_telefono(t text)
returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(t,''), '\D', '', 'g'), 10), '');
$$;
```

Cuando alguien captura un teléfono que ya existe, la interfaz **no crea otra persona y tampoco
bloquea**. Muestra la ficha encontrada con nombre, colonia y última actividad, y ofrece dos caminos:
agregar esta participación a la persona existente, que es el camino correcto y el que va marcado por
defecto, o indicar que es otra persona distinta, en cuyo caso se guarda sin teléfono y queda marcada
para revisión.

Cuando no hay teléfono, se busca coincidencia aproximada por nombre dentro de la misma sección y se
muestra como aviso suave, nunca como bloqueo.

## Actividades

```sql
create type tipo_actividad   as enum ('reunion','activismo','recorrido');
create type estatus_actividad as enum ('programada','en_curso','realizada','cancelada');

create table actividades (
  id              uuid primary key default gen_random_uuid(),
  tipo            tipo_actividad not null,
  subtipo         text,          -- domiciliaria, vecinal, limpieza, reforestación, etc.
  nombre          text not null,
  fecha           date not null,
  hora            time,
  direccion       text,
  colonia_id      integer references colonias(id),
  seccion_clave   text references secciones(clave),
  demarcacion_id  integer references demarcaciones(id),
  lat             double precision,
  lng             double precision,
  responsable_id  uuid references usuarios(id),
  objetivo        text,
  notas           text,
  estatus         estatus_actividad not null default 'programada',
  asistentes_aprox integer,
  conclusion      text,
  cerrada_en      timestamptz,
  cerrada_por     uuid references usuarios(id),
  created_by      uuid references usuarios(id),
  created_at      timestamptz not null default now()
);

create table actividad_colaboradores (
  actividad_id uuid references actividades(id) on delete cascade,
  usuario_id   uuid references usuarios(id),
  primary key (actividad_id, usuario_id)
);

create table participaciones (
  id             uuid primary key default gen_random_uuid(),
  persona_id     uuid not null references personas(id),
  actividad_id   uuid not null references actividades(id),
  tipo           text not null check (tipo in ('registro','asistencia')),
  registrada_por uuid references usuarios(id),
  created_at     timestamptz not null default now(),
  unique (persona_id, actividad_id)
);
```

`tipo = 'registro'` significa que esa actividad fue donde se dio de alta a la persona.
`asistencia` significa que ya existía y volvió a aparecer. Esa distinción es la que separa
"personas nuevas" de "asistentes" en el cierre de la actividad, sin pedirle nada al usuario.

## Problemáticas y solicitudes

```sql
create table problematicas (
  id     serial primary key,
  nombre text not null unique,
  orden  integer not null default 0,
  activa boolean not null default true
);
-- Agua, Seguridad, Alumbrado, Basura, Baches y calles, Transporte y movilidad,
-- Parques y espacios públicos, Servicios públicos, Otro

create table menciones_problematica (
  id               uuid primary key default gen_random_uuid(),
  participacion_id uuid not null references participaciones(id) on delete cascade,
  problematica_id  integer not null references problematicas(id),
  comentario       text,
  unique (participacion_id, problematica_id)
);

create table solicitudes (
  id                   uuid primary key default gen_random_uuid(),
  persona_id           uuid not null references personas(id),
  participacion_id     uuid references participaciones(id),
  tema                 text not null,
  descripcion          text,
  requiere_seguimiento boolean not null default false,
  created_at           timestamptz not null default now()
);
```

El comentario breve se guarda una vez por mención, no una vez por persona, para que en el reporte de
una actividad se pueda leer qué dijo cada quien sobre agua.

## Seguimiento

```sql
create type tipo_seguimiento as enum ('llamada','whatsapp','invitacion','reunion','otro');
create type estado_seguimiento as enum ('pendiente','en_seguimiento','atendido');

create table seguimientos (
  id             uuid primary key default gen_random_uuid(),
  persona_id     uuid not null references personas(id),
  fecha          date not null default current_date,
  tipo           tipo_seguimiento not null,
  nota           text,
  responsable_id uuid references usuarios(id),
  estado         estado_seguimiento not null default 'pendiente',
  created_at     timestamptz not null default now()
);
```

La bandeja de seguimiento no es una tabla aparte. Es una consulta: personas con
`quiere_participar` o `quiere_info` en verdadero cuyo último seguimiento sea `pendiente` o no exista.

## Fotos

```sql
create table fotos (
  id           uuid primary key default gen_random_uuid(),
  actividad_id uuid references actividades(id) on delete cascade,
  url          text not null,
  subida_por   uuid references usuarios(id),
  created_at   timestamptz not null default now()
);
```

Compresión obligatoria en el navegador antes de subir: canvas, lado mayor a 1600 píxeles, WebP con
calidad 0.75. Rechaza cualquier archivo que llegue arriba de 400 KB después de comprimir.

## Vistas

Crea estas vistas y consúltalas desde la aplicación en lugar de armar agregaciones en el cliente:

`v_seccion_resumen` con clave, demarcación, responsable vigente, personas registradas, cuántas
quieren participar, reuniones, actividades de activismo, recorridos, fecha de última actividad y de
la próxima.

`v_demarcacion_resumen` con las mismas cifras agregadas, más total de secciones, con responsable y
sin responsable.

`v_problematicas_por_seccion` con clave, problemática y número de menciones.

`v_historial_persona` que une participaciones y seguimientos en una sola línea de tiempo ordenada por
fecha, con tipo de evento, nombre de la actividad y quién la registró.

## Sembrado

Nombres y apellidos verosímiles de la región. Teléfonos siempre en el rango 951 100 0000 a
951 100 9999.

Dos mil personas, repartidas de forma deliberadamente desigual y respetando el peso real del
territorio: alrededor del 45 por ciento en Cabecera Municipal, 12 en Santa Rosa Panzacola, 10 en San
Martín Mexicapam, 8 en Pueblo Nuevo, 7 en San Juan Chapultepec y el resto repartido entre las demás.
Deja unas 25 secciones en cero, porque el mapa tiene que mostrar dónde falta trabajar. Que ese vacío
se concentre en zonas contiguas, no salpicado al azar.

Alrededor del 30 por ciento quiere participar y el 65 por ciento quiere recibir información.

Cincuenta y cinco actividades: cuarenta y seis realizadas en las últimas diez semanas, dos en curso
hoy y siete programadas para los próximos catorce días. Reparto aproximado de un tercio para cada
tipo, con los recorridos concentrados en las zonas con más personas registradas.

Las problemáticas se correlacionan por zona, nunca al azar. Agua pesa fuerte en Pueblo Nuevo, San
Martín Mexicapam, Donají, Montoya y Trinidad de Viguera. Seguridad y transporte pesan en Cabecera
Municipal y Candiani. Alumbrado en la periferia alta. Baches aparecen parejo en todas partes. Si el
mapa de problemáticas se ve uniforme, el sembrado está mal hecho y hay que rehacerlo.

Usuarios sembrados: un administrador general, catorce responsables de demarcación, cuarenta
responsables de sección y veinticinco colaboradores. Eso deja alrededor de ciento diecisiete
secciones sin responsable, que es exactamente la historia que el mapa debe contar.

Trescientos seguimientos repartidos entre pendientes, en seguimiento y atendidos, con más pendientes
que atendidos.
