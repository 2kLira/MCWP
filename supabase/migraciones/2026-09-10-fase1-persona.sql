-- Fase 1 de la etapa electoral. Ver PLAN-ELECTORAL.md.
--
-- supabase/schema.sql es el esquema completo y ya incluye todo esto, pero está escrito con
-- create table a secas: sirve para levantar una base vacía, no para mover una que ya corre.
-- Este archivo es el mismo cambio en forma de migración, para una base que ya tiene datos.

begin;

-- Género. Se captura, nunca se infiere del nombre.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'genero_persona') then
    create type genero_persona as enum ('mujer','hombre','otro','no_especifica');
  end if;
end $$;

alter table personas
  add column if not exists genero             genero_persona,
  add column if not exists fecha_nacimiento   date,
  add column if not exists es_promovido       boolean not null default false,
  add column if not exists promovido_en       timestamptz,
  add column if not exists promovido_por      uuid references usuarios(id),
  add column if not exists quiere_ser_representante boolean not null default false;

-- La fecha de nacimiento no puede ser futura ni anterior a 1900.
alter table personas drop constraint if exists personas_fecha_nacimiento_check;
alter table personas add constraint personas_fecha_nacimiento_check
  check (fecha_nacimiento is null
         or (fecha_nacimiento > date '1900-01-01' and fecha_nacimiento <= current_date));

-- El teléfono normalizado son exactamente diez dígitos. Nulo sigue permitido: hay gente que se
-- registra sin teléfono.
alter table personas drop constraint if exists personas_telefono_norm_check;
alter table personas add constraint personas_telefono_norm_check
  check (telefono_norm is null or telefono_norm ~ '^[0-9]{10}$');

create index if not exists personas_promovido_idx     on personas (es_promovido) where es_promovido;
create index if not exists personas_representante_idx on personas (quiere_ser_representante)
  where quiere_ser_representante;

-- El cumpleaños se busca por mes y día, nunca por año. extract sobre date es inmutable, to_char
-- no lo es, así que el índice y la vista usan la misma expresión con extract.
create index if not exists personas_cumple_idx on personas
  (extract(month from fecha_nacimiento), extract(day from fecha_nacimiento))
  where fecha_nacimiento is not null;

-- Cumpleaños del día. El 29 de febrero solo aparece en años bisiestos: felicitarlo el 28 sería una
-- decisión de producto y no está en el spec. Anotado en PENDIENTES.md.
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

commit;
