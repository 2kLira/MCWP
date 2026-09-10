-- Sistema de Operación y Estructura Territorial — Oaxaca de Juárez
-- Esquema tal como está definido en spec/modelo-datos.md.
--
-- Nota de orden: en el spec, personas.actividad_origen apunta a actividades(id) y personas se
-- declara antes que actividades. Aquí las tablas van en el orden del spec y esa única llave
-- foránea se agrega con ALTER TABLE al final, cuando actividades ya existe. Es lo mismo, en un
-- orden que corre.

create extension if not exists postgis;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Territorio
-- ---------------------------------------------------------------------------

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

-- La geometría va aparte para no arrastrar polígonos en cada consulta normal.

create table secciones_geom (
  clave text primary key references secciones(clave),
  geom  geometry(MultiPolygon, 4326) not null
);
create index secciones_geom_gix on secciones_geom using gist (geom);

-- Respaldo del servidor para punto en polígono. En el cliente la misma resolución se hace contra
-- secciones.geojson cacheado. Ambas rutas deben dar el mismo resultado.

create or replace function seccion_por_punto(lng double precision, lat double precision)
returns text language sql stable as $$
  select clave from secciones_geom
  where st_contains(geom, st_setsrid(st_point(lng, lat), 4326))
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Usuarios y responsables
-- ---------------------------------------------------------------------------

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

-- Las asignaciones territoriales van en su propia tabla, con vigencia, para que dar de baja a
-- alguien no borre historia y para que la consulta de secciones sin responsable sea trivial.

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

-- ---------------------------------------------------------------------------
-- Personas
-- ---------------------------------------------------------------------------

create type genero_persona as enum ('mujer','hombre','otro','no_especifica');

create table personas (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  telefono_norm      text unique
    check (telefono_norm ~ '^[0-9]{10}$'),      -- 10 dígitos, sin nada más
  telefono_raw       text,
  calle              text,
  colonia_id         integer references colonias(id),
  seccion_clave      text references secciones(clave),
  demarcacion_id     integer references demarcaciones(id),
  lat                double precision,
  lng                double precision,
  origen_ubicacion   text check (origen_ubicacion in ('gps','mapa','manual')),
  genero             genero_persona,
  fecha_nacimiento   date
    check (fecha_nacimiento is null
           or (fecha_nacimiento > date '1900-01-01' and fecha_nacimiento <= current_date)),
  quiere_participar  boolean not null default false,
  quiere_info        boolean not null default false,

  -- Promoción. Las tres marcas son independientes a propósito: una misma persona puede querer
  -- información, querer participar y ser promovida a la vez. Ver PENDIENTES.md, entrada 9.
  es_promovido       boolean not null default false,
  promovido_en       timestamptz,
  promovido_por      uuid references usuarios(id),

  quiere_ser_representante boolean not null default false,

  -- Origen de la carga masiva, si la persona entró por un archivo y no por captura en la calle.
  -- La llave foránea se agrega al final, junto con actividad_origen, porque importaciones se
  -- declara después de personas.
  importacion_id     uuid,

  aviso_version      text,
  consentimiento_en  timestamptz,
  registrada_por     uuid references usuarios(id),
  actividad_origen   uuid,                      -- fk agregada al final, ver nota de arriba
  created_at         timestamptz not null default now()
);

-- Deduplicación: el teléfono normalizado es la llave. Normalizar es quedarse con los últimos
-- 10 dígitos.

create or replace function normalizar_telefono(t text)
returns text language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(t,''), '\D', '', 'g'), 10), '');
$$;

-- ---------------------------------------------------------------------------
-- Importaciones
-- ---------------------------------------------------------------------------

-- Toda carga masiva queda registrada. No es burocracia: es lo que permite deshacer un archivo
-- completo si resulta que no debía estar ahí. Ver PLAN-ELECTORAL.md, fase 4.

create table importaciones (
  id             uuid primary key default gen_random_uuid(),
  archivo        text not null,
  importada_por  uuid references usuarios(id),
  renglones      integer not null default 0,
  nuevas         integer not null default 0,
  actualizadas   integer not null default 0,
  rechazadas     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index importaciones_fecha_idx on importaciones (created_at desc);

-- ---------------------------------------------------------------------------
-- Actividades
-- ---------------------------------------------------------------------------

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

alter table personas
  add constraint personas_actividad_origen_fkey
  foreign key (actividad_origen) references actividades(id);

alter table personas
  add constraint personas_importacion_fkey
  foreign key (importacion_id) references importaciones(id) on delete set null;

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

-- ---------------------------------------------------------------------------
-- Problemáticas y solicitudes
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Seguimiento
-- ---------------------------------------------------------------------------

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

-- La bandeja de seguimiento no es una tabla aparte, es una consulta: personas con
-- quiere_participar o quiere_info en verdadero cuyo último seguimiento sea pendiente o no exista.

-- ---------------------------------------------------------------------------
-- Fotos
-- ---------------------------------------------------------------------------

create table fotos (
  id           uuid primary key default gen_random_uuid(),
  actividad_id uuid references actividades(id) on delete cascade,
  url          text not null,
  subida_por   uuid references usuarios(id),
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Índices de apoyo para las consultas del tablero, el mapa y los reportes
-- ---------------------------------------------------------------------------

create index personas_seccion_idx        on personas (seccion_clave);
create index personas_demarcacion_idx    on personas (demarcacion_id);
create index personas_colonia_idx        on personas (colonia_id);
create index personas_created_at_idx     on personas (created_at desc);
create index personas_participar_idx     on personas (quiere_participar) where quiere_participar;
create index personas_info_idx           on personas (quiere_info) where quiere_info;
create index personas_promovido_idx      on personas (es_promovido) where es_promovido;
create index personas_importacion_idx    on personas (importacion_id) where importacion_id is not null;
create index personas_representante_idx  on personas (quiere_ser_representante)
  where quiere_ser_representante;

-- El cumpleaños se busca por mes y día, nunca por año. extract sobre date es inmutable, to_char
-- no lo es, así que el índice y la vista v_cumpleanos_hoy usan la misma expresión con extract.
create index personas_cumple_idx         on personas
  (extract(month from fecha_nacimiento), extract(day from fecha_nacimiento))
  where fecha_nacimiento is not null;

create index secciones_demarcacion_idx   on secciones (demarcacion_id);
create index colonia_seccion_seccion_idx on colonia_seccion (seccion_clave);
create index colonias_nombre_idx         on colonias (nombre);

create index actividades_fecha_idx       on actividades (fecha desc);
create index actividades_seccion_idx     on actividades (seccion_clave);
create index actividades_demarcacion_idx on actividades (demarcacion_id);
create index actividades_estatus_idx     on actividades (estatus);
create index actividades_tipo_idx        on actividades (tipo);
create index actividades_responsable_idx on actividades (responsable_id);

create index participaciones_persona_idx   on participaciones (persona_id);
create index participaciones_actividad_idx on participaciones (actividad_id);

create index menciones_participacion_idx   on menciones_problematica (participacion_id);
create index menciones_problematica_idx    on menciones_problematica (problematica_id);

create index seguimientos_persona_idx      on seguimientos (persona_id, fecha desc);
create index seguimientos_estado_idx       on seguimientos (estado);

create index asignaciones_usuario_idx      on asignaciones_responsable (usuario_id);
create index asignaciones_demarcacion_idx  on asignaciones_responsable (demarcacion_id)
  where hasta is null and ambito = 'demarcacion';

create index solicitudes_persona_idx       on solicitudes (persona_id);
create index fotos_actividad_idx           on fotos (actividad_id);

-- Resultados de elecciones y consultas pasadas, por sección. Genérica a propósito: la capa que se
-- pidió es la de la revocación de mandato de 2022, pero el mismo molde sirve para cualquier otro
-- proceso sin volver a tocar el esquema. El reparto de votos va en jsonb porque cada proceso tiene
-- opciones distintas: en una revocación son dos, en una elección son los partidos que compitieron.
create table if not exists resultados_historicos (
  id             serial primary key,
  proceso        text not null,
  seccion_clave  text references secciones(clave),
  lista_nominal  integer,
  votos_totales  integer,
  votos          jsonb,
  unique (proceso, seccion_clave)
);

create index if not exists resultados_proceso_idx on resultados_historicos (proceso);

-- ---------------------------------------------------------------------------
-- Vistas
-- Se consultan desde la aplicación en lugar de armar agregaciones en el cliente.
-- ---------------------------------------------------------------------------

create or replace view v_seccion_resumen as
select
  s.clave,
  s.numero,
  s.demarcacion_id,
  d.nombre                                        as demarcacion,
  s.es_sustituta,
  ar.usuario_id                                   as responsable_id,
  u.nombre                                        as responsable,
  coalesce(p.personas, 0)                         as personas,
  coalesce(p.quieren_participar, 0)               as quieren_participar,
  coalesce(p.quieren_info, 0)                     as quieren_info,
  coalesce(a.reuniones, 0)                        as reuniones,
  coalesce(a.activismo, 0)                        as activismo,
  coalesce(a.recorridos, 0)                       as recorridos,
  a.ultima_actividad,
  a.proxima_actividad,
  coalesce(p.promovidos, 0)                       as promovidos,
  coalesce(p.aspirantes_representante, 0)         as aspirantes_representante
from secciones s
join demarcaciones d on d.id = s.demarcacion_id
left join asignaciones_responsable ar
  on ar.seccion_clave = s.clave and ar.ambito = 'seccion' and ar.hasta is null
left join usuarios u on u.id = ar.usuario_id
left join lateral (
  select
    count(*)                                             as personas,
    count(*) filter (where pe.quiere_participar)         as quieren_participar,
    count(*) filter (where pe.quiere_info)               as quieren_info,
    count(*) filter (where pe.es_promovido)              as promovidos,
    count(*) filter (where pe.quiere_ser_representante)  as aspirantes_representante
  from personas pe
  where pe.seccion_clave = s.clave
) p on true
left join lateral (
  select
    count(*) filter (where ac.tipo = 'reunion')          as reuniones,
    count(*) filter (where ac.tipo = 'activismo')        as activismo,
    count(*) filter (where ac.tipo = 'recorrido')        as recorridos,
    max(ac.fecha) filter (where ac.estatus = 'realizada')            as ultima_actividad,
    min(ac.fecha) filter (where ac.estatus = 'programada'
                            and ac.fecha >= current_date)            as proxima_actividad
  from actividades ac
  where ac.seccion_clave = s.clave and ac.estatus <> 'cancelada'
) a on true;

create or replace view v_colonia_resumen as
select
  pe.colonia_id,
  co.nombre                                            as colonia,
  pe.demarcacion_id,
  pe.seccion_clave,
  count(*)                                             as personas,
  count(*) filter (where pe.quiere_participar)         as quieren_participar,
  count(*) filter (where pe.quiere_info)               as quieren_info,
  count(*) filter (where pe.es_promovido)              as promovidos,
  count(*) filter (where pe.quiere_ser_representante)  as aspirantes_representante
from personas pe
join colonias co on co.id = pe.colonia_id
where pe.colonia_id is not null
group by pe.colonia_id, co.nombre, pe.demarcacion_id, pe.seccion_clave;

create or replace view v_demarcacion_resumen as
select
  d.id                                                     as demarcacion_id,
  d.nombre                                                 as demarcacion,
  d.slug,
  d.centro_lat,
  d.centro_lng,
  count(v.clave)                                           as secciones,
  count(v.clave) filter (where v.responsable_id is not null) as secciones_con_responsable,
  count(v.clave) filter (where v.responsable_id is null)     as secciones_sin_responsable,
  coalesce(sum(v.personas), 0)                             as personas,
  coalesce(sum(v.quieren_participar), 0)                   as quieren_participar,
  coalesce(sum(v.quieren_info), 0)                         as quieren_info,
  coalesce(sum(v.reuniones), 0)                            as reuniones,
  coalesce(sum(v.activismo), 0)                            as activismo,
  coalesce(sum(v.recorridos), 0)                           as recorridos,
  max(v.ultima_actividad)                                  as ultima_actividad,
  min(v.proxima_actividad)                                 as proxima_actividad
from demarcaciones d
left join v_seccion_resumen v on v.demarcacion_id = d.id
group by d.id, d.nombre, d.slug, d.centro_lat, d.centro_lng;

create or replace view v_problematicas_por_seccion as
select
  pe.seccion_clave                as clave,
  pe.demarcacion_id,
  pr.id                           as problematica_id,
  pr.nombre                       as problematica,
  count(*)                        as menciones
from menciones_problematica m
join problematicas pr    on pr.id = m.problematica_id
join participaciones par on par.id = m.participacion_id
join personas pe         on pe.id = par.persona_id
where pe.seccion_clave is not null
group by pe.seccion_clave, pe.demarcacion_id, pr.id, pr.nombre;

create or replace view v_historial_persona as
select
  par.persona_id,
  'participacion'::text                                  as evento,
  par.tipo                                               as detalle,
  ac.fecha                                               as fecha,
  ac.id                                                  as actividad_id,
  ac.nombre                                              as actividad,
  ac.tipo::text                                          as tipo_actividad,
  par.registrada_por                                     as usuario_id,
  ur.nombre                                              as usuario,
  null::text                                             as nota,
  par.created_at
from participaciones par
join actividades ac on ac.id = par.actividad_id
left join usuarios ur on ur.id = par.registrada_por
union all
select
  sg.persona_id,
  'seguimiento'::text                                    as evento,
  sg.tipo::text                                          as detalle,
  sg.fecha                                               as fecha,
  null::uuid                                             as actividad_id,
  null::text                                             as actividad,
  null::text                                             as tipo_actividad,
  sg.responsable_id                                      as usuario_id,
  ur.nombre                                              as usuario,
  sg.nota,
  sg.created_at
from seguimientos sg
left join usuarios ur on ur.id = sg.responsable_id
order by fecha desc, created_at desc;

-- La bandeja de seguimiento no es una tabla aparte, es una consulta: personas con
-- quiere_participar o quiere_info en verdadero cuyo último seguimiento sea pendiente o no exista.
-- El spec la describe en prosa y no la pide como vista; se escribe aquí porque la misma regla dice
-- que las agregaciones se resuelven en la base y no en el navegador. Anotado en PENDIENTES.md.
create or replace view v_bandeja_seguimiento as
select
  p.id                       as persona_id,
  p.nombre,
  p.telefono_norm,
  p.seccion_clave,
  p.demarcacion_id,
  p.quiere_participar,
  p.quiere_info,
  p.created_at,
  ult.fecha                  as ultimo_seguimiento_fecha,
  ult.estado                 as ultimo_seguimiento_estado,
  ult.tipo                   as ultimo_seguimiento_tipo
from personas p
left join lateral (
  select s.fecha, s.estado, s.tipo
  from seguimientos s
  where s.persona_id = p.id
  order by s.fecha desc, s.created_at desc
  limit 1
) ult on true
where (p.quiere_participar or p.quiere_info)
  and (ult.estado is null or ult.estado = 'pendiente');

-- Cumpleaños del día. Se compara mes y día, nunca el año, con la misma expresión que indexa
-- personas_cumple_idx. El 29 de febrero solo aparece en años bisiestos: felicitarlo el 28 sería
-- una decisión de producto y no está en el spec, así que no se toma aquí.
create or replace view v_cumpleanos_hoy as
select
  p.id                       as persona_id,
  p.nombre,
  p.telefono_norm,
  p.seccion_clave,
  p.demarcacion_id,
  p.fecha_nacimiento,
  extract(year from age(current_date, p.fecha_nacimiento))::int as edad
from personas p
where p.fecha_nacimiento is not null
  and extract(month from p.fecha_nacimiento) = extract(month from current_date)
  and extract(day   from p.fecha_nacimiento) = extract(day   from current_date)
order by p.nombre;

-- ---------------------------------------------------------------------------
-- Catálogo de problemáticas
-- ---------------------------------------------------------------------------

insert into problematicas (nombre, orden) values
  ('Agua', 1),
  ('Seguridad', 2),
  ('Alumbrado', 3),
  ('Basura', 4),
  ('Baches y calles', 5),
  ('Transporte y movilidad', 6),
  ('Parques y espacios públicos', 7),
  ('Servicios públicos', 8),
  ('Otro', 9)
on conflict (nombre) do nothing;
