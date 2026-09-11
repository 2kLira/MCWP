-- Fases B, C y F de la etapa electoral v2. Ver PLAN-ELECTORAL.md.
--
-- Tres cosas: la sección gana lista nominal, meta de votos y prioridad; nace el catálogo de
-- casillas con su coordenada; y nacen los representantes de casilla con sus tres estados.
--
-- Sobre `en_catalogo`. El catálogo del cliente trae 169 secciones y la cartografía tiene geometría
-- de 157: 151 del catálogo más las 6 sustitutas, que el reseccionamiento del INE partió y que el
-- catálogo ya no incluye. Las seis se quedan en la base y se siguen pintando, porque esconderlas
-- deja hoyos en el mapa, pero quedan marcadas fuera del catálogo para que no entren en las cifras
-- de lista nominal ni de metas, donde contarían dos veces.

begin;

alter table secciones
  add column if not exists lista_nominal integer,
  add column if not exists meta_votos    integer,
  add column if not exists prioridad     text,
  add column if not exists en_catalogo   boolean not null default true;

alter table secciones drop constraint if exists secciones_prioridad_check;
alter table secciones add constraint secciones_prioridad_check
  check (prioridad is null or prioridad in ('A','B'));

create index if not exists secciones_prioridad_idx on secciones (prioridad)
  where prioridad is not null;

-- ---------------------------------------------------------------------------
-- Casillas
-- ---------------------------------------------------------------------------

create table if not exists casillas (
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

create index if not exists casillas_seccion_idx on casillas (seccion_clave);

-- ---------------------------------------------------------------------------
-- Representantes de casilla
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'cargo_representante') then
    create type cargo_representante as enum ('titular','suplente');
  end if;
  if not exists (select 1 from pg_type where typname = 'estado_capacitacion') then
    create type estado_capacitacion as enum ('capacitado','por_capacitar');
  end if;
  if not exists (select 1 from pg_type where typname = 'estado_manual') then
    create type estado_manual as enum ('entregado','pendiente');
  end if;
  if not exists (select 1 from pg_type where typname = 'estado_acreditacion') then
    create type estado_acreditacion as enum ('acreditado','pendiente');
  end if;
end $$;

-- Un titular y un suplente por casilla, de ahí la llave única. El representante puede ser alguien
-- que ya está en el padrón o alguien que todavía no: por eso persona_id es opcional y hay nombre
-- y teléfono propios.
create table if not exists representantes_casilla (
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

create index if not exists representantes_casilla_idx on representantes_casilla (casilla_id);

-- ---------------------------------------------------------------------------
-- El resumen por sección gana lo de esta fase
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
  coalesce(p.aspirantes_representante, 0)         as aspirantes_representante,
  s.lista_nominal,
  s.meta_votos,
  s.prioridad,
  s.en_catalogo,
  -- Una sección está recorrida cuando ya tiene al menos un recorrido realizado. La definición se
  -- escribe aquí una sola vez para que no se invente distinta en cada pantalla.
  coalesce(a.recorridos_realizados, 0) > 0        as recorrida,
  coalesce(c.casillas, 0)                         as casillas
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

commit;
