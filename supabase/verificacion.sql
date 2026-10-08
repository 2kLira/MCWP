-- Verificación de las políticas. **Este archivo solo lee.** No crea, no borra, no modifica nada.
--
-- Para qué sirve: cada vez que se toque supabase/seguridad.sql hay que poder comprobar que el
-- comportamiento no cambió. Esto da el mismo resultado antes y después de un refactor correcto;
-- si algo cambia, se perdió una regla.
--
-- Cómo se corre: en el editor SQL de Supabase, o por el servidor MCP. Las comprobaciones que
-- dependen de una identidad se ejecutan dentro de una transacción que simula la sesión y se
-- deshace con rollback.
--
-- Lo que NO sustituye: las pruebas de punta a punta contra la API. RLS no es lo único que decide
-- lo que ve una pantalla; PostgREST arma `INSERT ... SELECT` y `ON CONFLICT DO UPDATE` que se
-- comportan distinto a un INSERT suelto. Lo de abajo es el piso, no el techo.

-- ===========================================================================
-- 1. Invariantes estructurales. No dependen de ninguna identidad.
-- ===========================================================================

-- 1a. Toda tabla de public tiene RLS encendido. Debe devolver CERO renglones.
select c.relname as tabla_sin_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 1b. Toda tabla de public tiene al menos una política. Debe devolver CERO.
select c.relname as tabla_sin_politicas
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and not exists (select 1 from pg_policy p where p.polrelid = c.oid);

-- 1c. Toda vista lleva security_invoker. Debe devolver CERO.
-- Sin esto una vista corre con los permisos de quien la creó y se salta RLS: un brigadista leería
-- toda la base por ahí aunque las tablas estén bien protegidas.
select c.relname as vista_sin_security_invoker
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'v'
  and coalesce((select option_value from pg_options_to_table(c.reloptions)
                where option_name = 'security_invoker'), 'false') <> 'true';

-- 1d. Una sola política por tabla y por acción. Debe devolver CERO.
-- Es la prueba objetiva de que la consolidación sigue en pie.
select tablename, cmd, count(*) as politicas
from pg_policies where schemaname = 'public'
group by 1, 2 having count(*) > 1;

-- 1e. anon no tiene acceso a nada de public. Debe devolver CERO.
-- Aquí no existe uso anónimo: todo pasa por login.
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'anon';

-- 1f. Ninguna función de public es ejecutable por PUBLIC. Debe devolver CERO.
-- Postgres otorga EXECUTE a PUBLIC en toda función nueva, y PUBLIC incluye a anon.
--
-- Cuidado con el patrón: en un ACL, PUBLIC es el beneficiario vacío, así que su entrada es `=X/`
-- al inicio de la lista o después de una coma. Buscar `%=X/%` a secas también casa con
-- `authenticated=X/` y da una falsa alarma en las cuatro funciones legítimas.
select p.oid::regprocedure::text as funcion_abierta, p.proacl::text as permisos
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (p.proacl::text like '{=X/%' or p.proacl::text like '%,=X/%');

-- 1g. El bucket de fotos es privado. `publico` debe ser false.
select id, public as publico, file_size_limit, allowed_mime_types from storage.buckets;

-- 1h. El envoltorio de rutas de almacenamiento no lanza con basura.
-- Debe dar: el uuid, y null en los otros tres. Si lanzara, una política daría error 500 en vez
-- de negar.
select
  privado.actividad_de_ruta('actividades/aaaaaaaa-0000-0000-0000-000000000001/f.webp') as valida,
  privado.actividad_de_ruta('actividades/no-es-uuid/f.webp')                            as basura,
  privado.actividad_de_ruta('basura/f.webp')                                            as sin_prefijo,
  privado.actividad_de_ruta(null)                                                       as nula;

-- ===========================================================================
-- 2. Comprobaciones con identidad simulada.
-- ===========================================================================
-- Sustituye los dos identificadores por los de tu base:
--   select u.id, u.rol, au.email from usuarios u join auth.users au on au.id = u.id;

-- 2a. Un usuario autenticado sin ficha en `usuarios` no alcanza NADA.
-- Es el caso de alguien que se registrara solo. Todos los conteos deben dar 0 y
-- lo_reconoce_el_sistema debe dar false.
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub','99999999-9999-4999-8999-999999999999','role','authenticated')::text,
    true);
  set local role authenticated;
  select
    (select count(*) from demarcaciones)     as demarcaciones,
    (select count(*) from secciones)         as secciones,
    (select count(*) from personas)          as personas,
    (select count(*) from actividades)       as actividades,
    (select count(*) from problematicas)     as problematicas,
    (select count(*) from v_seccion_resumen) as vista_secciones,
    privado.es_usuario_activo()              as lo_reconoce_el_sistema;
rollback;

-- 2b. El admin ve el catálogo completo.
-- Esperado hoy: 14 demarcaciones, 175 secciones, 157 geometrías, 185 casillas.
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id::text from usuarios where rol = 'admin' limit 1),
                      'role','authenticated')::text, true);
  set local role authenticated;
  select
    (select count(*) from demarcaciones)   as demarcaciones,
    (select count(*) from secciones)       as secciones,
    (select count(*) from secciones_geom)  as geometria,
    (select count(*) from casillas)        as casillas,
    (select count(*) from usuarios)        as usuarios_visibles,
    privado.es_admin()                     as es_admin;
rollback;

-- 2c. Un brigadista ve el catálogo territorial —lo necesita para el mapa y el GPS— pero solo su
-- propia fila de usuarios, y ninguna actividad si no lo han invitado a ninguna abierta.
begin;
  select set_config('request.jwt.claims',
    json_build_object('sub', (select id::text from usuarios where rol = 'brigadista'
                              order by nombre limit 1),
                      'role','authenticated')::text, true);
  set local role authenticated;
  select
    (select count(*) from secciones)              as secciones_debe_ser_175,
    (select count(*) from usuarios)               as usuarios_debe_ser_1,
    (select count(*) from seguimientos)           as seguimientos_debe_ser_0,
    (select count(*) from importaciones)          as importaciones_debe_ser_0,
    (select count(*) from representantes_casilla) as representantes_debe_ser_0,
    privado.es_admin()                            as es_admin_debe_ser_false;
rollback;
