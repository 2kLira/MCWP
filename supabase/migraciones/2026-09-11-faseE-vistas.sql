-- Fase E de la etapa electoral v2: deudas 37 y 38 de PENDIENTES.md.
--
-- Deuda 37. El avance de meta por demarcación se sumaba en el navegador
-- (app/territorio/page.tsx) porque v_demarcacion_resumen no cargaba lista_nominal, meta_votos ni
-- promovidos. Esta migración se los agrega y el cálculo del cliente se borra aparte. De paso se
-- agregan los conteos de secciones prioritarias A/B y cuántas de cada grupo ya están recorridas,
-- que el listado de territorio también contaba a mano.
--
-- Deuda 38. Saber qué sección tiene polígono se deducía comparando el catálogo contra
-- secciones.geojson cacheado. v_seccion_resumen gana la columna tiene_geometria, derivada de si
-- existe el renglón en secciones_geom.
--
-- Los tres campos nuevos de la demarcación (lista_nominal, meta_votos, promovidos) y los cuatro de
-- prioritarias solo suman secciones con en_catalogo = true: las seis sustitutas se quedaron en la
-- base para no perder su geometría, pero sus sucesoras ya están en el catálogo y contarlas a las
-- dos sería contar la misma gente dos veces. meta_votos se deja sin coalesce a propósito: si
-- ninguna sección del grupo tiene meta cargada todavía, sum() da null y la pantalla sigue
-- mostrando el guion en vez de un cero engañoso; en cuanto el cliente cargue una sola meta, deja
-- de ser null.
--
-- OJO CON EL ORDEN. v_demarcacion_resumen depende de v_seccion_resumen (hace left join contra
-- ella). Un create or replace que le cambia columnas a v_seccion_resumen mientras
-- v_demarcacion_resumen siga dependiendo de ella, Postgres lo puede rechazar. Por eso: primero se
-- tira v_demarcacion_resumen, luego se recrea v_seccion_resumen, y al final se vuelve a crear
-- v_demarcacion_resumen. Ese orden no se toca.

begin;

drop view if exists v_demarcacion_resumen;

-- v_seccion_resumen: la misma que dejó la fase B/C/F (supabase/migraciones/2026-09-11-faseBCF-
-- territorio-casillas.sql), copiada tal cual para no perder ninguna columna, más tiene_geometria
-- al final.
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
  exists (select 1 from secciones_geom g where g.clave = s.clave) as tiene_geometria
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

-- v_demarcacion_resumen: la misma de supabase/schema.sql, más lista_nominal, meta_votos,
-- promovidos y los cuatro conteos de secciones prioritarias, todos filtrados a en_catalogo.
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
  min(v.proxima_actividad)                                 as proxima_actividad,
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

commit;
