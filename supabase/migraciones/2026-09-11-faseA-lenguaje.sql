-- Fase A de la etapa electoral, versión 2: lenguaje y limpieza. Ver PLAN-ELECTORAL.md.
--
-- Tres cambios: el rol colaborador pasa a brigadista, las actividades pierden el subtipo y ganan
-- el tipo crucero.
--
-- OJO CON EL ORDEN. Postgres no deja usar un valor de enum recién agregado dentro de la misma
-- transacción que lo creó, así que `alter type ... add value` va SOLO, antes del begin. Si pegas
-- todo el archivo de una vez en el editor SQL de Supabase corre bien, porque cada sentencia se
-- ejecuta en orden.

-- 1. Tipo de actividad nuevo. Fuera de transacción, a propósito.
alter type tipo_actividad add value if not exists 'crucero';

-- 2. Todo lo demás sí va junto.
begin;

-- El rol se renombra en el enum, no se crea uno nuevo: así ninguna fila existente se queda sin
-- valor y no hay que tocar las que ya están.
do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'rol_usuario' and e.enumlabel = 'colaborador'
  ) then
    alter type rol_usuario rename value 'colaborador' to 'brigadista';
  end if;
end $$;

alter table if exists actividad_colaboradores rename to actividad_brigadistas;

-- El subtipo se quita. Lo que guardaba (domiciliaria, vecinal, limpieza) se resolvió con los tipos
-- y con el nombre de la actividad, y pedirlo dos veces era pedirle al usuario algo que ya dijo.
alter table actividades drop column if exists subtipo;

commit;
