-- Fase E: la bandeja de seguimiento gana el motivo.
--
-- Una persona cae en v_bandeja_seguimiento por una de tres razones: quiere participar, quiere
-- información, o dejó una solicitud que requiere seguimiento (tabla solicitudes, columna
-- requiere_seguimiento). La vista ya las juntaba, pero no decía cuál de las tres era, y ese es el
-- filtro más útil de la pantalla: no se atiende igual a quien pidió información que a quien pidió
-- que le arreglen una fuga.
--
-- Se recrea la vista completa (create or replace no permite agregar una columna a la mitad),
-- copiando exactamente la definición de supabase/schema.sql y sumando tiene_solicitud.

begin;

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
  ult.tipo                   as ultimo_seguimiento_tipo,
  exists (
    select 1 from solicitudes so
    where so.persona_id = p.id and so.requiere_seguimiento
  )                          as tiene_solicitud
from personas p
left join lateral (
  select s.fecha, s.estado, s.tipo
  from seguimientos s
  where s.persona_id = p.id
  order by s.fecha desc, s.created_at desc
  limit 1
) ult on true
where (
    p.quiere_participar
    or p.quiere_info
    or exists (
      select 1 from solicitudes so
      where so.persona_id = p.id and so.requiere_seguimiento
    )
  )
  and (ult.estado is null or ult.estado = 'pendiente');

commit;
