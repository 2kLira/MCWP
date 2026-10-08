-- Fase 5 de la etapa electoral: capas de calor. Ver PLAN-ELECTORAL.md.
--
-- Dos cosas: el resumen por sección gana los conteos de promoción, y nace un resumen por colonia.
--
-- Sobre el resumen por colonia. La colonia no es unidad exacta y 28 están partidas entre
-- demarcaciones, así que agrupar solo por colonia obligaría a decidir a qué demarcación se le
-- cuenta cada persona. En vez de eso se agrupa por colonia, demarcación y sección a la vez: cada
-- renglón dice de qué territorio es, el recorte por rol funciona con aplicarAlcance sin inventar
-- nada, y quien ve todo el municipio suma los renglones. Una colonia partida aparece con sus
-- pedazos separados, que es la verdad.

begin;

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

commit;
