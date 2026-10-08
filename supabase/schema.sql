-- Sistema de Operación y Estructura Territorial — Oaxaca de Juárez
-- Estructura de la base. La seguridad va aparte, en supabase/seguridad.sql, y se aplica
-- inmediatamente después de este archivo.
--
-- Este archivo es consolidado: reemplaza al schema.sql de la maqueta más sus once migraciones.
-- Se hizo así porque la base del proyecto real nació vacía y replicar once parches
-- incrementales (uno de los cuales apagaba RLS, y cuatro redefinían la misma vista) solo
-- habría arrastrado la historia de una maqueta que ya no existe. Las migraciones viejas
-- quedaron en supabase/migraciones-maqueta-v1/ como referencia y NO deben aplicarse aquí.
--
-- Diferencia de fondo con la maqueta: usuarios.id ya no se genera en esta tabla, es el mismo
-- id de auth.users. Hay login, y por lo tanto hay RLS.

create extension if not exists postgis with schema extensions;

-- PostGIS va en extensions y no en public a propósito: así spatial_ref_sys no queda en un
-- esquema expuesto al Data API. El costo es que hay que calificar los tipos y las funciones,
-- porque authenticated no trae extensions en su search_path.

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
  nota             text,
  lista_nominal    integer,
  meta_votos       integer,
  prioridad        text,
  -- Las seis secciones sustitutas se siguen pintando, pero quedan fuera del catálogo para que
  -- no entren dos veces en las cifras de lista nominal ni de metas.
  en_catalogo      boolean not null default true,
  constraint secciones_prioridad_check check (prioridad is null or prioridad in ('A','B'))
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
  geom  extensions.geometry(MultiPolygon, 4326) not null
);
create index secciones_geom_gix on secciones_geom using gist (geom);

-- Respaldo del servidor para punto en polígono. En el cliente la misma resolución se hace
-- contra secciones.geojson cacheado. Ambas rutas deben dar el mismo resultado.
create or replace function seccion_por_punto(lng double precision, lat double precision)
returns text language sql stable security invoker set search_path = '' as $$
  select g.clave from public.secciones_geom g
  where extensions.st_contains(g.geom, extensions.st_setsrid(extensions.st_point(lng, lat), 4326))
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------

create type rol_usuario as enum ('admin','resp_demarcacion','resp_seccion','brigadista');

-- El id es el de auth.users. Así auth.uid() sirve directo en las políticas y no existe una
-- segunda tabla de identidad que se pueda desincronizar.
-- Las bajas se hacen con activo = false, no borrando: hay llaves foráneas que apuntan aquí
-- desde personas, actividades y seguimientos, y la historia de quién capturó qué no se tira.
create table usuarios (
  id             uuid primary key references auth.users(id) on delete cascade,
  nombre         text not null,
  telefono       text,
  rol            rol_usuario not null,
  demarcacion_id integer references demarcaciones(id),
  seccion_clave  text references secciones(clave),
  activo         boolean not null default true,
  created_at     timestamptz not null default now()
);

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
-- Importaciones
-- ---------------------------------------------------------------------------

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
-- Personas
-- ---------------------------------------------------------------------------

create type genero_persona as enum ('mujer','hombre','otro','no_especifica');

create table personas (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null,
  telefono_norm      text unique
    check (telefono_norm is null or telefono_norm ~ '^[0-9]{10}$'),
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

  -- Las tres marcas son independientes a propósito. Ver PENDIENTES.md, entrada 9.
  es_promovido       boolean not null default false,
  promovido_en       timestamptz,
  promovido_por      uuid references usuarios(id),

  quiere_ser_representante boolean not null default false,
  recibio_apoyo      boolean not null default false,

  -- Quién trajo a esta persona. Se elige de entre la gente ya registrada, así que apunta a
  -- personas y no a usuarios.
  promotor_id        uuid references personas(id),

  importacion_id     uuid references importaciones(id) on delete set null,

  aviso_version      text,
  consentimiento_en  timestamptz,
  registrada_por     uuid references usuarios(id),
  -- La actividad en la que nació el registro. Con RLS esto dejó de ser un dato informativo:
  -- es la llave con la que el brigadista alcanza o no alcanza a la persona.
  actividad_origen   uuid,                      -- fk agregada abajo, actividades nace después
  created_at         timestamptz not null default now(),
  constraint personas_promotor_distinto_check check (promotor_id is null or promotor_id <> id)
);

-- Deduplicación: el teléfono normalizado es la llave. Normalizar es quedarse con los
-- últimos 10 dígitos.
create or replace function normalizar_telefono(t text)
returns text language sql immutable security invoker set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(t,''), '\D', '', 'g'), 10), '');
$$;

-- ---------------------------------------------------------------------------
-- Actividades
-- ---------------------------------------------------------------------------

create type tipo_actividad    as enum ('reunion','activismo','recorrido','crucero');
create type estatus_actividad as enum ('programada','en_curso','realizada','cancelada');

create table actividades (
  id              uuid primary key default gen_random_uuid(),
  tipo            tipo_actividad not null,
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

-- La invitación. Con RLS, esta tabla es la que reparte todo el acceso del brigadista:
-- un renglón aquí, más la actividad abierta, es su permiso completo.
create table actividad_brigadistas (
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

create type tipo_seguimiento   as enum ('llamada','whatsapp','invitacion','reunion','otro');
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

-- ---------------------------------------------------------------------------
-- Fotos
-- ---------------------------------------------------------------------------

create table fotos (
  id           uuid primary key default gen_random_uuid(),
  actividad_id uuid references actividades(id) on delete cascade,
  url          text not null,
  subida_por   uuid references usuarios(id),
  -- Evidencia de inicio o de cierre. Nulo para el resto de la galería. La hora sale de
  -- created_at y la coordenada del GPS; si el GPS no respondió, van nulas.
  momento      text check (momento is null or momento in ('inicio','cierre')),
  lat          double precision,
  lng          double precision,
  created_at   timestamptz not null default now()
);
create unique index fotos_momento_unico_idx on fotos (actividad_id, momento)
  where momento is not null;

-- ---------------------------------------------------------------------------
-- Casillas y representantes
-- ---------------------------------------------------------------------------

create table casillas (
  id             serial primary key,
  seccion_clave  text not null references secciones(clave),
  tipo           text not null,
  numero         integer not null default 1,
  domicilio      text,
  ubicacion      text,
  referencia     text,
  lat            double precision,
  lng            double precision,
  created_at     timestamptz not null default now(),
  unique (seccion_clave, tipo, numero)
);
create index casillas_seccion_idx on casillas (seccion_clave);

create type cargo_representante  as enum ('titular','suplente');
create type estado_capacitacion  as enum ('capacitado','por_capacitar');
create type estado_manual        as enum ('entregado','pendiente');
create type estado_acreditacion  as enum ('acreditado','pendiente');

create table representantes_casilla (
  id              uuid primary key default gen_random_uuid(),
  casilla_id      integer not null references casillas(id) on delete cascade,
  cargo           cargo_representante not null,
  persona_id      uuid references personas(id),
  nombre          text,
  telefono_norm   text check (telefono_norm is null or telefono_norm ~ '^[0-9]{10}$'),
  capacitacion    estado_capacitacion not null default 'por_capacitar',
  manual          estado_manual       not null default 'pendiente',
  acreditacion    estado_acreditacion not null default 'pendiente',
  registrado_por  uuid references usuarios(id),
  created_at      timestamptz not null default now(),
  unique (casilla_id, cargo)
);
create index representantes_casilla_idx on representantes_casilla (casilla_id);

-- Resultados de procesos pasados, por sección. Genérica a propósito: el reparto de votos va
-- en jsonb porque cada proceso tiene opciones distintas.
create table resultados_historicos (
  id             serial primary key,
  proceso        text not null,
  seccion_clave  text references secciones(clave),
  lista_nominal  integer,
  votos_totales  integer,
  votos          jsonb,
  unique (proceso, seccion_clave)
);
create index resultados_proceso_idx on resultados_historicos (proceso);

-- ---------------------------------------------------------------------------
-- Índices de apoyo para el tablero, el mapa y los reportes
-- ---------------------------------------------------------------------------

create index personas_seccion_idx          on personas (seccion_clave);
create index personas_demarcacion_idx      on personas (demarcacion_id);
create index personas_colonia_idx          on personas (colonia_id);
create index personas_created_at_idx       on personas (created_at desc);
create index personas_participar_idx       on personas (quiere_participar) where quiere_participar;
create index personas_info_idx             on personas (quiere_info) where quiere_info;
create index personas_promovido_idx        on personas (es_promovido) where es_promovido;
create index personas_promotor_idx         on personas (promotor_id) where promotor_id is not null;
create index personas_importacion_idx      on personas (importacion_id) where importacion_id is not null;
create index personas_representante_idx    on personas (quiere_ser_representante)
  where quiere_ser_representante;
-- Estos dos los pide RLS, no el tablero: las políticas del brigadista filtran por ahí.
create index personas_registrada_por_idx   on personas (registrada_por);
create index personas_actividad_origen_idx on personas (actividad_origen)
  where actividad_origen is not null;

-- El cumpleaños se busca por mes y día, nunca por año. extract sobre date es inmutable,
-- to_char no lo es, así que el índice y v_cumpleanos_hoy usan la misma expresión.
create index personas_cumple_idx on personas
  (extract(month from fecha_nacimiento), extract(day from fecha_nacimiento))
  where fecha_nacimiento is not null;

create index secciones_demarcacion_idx   on secciones (demarcacion_id);
create index secciones_prioridad_idx     on secciones (prioridad) where prioridad is not null;
create index colonia_seccion_seccion_idx on colonia_seccion (seccion_clave);
create index colonias_nombre_idx         on colonias (nombre);

create index actividades_fecha_idx       on actividades (fecha desc);
create index actividades_seccion_idx     on actividades (seccion_clave);
create index actividades_demarcacion_idx on actividades (demarcacion_id);
create index actividades_estatus_idx     on actividades (estatus);
create index actividades_tipo_idx        on actividades (tipo);
create index actividades_responsable_idx on actividades (responsable_id);

create index actividad_brigadistas_usuario_idx on actividad_brigadistas (usuario_id);

create index participaciones_persona_idx   on participaciones (persona_id);
create index participaciones_actividad_idx on participaciones (actividad_id);

create index menciones_participacion_idx on menciones_problematica (participacion_id);
create index menciones_problematica_idx  on menciones_problematica (problematica_id);

create index seguimientos_persona_idx on seguimientos (persona_id, fecha desc);
create index seguimientos_estado_idx  on seguimientos (estado);

create index asignaciones_usuario_idx     on asignaciones_responsable (usuario_id);
create index asignaciones_demarcacion_idx on asignaciones_responsable (demarcacion_id)
  where hasta is null and ambito = 'demarcacion';

create index solicitudes_persona_idx on solicitudes (persona_id);
create index fotos_actividad_idx     on fotos (actividad_id);

-- ---------------------------------------------------------------------------
-- Vistas
-- Se consultan desde la aplicación en lugar de armar agregaciones en el cliente.
--
-- security_invoker = true NO es decorativo. Sin eso una vista corre con los permisos de
-- quien la creó y se salta RLS, así que un brigadista leería por aquí toda la base aunque
-- las tablas estén bien protegidas. Toda vista nueva de este proyecto lo lleva.
-- ---------------------------------------------------------------------------

create view v_seccion_resumen with (security_invoker = true) as
select
  s.clave, s.numero, s.demarcacion_id,
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
  a.ultima_actividad, a.proxima_actividad,
  coalesce(p.promovidos, 0)                       as promovidos,
  coalesce(p.aspirantes_representante, 0)         as aspirantes_representante,
  s.lista_nominal, s.meta_votos, s.prioridad, s.en_catalogo,
  -- Una sección está recorrida cuando ya tiene al menos un recorrido realizado. La
  -- definición se escribe aquí una sola vez para que no se invente distinta en cada pantalla.
  coalesce(a.recorridos_realizados, 0) > 0        as recorrida,
  coalesce(c.casillas, 0)                         as casillas,
  -- Deuda 38: la fuente de verdad de si hay polígono es la base, no el GeoJSON del cliente.
  exists (select 1 from secciones_geom g where g.clave = s.clave) as tiene_geometria,
  coalesce(p.apoyos, 0)                           as apoyos
from secciones s
join demarcaciones d on d.id = s.demarcacion_id
left join asignaciones_responsable ar
  on ar.seccion_clave = s.clave and ar.ambito = 'seccion' and ar.hasta is null
left join usuarios u on u.id = ar.usuario_id
left join lateral (
  select count(*) as personas,
    count(*) filter (where pe.quiere_participar)         as quieren_participar,
    count(*) filter (where pe.quiere_info)               as quieren_info,
    count(*) filter (where pe.es_promovido)              as promovidos,
    count(*) filter (where pe.quiere_ser_representante)  as aspirantes_representante,
    count(*) filter (where pe.recibio_apoyo)             as apoyos
  from personas pe where pe.seccion_clave = s.clave
) p on true
left join lateral (
  select
    count(*) filter (where ac.tipo = 'reunion')          as reuniones,
    count(*) filter (where ac.tipo = 'activismo')        as activismo,
    count(*) filter (where ac.tipo = 'recorrido')        as recorridos,
    count(*) filter (where ac.tipo = 'recorrido' and ac.estatus = 'realizada')
                                                         as recorridos_realizados,
    max(ac.fecha) filter (where ac.estatus = 'realizada')            as ultima_actividad,
    min(ac.fecha) filter (where ac.estatus = 'programada'
                            and ac.fecha >= current_date)            as proxima_actividad
  from actividades ac
  where ac.seccion_clave = s.clave and ac.estatus <> 'cancelada'
) a on true
left join lateral (
  select count(*) as casillas from casillas ca where ca.seccion_clave = s.clave
) c on true;

create view v_demarcacion_resumen with (security_invoker = true) as
select
  d.id as demarcacion_id, d.nombre as demarcacion, d.slug, d.centro_lat, d.centro_lng,
  count(v.clave)                                             as secciones,
  count(v.clave) filter (where v.responsable_id is not null)  as secciones_con_responsable,
  count(v.clave) filter (where v.responsable_id is null)      as secciones_sin_responsable,
  coalesce(sum(v.personas), 0)                               as personas,
  coalesce(sum(v.quieren_participar), 0)                     as quieren_participar,
  coalesce(sum(v.quieren_info), 0)                           as quieren_info,
  coalesce(sum(v.reuniones), 0)                              as reuniones,
  coalesce(sum(v.activismo), 0)                              as activismo,
  coalesce(sum(v.recorridos), 0)                             as recorridos,
  max(v.ultima_actividad)                                    as ultima_actividad,
  min(v.proxima_actividad)                                   as proxima_actividad,
  -- Deuda 37: la meta por demarcación, sumada aquí y no en el navegador. Solo cuentan las
  -- secciones del catálogo.
  coalesce(sum(v.lista_nominal) filter (where v.en_catalogo), 0) as lista_nominal,
  sum(v.meta_votos) filter (where v.en_catalogo)                 as meta_votos,
  coalesce(sum(v.promovidos) filter (where v.en_catalogo), 0)    as promovidos,
  count(v.clave) filter (where v.en_catalogo and v.prioridad = 'A')
                                                            as secciones_prioritarias_a,
  count(v.clave) filter (where v.en_catalogo and v.prioridad = 'A' and v.recorrida)
                                                            as secciones_prioritarias_a_recorridas,
  count(v.clave) filter (where v.en_catalogo and v.prioridad = 'B')
                                                            as secciones_prioritarias_b,
  count(v.clave) filter (where v.en_catalogo and v.prioridad = 'B' and v.recorrida)
                                                            as secciones_prioritarias_b_recorridas
from demarcaciones d
left join v_seccion_resumen v on v.demarcacion_id = d.id
group by d.id, d.nombre, d.slug, d.centro_lat, d.centro_lng;

create view v_colonia_resumen with (security_invoker = true) as
select
  pe.colonia_id, co.nombre as colonia, pe.demarcacion_id, pe.seccion_clave,
  count(*)                                             as personas,
  count(*) filter (where pe.quiere_participar)         as quieren_participar,
  count(*) filter (where pe.quiere_info)               as quieren_info,
  count(*) filter (where pe.es_promovido)              as promovidos,
  count(*) filter (where pe.quiere_ser_representante)  as aspirantes_representante
from personas pe
join colonias co on co.id = pe.colonia_id
where pe.colonia_id is not null
group by pe.colonia_id, co.nombre, pe.demarcacion_id, pe.seccion_clave;

create view v_problematicas_por_seccion with (security_invoker = true) as
select
  pe.seccion_clave as clave, pe.demarcacion_id,
  pr.id as problematica_id, pr.nombre as problematica, count(*) as menciones
from menciones_problematica m
join problematicas pr    on pr.id = m.problematica_id
join participaciones par on par.id = m.participacion_id
join personas pe         on pe.id = par.persona_id
where pe.seccion_clave is not null
group by pe.seccion_clave, pe.demarcacion_id, pr.id, pr.nombre;

create view v_historial_persona with (security_invoker = true) as
select par.persona_id, 'participacion'::text as evento, par.tipo as detalle,
  ac.fecha, ac.id as actividad_id, ac.nombre as actividad, ac.tipo::text as tipo_actividad,
  par.registrada_por as usuario_id, ur.nombre as usuario, null::text as nota, par.created_at
from participaciones par
join actividades ac on ac.id = par.actividad_id
left join usuarios ur on ur.id = par.registrada_por
union all
select sg.persona_id, 'seguimiento'::text, sg.tipo::text, sg.fecha,
  null::uuid, null::text, null::text, sg.responsable_id, ur.nombre, sg.nota, sg.created_at
from seguimientos sg
left join usuarios ur on ur.id = sg.responsable_id;

-- La bandeja de seguimiento no es una tabla, es una consulta: personas con quiere_participar
-- o quiere_info cuyo último seguimiento esté pendiente o no exista.
create view v_bandeja_seguimiento with (security_invoker = true) as
select
  p.id as persona_id, p.nombre, p.telefono_norm, p.seccion_clave, p.demarcacion_id,
  p.quiere_participar, p.quiere_info, p.created_at,
  ult.fecha  as ultimo_seguimiento_fecha,
  ult.estado as ultimo_seguimiento_estado,
  ult.tipo   as ultimo_seguimiento_tipo,
  exists (select 1 from solicitudes so
          where so.persona_id = p.id and so.requiere_seguimiento) as tiene_solicitud
from personas p
left join lateral (
  select s.fecha, s.estado, s.tipo from seguimientos s
  where s.persona_id = p.id order by s.fecha desc, s.created_at desc limit 1
) ult on true
where (p.quiere_participar or p.quiere_info
       or exists (select 1 from solicitudes so
                  where so.persona_id = p.id and so.requiere_seguimiento))
  and (ult.estado is null or ult.estado = 'pendiente');

-- Cumpleaños del día. Se compara mes y día, nunca el año. El 29 de febrero solo aparece en
-- años bisiestos: felicitarlo el 28 sería una decisión de producto y no está en el spec.
create view v_cumpleanos_hoy with (security_invoker = true) as
select p.id as persona_id, p.nombre, p.telefono_norm, p.seccion_clave, p.demarcacion_id,
  p.fecha_nacimiento,
  extract(year from age(current_date, p.fecha_nacimiento))::int as edad
from personas p
where p.fecha_nacimiento is not null
  and extract(month from p.fecha_nacimiento) = extract(month from current_date)
  and extract(day   from p.fecha_nacimiento) = extract(day   from current_date);

-- ---------------------------------------------------------------------------
-- Catálogo de problemáticas
-- ---------------------------------------------------------------------------

insert into problematicas (nombre, orden) values
  ('Agua', 1), ('Seguridad', 2), ('Alumbrado', 3), ('Basura', 4),
  ('Baches y calles', 5), ('Transporte y movilidad', 6),
  ('Parques y espacios públicos', 7), ('Servicios públicos', 8),
  ('Servicios de salud', 9), ('Otro', 10)
on conflict (nombre) do nothing;
