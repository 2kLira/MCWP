-- Rama soet: la persona registra si recibió apoyo (sí o no), y el mapa lo cuenta por sección.
--
-- Es aditiva a propósito: una columna nueva con default y una columna nueva al final de
-- v_seccion_resumen. La versión de main no la lee y sigue funcionando igual contra esta base.
-- Postgres deja agregar columnas al final de una vista con create or replace, así que aquí no hace
-- falta tirar v_demarcacion_resumen como en la fase E.

begin;

alter table personas
  add column if not exists recibio_apoyo boolean not null default false;

-- Solo para la demostración: marca como apoyada a cerca de tres de cada diez personas sembradas,
-- para que la capa del mapa no salga vacía. Es determinista: sale del id, no de random().
-- Ojo: si se vuelve a correr después de la demo, re-marca a quien se le haya quitado a mano.
update personas
set recibio_apoyo = true
where get_byte(decode(md5(id::text), 'hex'), 0) < 77;

-- v_seccion_resumen: la misma de la fase E (2026-09-11-faseE-vistas.sql), copiada tal cual, más
-- apoyos al final.
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
  coalesce(c.casillas, 0)                         as casillas,
  -- Deuda 38: la fuente de verdad de si hay polígono es la base, no el GeoJSON cacheado del
  -- cliente.
  exists (select 1 from secciones_geom g where g.clave = s.clave) as tiene_geometria,
  coalesce(p.apoyos, 0)                           as apoyos
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
    count(*) filter (where pe.quiere_ser_representante)  as aspirantes_representante,
    count(*) filter (where pe.recibio_apoyo)             as apoyos
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
