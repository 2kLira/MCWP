-- Fase 4 de la etapa electoral: carga masiva de promovidos. Ver PLAN-ELECTORAL.md.
--
-- Toda carga masiva queda registrada con quién la hizo, cuándo, de qué archivo y con qué saldo.
-- No es burocracia: es lo que permite deshacer un archivo completo si resulta que no debía estar
-- ahí. Por eso personas.importacion_id apunta aquí.

begin;

create table if not exists importaciones (
  id             uuid primary key default gen_random_uuid(),
  archivo        text not null,
  importada_por  uuid references usuarios(id),
  renglones      integer not null default 0,
  nuevas         integer not null default 0,
  actualizadas   integer not null default 0,
  rechazadas     integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists importaciones_fecha_idx on importaciones (created_at desc);

alter table personas
  add column if not exists importacion_id uuid;

-- Al borrar una importación las personas se quedan, solo pierden el sello de origen. Borrar gente
-- por borrar el registro de la carga sería peor que el problema que resuelve.
alter table personas drop constraint if exists personas_importacion_fkey;
alter table personas add constraint personas_importacion_fkey
  foreign key (importacion_id) references importaciones(id) on delete set null;

create index if not exists personas_importacion_idx on personas (importacion_id)
  where importacion_id is not null;

commit;
