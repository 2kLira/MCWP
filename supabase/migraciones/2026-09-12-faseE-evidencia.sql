-- Fase E de la etapa electoral v2: evidencia de inicio y cierre de actividad.
--
-- El responsable sube una foto al arrancar la actividad y otra al cerrarla. De cada una el sistema
-- guarda la hora, la coordenada y quién la subió; nada de eso se teclea. Si el GPS no responde, la
-- foto entra igual sin coordenada: bloquear el cierre de una actividad porque falló el GPS sería
-- peor que el problema que resuelve, y por eso lat y lng admiten nulo.
--
-- `momento` queda nulo para el resto de la galería, que sigue funcionando igual.

begin;

alter table fotos
  add column if not exists momento text,
  add column if not exists lat     double precision,
  add column if not exists lng     double precision;

alter table fotos drop constraint if exists fotos_momento_check;
alter table fotos add constraint fotos_momento_check
  check (momento is null or momento in ('inicio','cierre'));

-- Una actividad tiene a lo más una evidencia de inicio y una de cierre.
create unique index if not exists fotos_momento_unico_idx
  on fotos (actividad_id, momento)
  where momento is not null;

commit;
