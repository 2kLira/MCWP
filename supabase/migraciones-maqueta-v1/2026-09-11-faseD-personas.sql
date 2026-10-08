-- Fase D de la etapa electoral v2: captura de personas alcanzadas. Ver PLAN-ELECTORAL.md.

begin;

-- Quién trajo a esta persona. El cliente decidió que el promotor se elige de entre la gente ya
-- registrada, no de una lista aparte: por eso apunta a personas y no a usuarios.
alter table personas
  add column if not exists promotor_id uuid references personas(id);

create index if not exists personas_promotor_idx on personas (promotor_id)
  where promotor_id is not null;

-- Una persona no puede ser su propio promotor.
alter table personas drop constraint if exists personas_promotor_distinto_check;
alter table personas add constraint personas_promotor_distinto_check
  check (promotor_id is null or promotor_id <> id);

-- Problemática nueva. El orden 9 lo tenía 'Otro', que debe quedarse al final.
update problematicas set orden = 10 where nombre = 'Otro';
insert into problematicas (nombre, orden) values ('Servicios de salud', 9)
on conflict (nombre) do nothing;

-- La bandeja de seguimiento tiene que recoger también a quien pidió algo en particular. Antes solo
-- miraba quiere_participar y quiere_info; una petición con seguimiento es exactamente el caso que
-- esta bandeja existe para atender.
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
