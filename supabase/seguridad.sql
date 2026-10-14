-- Seguridad: permisos, RLS y políticas.
-- Se aplica inmediatamente después de supabase/schema.sql. Sin este archivo la base queda
-- con las tablas creadas y sin una sola política, que es el peor estado posible.
--
-- Modelo de acceso, en una frase: el admin lo ve todo; el brigadista no ve nada excepto la
-- actividad a la que lo invitaron, mientras esa actividad siga abierta.
--
-- Los dos roles territoriales del enum (resp_demarcacion, resp_seccion) NO tienen políticas
-- todavía. Un usuario con esos roles no ve nada. Está anotado en PENDIENTES.md; es deliberado
-- no inventarlos, porque el spec no define su alcance con RLS.

-- ---------------------------------------------------------------------------
-- 1. anon no existe en este proyecto
-- ---------------------------------------------------------------------------
-- Supabase otorga por omisión a anon privilegios arwdDxtm (incluidos insert, update y delete)
-- sobre toda tabla nueva de public, y EXECUTE sobre toda función nueva. Es decir: sin esto,
-- lo único que separa a un desconocido de los datos es que cada política esté bien escrita.
-- Aquí no hay ningún uso anónimo —todo pasa por login— así que se le quita el acceso de raíz
-- y RLS deja de ser la única capa.

revoke all   on all tables    in schema public from anon;
revoke all   on all routines  in schema public from anon;
revoke all   on all sequences in schema public from anon;
revoke usage on schema public from anon;

alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on routines  from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Postgres otorga EXECUTE a PUBLIC en toda función nueva, y PUBLIC incluye a anon y a
-- authenticated. Se quita por omisión y se otorga a mano donde haga falta.
alter default privileges in schema public revoke execute on routines from public;

-- ---------------------------------------------------------------------------
-- 2. Esquema privado para las funciones de las políticas
-- ---------------------------------------------------------------------------
-- Van aquí y no en public porque una función SECURITY DEFINER en public es, por definición,
-- un endpoint del Data API. privado no está en los esquemas expuestos, así que nada de aquí
-- es alcanzable por REST aunque tenga EXECUTE.
--
-- Son SECURITY DEFINER a propósito: necesitan leer usuarios y actividad_brigadistas
-- saltándose RLS, que es justo lo que evita la recursión infinita en las políticas.

create schema if not exists privado;
revoke all   on schema privado from public;
grant  usage on schema privado to authenticated;

create or replace function privado.es_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select u.rol = 'admin' from public.usuarios u
      where u.id = auth.uid() and u.activo), false);
$$;

create or replace function privado.es_usuario_activo()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.usuarios u
                 where u.id = auth.uid() and u.activo);
$$;

-- El permiso del brigadista vive y muere aquí: debe estar invitado y la actividad debe seguir
-- abierta. Al pasar a realizada o cancelada pierde el acceso, que es la decisión tomada.
create or replace function privado.actividad_abierta_mia(a_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.actividad_brigadistas ab
    join public.actividades ac on ac.id = ab.actividad_id
    where ab.actividad_id = a_id
      and ab.usuario_id = auth.uid()
      and ac.estatus in ('programada','en_curso')
  );
$$;

-- El catálogo territorial no es para el brigadista: su alcance son las actividades a las que lo
-- inviten, y con la agenda como módulo único no tiene pantalla que lo necesite. La captura en
-- campo tampoco lo necesita: la sección la resuelve el GeoJSON estático de public/datos/ y las
-- colonias salen de un catálogo estático; y las llaves foráneas de `personas` **no pasan por
-- RLS**, así que puede guardar una sección y una colonia que no alcanza a leer. Verificado.
create or replace function privado.ve_catalogo()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.activo and u.rol <> 'brigadista'
  );
$$;

-- Sirve para tablas que apuntan a una persona ya existente (solicitudes, por ejemplo).
-- Cuidado: NO usarla en la política de SELECT de personas. Es STABLE, así que vuelve a leer
-- personas con la instantánea anterior a la sentencia; en un INSERT ... RETURNING el renglón
-- recién creado todavía no está ahí y el capturista termina sin poder ver su propia captura.
create or replace function privado.persona_en_actividad_mia(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.personas p
    where p.id = p_id and privado.actividad_abierta_mia(p.actividad_origen)
  ) or exists (
    select 1 from public.participaciones pa
    where pa.persona_id = p_id and privado.actividad_abierta_mia(pa.actividad_id)
  );
$$;

revoke all on function privado.ve_catalogo() from public;
grant execute on function privado.ve_catalogo() to authenticated;

revoke all on function privado.es_admin(), privado.es_usuario_activo(),
                       privado.actividad_abierta_mia(uuid),
                       privado.persona_en_actividad_mia(uuid) from public;
grant execute on function privado.es_admin(), privado.es_usuario_activo(),
                          privado.actividad_abierta_mia(uuid),
                          privado.persona_en_actividad_mia(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Detección de teléfono duplicado
-- ---------------------------------------------------------------------------
-- El registro rápido exige avisar del duplicado en el momento, pero el brigadista no puede
-- leer personas de otras capturas. Esta función responde sí o no y nada más: nunca devuelve
-- el registro, ni el nombre, ni la sección.
--
-- Vive en public y no en privado porque PostgREST solo expone RPC de esquemas expuestos, y la
-- app necesita llamarla. A cambio está blindada por dentro: comprueba sesión y usuario activo
-- antes de leer, y solo authenticated tiene EXECUTE.

create or replace function public.telefono_ya_registrado(tel text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare norm text;
begin
  -- Un SECURITY DEFINER se salta RLS. Por eso lo primero es comprobar quién llama.
  if auth.uid() is null then
    raise exception 'Se requiere sesión';
  end if;
  if not exists (select 1 from public.usuarios u where u.id = auth.uid() and u.activo) then
    raise exception 'Usuario sin acceso';
  end if;

  norm := nullif(right(regexp_replace(coalesce(tel,''), '\D', '', 'g'), 10), '');
  if norm is null then
    return false;
  end if;
  return exists (select 1 from public.personas p where p.telefono_norm = norm);
end $$;

revoke all on function public.telefono_ya_registrado(text) from public;
revoke all on function public.normalizar_telefono(text) from public;
revoke all on function public.seccion_por_punto(double precision, double precision) from public;
revoke all on function public.hoy_oaxaca() from public;
grant execute on function public.telefono_ya_registrado(text) to authenticated;
grant execute on function public.normalizar_telefono(text) to authenticated;
grant execute on function public.seccion_por_punto(double precision, double precision) to authenticated;
-- Valor por omisión de fechas y base de v_cumpleanos_hoy y v_seccion_resumen: quien inserta o
-- consulta tiene que poder ejecutarla.
grant execute on function public.hoy_oaxaca() to authenticated;

-- ---------------------------------------------------------------------------
-- 3b. Marcar una actividad en curso
-- ---------------------------------------------------------------------------
-- El brigadista sube la foto de inicio y con eso la actividad arranca. Pero NO puede tener
-- permiso de UPDATE sobre `actividades`: RLS es por renglón, no por columna, así que una política
-- que le dejara poner `en_curso` también le dejaría cambiar el nombre, la fecha o el objetivo.
--
-- Por eso va una función que solo sabe hacer una cosa: pasar de `programada` a `en_curso` sobre
-- una actividad a la que el que llama está invitado. El `where estatus = 'programada'` impide
-- además revivir una cerrada. Probado: con la suya devuelve true; con una a la que nadie lo
-- invitó, false; repetida, false; y por la vía normal no puede cambiar ni el nombre ni cerrarla.
create or replace function public.marcar_actividad_en_curso(a_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare movidas integer;
begin
  if auth.uid() is null then
    raise exception 'Se requiere sesión';
  end if;
  if not exists (select 1 from public.usuarios u where u.id = auth.uid() and u.activo) then
    raise exception 'Usuario sin acceso';
  end if;

  if not (privado.es_admin() or privado.actividad_abierta_mia(a_id)) then
    return false;
  end if;

  update public.actividades
     set estatus = 'en_curso'
   where id = a_id and estatus = 'programada';

  get diagnostics movidas = row_count;
  return movidas > 0;
end $$;

revoke all on function public.marcar_actividad_en_curso(uuid) from public;
grant execute on function public.marcar_actividad_en_curso(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3c. Escribir la conclusión general de una actividad
-- ---------------------------------------------------------------------------
-- Pedido del cliente (9 de octubre de 2026): el brigadista también escribe la conclusión general.
-- Mismo razonamiento que 3b: no se le da UPDATE sobre `actividades`, se le da una función que solo
-- toca la columna `conclusion`, solo mientras la actividad siga abierta y solo si está invitado.
-- Cerrar sigue siendo del administrador; al cerrar ve este texto ya escrito y puede ajustarlo.
-- Es un solo campo compartido: si escriben dos brigadistas, queda lo último que se guardó.
create or replace function public.guardar_conclusion_actividad(a_id uuid, texto text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare movidas integer;
begin
  if auth.uid() is null then
    raise exception 'Se requiere sesión';
  end if;
  if not exists (select 1 from public.usuarios u where u.id = auth.uid() and u.activo) then
    raise exception 'Usuario sin acceso';
  end if;
  if length(texto) > 4000 then
    raise exception 'La conclusión es demasiado larga';
  end if;

  if not (privado.es_admin() or privado.actividad_abierta_mia(a_id)) then
    return false;
  end if;

  update public.actividades
     set conclusion = nullif(btrim(texto), '')
   where id = a_id and estatus in ('programada', 'en_curso');

  get diagnostics movidas = row_count;
  return movidas > 0;
end $$;

revoke all on function public.guardar_conclusion_actividad(uuid, text) from public;
revoke all on function public.guardar_conclusion_actividad(uuid, text) from anon;
grant execute on function public.guardar_conclusion_actividad(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3d. Eliminar una actividad con todo lo que se registró en ella
-- ---------------------------------------------------------------------------
-- Pedido del cliente (10 de octubre de 2026). Solo el administrador. Es borrado de verdad, no
-- baja lógica: la actividad deja de existir y con ella lo que se capturó ahí.
--
-- Una sola función para contar y para borrar (`solo_contar`), para que la confirmación que ve el
-- administrador salga de la misma regla que el borrado y no pueda decir una cosa y hacer otra.
--
-- Qué se borra:
--   · la actividad, sus invitaciones y sus fotos (las dos últimas en cascada);
--   · todas las participaciones en ella, sus menciones (cascada) y sus solicitudes;
--   · las personas que se registraron por primera vez en ella (`actividad_origen`).
-- Qué NO se borra, aunque se haya registrado ahí: una persona que además participó en otra
-- actividad, que tiene seguimientos o que es representante de casilla. Esa persona ya es de otro
-- trabajo; se conserva y solo se le quita el vínculo de origen. Borrarla se llevaría datos de
-- actividades que nadie pidió tocar.
--
-- Los archivos de Storage no se pueden borrar desde SQL. La función regresa sus rutas y el
-- cliente los borra con la API de Storage, que ya le permite borrar al administrador.
create or replace function public.eliminar_actividad(a_id uuid, solo_contar boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_nombre text;
  v_participaciones uuid[];
  v_borrar uuid[];
  v_conservar uuid[];
  v_rutas text[];
  v_resumen jsonb;
begin
  if auth.uid() is null then
    raise exception 'Se requiere sesión';
  end if;
  if not privado.es_admin() then
    raise exception 'Solo el administrador puede eliminar actividades';
  end if;

  select nombre into v_nombre from public.actividades where id = a_id;
  if v_nombre is null then
    return null;
  end if;

  select coalesce(array_agg(id), '{}') into v_participaciones
    from public.participaciones where actividad_id = a_id;

  select coalesce(array_agg(p.id) filter (where libre), '{}'),
         coalesce(array_agg(p.id) filter (where not libre), '{}')
    into v_borrar, v_conservar
    from (
      select p.id,
             not exists (select 1 from public.participaciones o
                          where o.persona_id = p.id and o.actividad_id is distinct from a_id)
         and not exists (select 1 from public.seguimientos s where s.persona_id = p.id)
         and not exists (select 1 from public.representantes_casilla r where r.persona_id = p.id)
             as libre
        from public.personas p
       where p.actividad_origen = a_id
    ) p;

  select coalesce(array_agg(name), '{}') into v_rutas
    from storage.objects
   where bucket_id = 'fotos' and name like 'actividades/' || a_id::text || '/%';

  v_resumen := jsonb_build_object(
    'nombre', v_nombre,
    'personas_borradas', cardinality(v_borrar),
    'personas_conservadas', cardinality(v_conservar),
    'participaciones', cardinality(v_participaciones),
    'menciones', (select count(*) from public.menciones_problematica
                   where participacion_id = any(v_participaciones)),
    'solicitudes', (select count(*) from public.solicitudes
                     where participacion_id = any(v_participaciones)
                        or persona_id = any(v_borrar)),
    'fotos', (select count(*) from public.fotos where actividad_id = a_id),
    'invitaciones', (select count(*) from public.actividad_brigadistas where actividad_id = a_id),
    'rutas', to_jsonb(v_rutas)
  );

  if solo_contar then
    return v_resumen;
  end if;

  delete from public.solicitudes
   where participacion_id = any(v_participaciones) or persona_id = any(v_borrar);
  delete from public.participaciones where id = any(v_participaciones);
  update public.personas set promotor_id = null where promotor_id = any(v_borrar);
  perform set_config('soet.desligar_origen', 'on', true);
  update public.personas set actividad_origen = null where id = any(v_conservar);
  perform set_config('soet.desligar_origen', 'off', true);
  delete from public.personas where id = any(v_borrar);
  delete from public.actividades where id = a_id;

  return v_resumen;
end $$;

revoke all on function public.eliminar_actividad(uuid, boolean) from public;
revoke all on function public.eliminar_actividad(uuid, boolean) from anon;
grant execute on function public.eliminar_actividad(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3e. Eliminar una persona con su historia
-- ---------------------------------------------------------------------------
-- Pedido del cliente (13 de octubre de 2026). Solo el administrador, con doble confirmación en la
-- interfaz. Es borrado de verdad, igual que eliminar_actividad, y por la misma razón es una sola
-- función para contar y para borrar: lo que ve el administrador antes de confirmar sale de la
-- misma regla que lo que se borra.
--
-- Qué se borra: la persona, sus participaciones (y con ellas sus menciones, en cascada), sus
-- solicitudes y sus seguimientos. Todo eso es suyo y sin ella no significa nada.
--
-- Qué NO se borra:
--   · Las personas que ella trajo (`promotor_id`). Se conservan y solo pierden el vínculo.
--   · Su registro como representante de casilla. Ese renglón guarda su propia copia de nombre y
--     teléfono porque es un dato de la casilla, no del padrón; borrarlo dejaría la casilla
--     descubierta sin que nadie lo decidiera. Se desliga y se avisa en la confirmación, para que
--     el administrador lo quite desde la casilla si eso es lo que quiere.
create or replace function public.eliminar_persona(p_id uuid, solo_contar boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_nombre text;
  v_participaciones uuid[];
  v_resumen jsonb;
begin
  if auth.uid() is null then
    raise exception 'Se requiere sesión';
  end if;
  if not privado.es_admin() then
    raise exception 'Solo el administrador puede eliminar personas';
  end if;

  select nombre into v_nombre from public.personas where id = p_id;
  if v_nombre is null then
    return null;
  end if;

  select coalesce(array_agg(id), '{}') into v_participaciones
    from public.participaciones where persona_id = p_id;

  v_resumen := jsonb_build_object(
    'nombre', v_nombre,
    'participaciones', cardinality(v_participaciones),
    'menciones', (select count(*) from public.menciones_problematica
                   where participacion_id = any(v_participaciones)),
    'solicitudes', (select count(*) from public.solicitudes
                     where persona_id = p_id or participacion_id = any(v_participaciones)),
    'seguimientos', (select count(*) from public.seguimientos where persona_id = p_id),
    'promovidos', (select count(*) from public.personas where promotor_id = p_id),
    'representante', (select count(*) from public.representantes_casilla where persona_id = p_id)
  );

  if solo_contar then
    return v_resumen;
  end if;

  delete from public.solicitudes
   where persona_id = p_id or participacion_id = any(v_participaciones);
  delete from public.participaciones where id = any(v_participaciones);
  delete from public.seguimientos where persona_id = p_id;
  update public.personas set promotor_id = null where promotor_id = p_id;
  update public.representantes_casilla set persona_id = null where persona_id = p_id;
  delete from public.personas where id = p_id;

  return v_resumen;
end $$;

revoke all on function public.eliminar_persona(uuid, boolean) from public;
revoke all on function public.eliminar_persona(uuid, boolean) from anon;
grant execute on function public.eliminar_persona(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS en todas las tablas
-- ---------------------------------------------------------------------------
-- Sin excepciones. Una tabla de public sin RLS es una tabla abierta.

do $$
declare t text;
begin
  foreach t in array array[
    'demarcaciones','secciones','colonias','colonia_seccion','secciones_geom',
    'usuarios','asignaciones_responsable','importaciones','personas','actividades',
    'actividad_brigadistas','participaciones','problematicas','menciones_problematica',
    'solicitudes','seguimientos','fotos','casillas','representantes_casilla',
    'resultados_historicos','reportes_territorio'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Catálogo territorial y de referencia
-- ---------------------------------------------------------------------------
-- Dos listas, porque no todos los usuarios activos necesitan lo mismo.
--
-- `problematicas` la lee cualquier usuario activo, incluido el brigadista: son diez renglones sin
-- un solo dato personal, y sin leerlas el bloque de problemáticas del registro **desaparece sin
-- avisar**, que es justo el dato cualitativo por el que existe la actividad.
--
-- El resto del catálogo lo leen solo admin y roles territoriales. Escribir, solo el admin.

create policy problematicas_lectura on problematicas for select
  to authenticated using ((select privado.es_usuario_activo()));

do $$
declare t text;
begin
  foreach t in array array[
    'demarcaciones','secciones','secciones_geom','colonias','colonia_seccion',
    'casillas','resultados_historicos','asignaciones_responsable'
  ]
  loop
    execute format($f$
      create policy %1$s_lectura on public.%1$I for select
        to authenticated using ((select privado.ve_catalogo()));
    $f$, t);
  end loop;
end $$;

-- La escritura del catálogo completo, problemáticas incluidas: solo el admin.
do $$
declare t text;
begin
  foreach t in array array[
    'demarcaciones','secciones','secciones_geom','colonias','colonia_seccion',
    'problematicas','casillas','resultados_historicos','asignaciones_responsable'
  ]
  loop
    execute format($f$
      create policy %1$s_admin_inserta on public.%1$I for insert
        to authenticated with check ((select privado.es_admin()));
      create policy %1$s_admin_actualiza on public.%1$I for update
        to authenticated using ((select privado.es_admin()))
                         with check ((select privado.es_admin()));
      create policy %1$s_admin_borra on public.%1$I for delete
        to authenticated using ((select privado.es_admin()));
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Usuarios
-- ---------------------------------------------------------------------------
-- Cada quien ve su propia fila. El admin ve todas y es el único que da de alta, cambia rol
-- o desactiva.

create policy usuarios_ve_su_fila on usuarios for select to authenticated
  using (id = (select auth.uid()) or (select privado.es_admin()));
create policy usuarios_admin_inserta on usuarios for insert to authenticated
  with check ((select privado.es_admin()));
create policy usuarios_admin_actualiza on usuarios for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy usuarios_admin_borra on usuarios for delete to authenticated
  using ((select privado.es_admin()));

-- ---------------------------------------------------------------------------
-- 7. Solo admin, sin excepción
-- ---------------------------------------------------------------------------
-- Importaciones, seguimiento y representantes de casilla son trabajo de gabinete, no de
-- campo. El brigadista no los toca ni los ve.

do $$
declare t text;
begin
  foreach t in array array['importaciones','seguimientos','representantes_casilla']
  loop
    execute format($f$
      create policy %1$s_solo_admin on public.%1$I for all
        to authenticated using ((select privado.es_admin()))
                         with check ((select privado.es_admin()));
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 8. Una política por tabla y por acción
-- ---------------------------------------------------------------------------
-- Antes había dos políticas por acción en siete tablas: una `FOR ALL` del admin y una del
-- brigadista. Las permisivas se unen con OR, así que el comportamiento era el mismo, pero
-- Postgres evaluaba las dos en cada renglón —en personas, con decenas de miles, eso se paga en
-- el tablero y el mapa— y la regla completa de una tabla había que leerla en dos lugares.
--
-- **No se vuelve a escribir un `FOR ALL` en estas tablas.** El `FOR ALL` es lo que generó los
-- trece duplicados.
--
-- Dos cosas que hay que trasladar palabra por palabra al tocar esto:
--
-- 1. La envoltura `(select ...)` va **solo** donde la expresión no referencia columnas, porque se
--    eleva a InitPlan y se evalúa una vez por sentencia. Donde la función recibe una columna del
--    renglón va sin envolver: envuelta se vuelve un subplan correlacionado y la política falla en
--    los `INSERT ... SELECT` que arma PostgREST. Mezclar las dos mitades en un mismo `or` es
--    correcto: la mitad envuelta se sigue elevando.
-- 2. La política de lectura de `personas` no se "simplifica" llamando a
--    `privado.persona_en_actividad_mia(id)`. Ver la nota de esa función.

-- ---- actividades ----
create policy actividades_select on actividades for select to authenticated
  using ((select privado.es_admin()) or privado.actividad_abierta_mia(id));
create policy actividades_insert on actividades for insert to authenticated
  with check ((select privado.es_admin()));
create policy actividades_update on actividades for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy actividades_delete on actividades for delete to authenticated
  using ((select privado.es_admin()));

-- ---- actividad_brigadistas: la invitación ----
-- El brigadista sigue viendo su propio renglón incluso tras el cierre de la actividad. Es un
-- residuo deliberado: es su propio registro de invitación, y esconderlo le quitaría la lista de
-- "a qué me han invitado". Que no desaparezca de pasada en un refactor.
create policy actividad_brigadistas_select on actividad_brigadistas for select to authenticated
  using ((select privado.es_admin()) or usuario_id = (select auth.uid()));
create policy actividad_brigadistas_insert on actividad_brigadistas for insert to authenticated
  with check ((select privado.es_admin()));
create policy actividad_brigadistas_update on actividad_brigadistas for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy actividad_brigadistas_delete on actividad_brigadistas for delete to authenticated
  using ((select privado.es_admin()));

-- ---- personas ----
-- Se evalúa contra la columna del propio renglón y NO releyendo la tabla, por lo explicado en
-- privado.persona_en_actividad_mia: esa función es STABLE y en un INSERT ... RETURNING el renglón
-- nuevo todavía no está en su instantánea, así que el capturista se quedaría sin ver su captura.
create policy personas_select on personas for select to authenticated
  using (
    (select privado.es_admin())
    or privado.actividad_abierta_mia(actividad_origen)
    or exists (
      select 1 from participaciones pa
      where pa.persona_id = personas.id
        and privado.actividad_abierta_mia(pa.actividad_id)
    )
  );

-- Toda captura de campo queda amarrada a una actividad abierta del brigadista, lo que de paso
-- hace imposible la captura suelta.
create policy personas_insert on personas for insert to authenticated
  with check (
    (select privado.es_admin())
    or (registrada_por = (select auth.uid())
        and privado.actividad_abierta_mia(actividad_origen))
  );

create policy personas_update on personas for update to authenticated
  using (
    (select privado.es_admin())
    or (registrada_por = (select auth.uid())
        and privado.actividad_abierta_mia(actividad_origen))
  )
  with check (
    (select privado.es_admin())
    or (registrada_por = (select auth.uid())
        and privado.actividad_abierta_mia(actividad_origen))
  );

create policy personas_delete on personas for delete to authenticated
  using ((select privado.es_admin()));

-- ---- participaciones ----
create policy participaciones_select on participaciones for select to authenticated
  using ((select privado.es_admin()) or privado.actividad_abierta_mia(actividad_id));
create policy participaciones_insert on participaciones for insert to authenticated
  with check ((select privado.es_admin())
              or (registrada_por = (select auth.uid())
                  and privado.actividad_abierta_mia(actividad_id)));
-- UPDATE hace falta aunque la aplicación nunca "edite" una participación: registrarParticipacion
-- usa upsert con ignoreDuplicates: false, que Postgres compila a INSERT ... ON CONFLICT DO UPDATE
-- y comprueba esta política. Sin ella, recapturar a la misma persona en la misma actividad
-- rebota, y en campo eso pasa todo el tiempo.
create policy participaciones_update on participaciones for update to authenticated
  using ((select privado.es_admin())
         or (registrada_por = (select auth.uid())
             and privado.actividad_abierta_mia(actividad_id)))
  with check ((select privado.es_admin())
              or (registrada_por = (select auth.uid())
                  and privado.actividad_abierta_mia(actividad_id)));
create policy participaciones_delete on participaciones for delete to authenticated
  using ((select privado.es_admin()));

-- ---- menciones_problematica ----
-- Mismo caso del upsert que en participaciones, con onConflict sobre (participacion, problematica).
create policy menciones_select on menciones_problematica for select to authenticated
  using ((select privado.es_admin())
         or exists (select 1 from participaciones pa
                    where pa.id = participacion_id
                      and privado.actividad_abierta_mia(pa.actividad_id)));
create policy menciones_insert on menciones_problematica for insert to authenticated
  with check ((select privado.es_admin())
              or exists (select 1 from participaciones pa
                         where pa.id = participacion_id
                           and privado.actividad_abierta_mia(pa.actividad_id)));
create policy menciones_update on menciones_problematica for update to authenticated
  using ((select privado.es_admin())
         or exists (select 1 from participaciones pa
                    where pa.id = participacion_id
                      and privado.actividad_abierta_mia(pa.actividad_id)))
  with check ((select privado.es_admin())
              or exists (select 1 from participaciones pa
                         where pa.id = participacion_id
                           and privado.actividad_abierta_mia(pa.actividad_id)));
create policy menciones_delete on menciones_problematica for delete to authenticated
  using ((select privado.es_admin()));

-- ---- solicitudes ----
-- Aquí persona_en_actividad_mia SÍ es correcta: apunta a una persona que ya existía antes de la
-- sentencia, así que la instantánea de la función la alcanza.
create policy solicitudes_select on solicitudes for select to authenticated
  using ((select privado.es_admin()) or privado.persona_en_actividad_mia(persona_id));
create policy solicitudes_insert on solicitudes for insert to authenticated
  with check ((select privado.es_admin()) or privado.persona_en_actividad_mia(persona_id));
create policy solicitudes_update on solicitudes for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy solicitudes_delete on solicitudes for delete to authenticated
  using ((select privado.es_admin()));

-- ---- fotos (la tabla; el bucket va en la sección 9) ----
create policy fotos_select on fotos for select to authenticated
  using ((select privado.es_admin()) or privado.actividad_abierta_mia(actividad_id));
create policy fotos_insert on fotos for insert to authenticated
  with check ((select privado.es_admin())
              or (subida_por = (select auth.uid())
                  and privado.actividad_abierta_mia(actividad_id)));
create policy fotos_update on fotos for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy fotos_delete on fotos for delete to authenticated
  using ((select privado.es_admin()));

-- ---------------------------------------------------------------------------
-- 9. Almacenamiento de fotos
-- ---------------------------------------------------------------------------
-- El bucket es PRIVADO: todas las operaciones, incluida la descarga, pasan por estas políticas, y
-- las imágenes se entregan con URL firmada temporal. Por eso `fotos.url` guarda la **ruta** dentro
-- del bucket y no una URL: una firma caduca, y persistirla haría que la columna se pudriera sola.
--
-- 512000 bytes porque components/actividades/comprimir.ts ya rechaza arriba de 400 KB. Ese tope sí
-- respalda al compresor: el tamaño lo mide el servidor, así que una subida que no pase por el
-- compresor tampoco entra.
--
-- La lista de tipos **no** respalda nada, y hay que leerla sabiéndolo: Storage compara el
-- `Content-Type` que **declara el cliente**, no los bytes del archivo. Así que se puede subir
-- cualquier cosa de hasta 500 KB etiquetándola image/webp. Lo que de verdad valida la imagen es
-- createImageBitmap() más el reencode por canvas del compresor —que además tira el EXIF, con sus
-- coordenadas GPS—, y eso es código de navegador, o sea opcional. Está anotado en
-- AUDITORIA-SEGURIDAD.md, hallazgo 7, con la decisión pendiente de validar bytes en el servidor.
--
-- WebP y JPEG son lo que produce el compresor: Safari de iPhone no codifica WebP desde canvas y
-- ahí cae a JPEG.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 512000, array['image/webp', 'image/jpeg'])
on conflict (id) do update set allowed_mime_types = excluded.allowed_mime_types;

-- Convención de ruta: actividades/<actividad_id>/<archivo>.webp (o .jpg)
--                     reportes/<usuario_id>/<archivo>.webp (o .jpg), la foto de un reporte del
--                     territorio. La carpeta es el id de quien lo levantó, así que la lectura
--                     sigue la misma regla que la tabla: el administrador todas, cada quien las
--                     suyas.
--
-- Este envoltorio existe porque `(storage.foldername(name))[2]::uuid` **lanza** 22P02 si ese
-- segmento no es un uuid, y una excepción dentro de una política no es un "no": es un error 500
-- que rompe la pantalla. Aquí devuelve null, y actividad_abierta_mia(null) es falso, así que la
-- política NIEGA en lugar de reventar. Probado con 'basura/x.webp' y con
-- 'actividades/no-es-uuid/x.webp': las dos dan rechazo de política, no 500.
create or replace function privado.actividad_de_ruta(ruta text)
returns uuid language plpgsql immutable security definer set search_path = '' as $$
begin
  if ruta is null or ruta not like 'actividades/%' then
    return null;
  end if;
  return (storage.foldername(ruta))[2]::uuid;
exception when others then
  return null;
end $$;

revoke all on function privado.actividad_de_ruta(text) from public;
grant execute on function privado.actividad_de_ruta(text) to authenticated;

-- Nombres con prefijo `almacen_` para no confundirlas con las de la tabla public.fotos.
-- Nota operativa: el rol del servidor MCP puede crear y borrar políticas en storage.objects pero
-- no renombrarlas, porque no es dueño de esa tabla. Si hay que cambiarles el nombre, se borran y
-- se recrean.
-- La rama de reportes compara texto: storage.foldername no lanza con rutas raras, a lo más
-- devuelve null y la comparación da falso. `(select auth.uid())` va envuelto solo porque no toca
-- columnas; `name` queda afuera (regla 1 de la sección 8).
create policy almacen_fotos_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos'
         and ((select privado.es_admin())
              or privado.actividad_abierta_mia(privado.actividad_de_ruta(name))
              or ((storage.foldername(name))[1] = 'reportes'
                  and (storage.foldername(name))[2] = (select auth.uid())::text)));

-- **Sin política de INSERT, y es a propósito.** La había, y era correcta en lo que comprobaba:
-- quién sube y a qué carpeta. Lo que no podía comprobar era **qué** se sube, porque Storage
-- compara el `Content-Type` que declara el cliente, no los bytes. Medido el 11 de octubre de 2026
-- con una sesión real de brigadista: un POST directo con texto plano y la cabecera
-- `content-type: image/webp` subió con 200.
--
-- Ahora la subida pasa por `app/api/fotos/route.ts`, que valida la firma de los bytes, quita los
-- metadatos (el EXIF de una foto de celular lleva el identificador del dispositivo), nombra el
-- archivo —para que la ruta no la elija el cliente— y escribe con la llave secreta, que se salta
-- RLS. La autorización no se reimplementa ahí: el handler le pregunta a esta misma base, con el
-- cliente de la petición, si alcanza esa actividad abierta.
--
-- Sin política de INSERT, `authenticated` no tiene segundo camino. Verificado después del cambio:
-- la subida directa devuelve "new row violates row-level security policy" y el handler sigue
-- subiendo.
--
-- Si algún día se vuelve a abrir la subida directa, hay que recordar que `almacen_fotos_select`
-- se queda como está: el brigadista necesita leer para firmar las URL de su galería.

-- Borrar, solo el admin: una foto es evidencia y el brigadista no la retira.
create policy almacen_fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (select privado.es_admin()));

-- Sin política de UPDATE a propósito: los nombres llevan marca de tiempo y azar, así que nunca se
-- sobreescribe un objeto. Sin UPDATE, un upsert de Storage rebota, que es lo que se quiere.

-- ---------------------------------------------------------------------------
-- 10. Sellado de columnas calculadas
-- ---------------------------------------------------------------------------
-- **RLS decide qué renglón tocas. No decide qué columna.** Y el grant es por tabla, así que
-- `authenticated` tiene UPDATE sobre las 256 columnas de las 27 relaciones de public. Hasta el
-- 10 de octubre de 2026 eso significaba que cualquiera con la consola del navegador abierta
-- podía afirmar `registrada_por`, `promovido_por`, `created_at` o `telefono_norm` a su gusto: la
-- política lo dejaba pasar porque el renglón sí era suyo. Un brigadista podía marcar a alguien
-- como promovido por otra persona, o fechar su captura el año pasado.
--
-- Estos triggers son la pieza que faltaba. Son la forma en que la base cumple por fin la regla
-- del CLAUDE.md que dice "nada de lo que el sistema puede calcular se le pide al usuario": antes
-- esa regla la cumplía solo la aplicación, de buena voluntad, y la buena voluntad no es un
-- control de acceso.
--
-- Son SECURITY DEFINER por un motivo concreto y no por costumbre: resolver la sección desde la
-- coordenada necesita leer `secciones_geom`, y al brigadista el catálogo territorial está cerrado
-- (`ve_catalogo` lo excluye). Con SECURITY INVOKER el trigger devolvería null justo para quien
-- captura en la calle, que es el único que trae coordenada.
--
-- Todos llevan la misma guarda: si `auth.uid()` es null no hay sesión, o sea que quien escribe es
-- la llave secreta —sembrado, respaldo, consola de Supabase—. Ahí no se impone autoría ni fecha,
-- porque una restauración necesita conservar las originales, pero sí se normaliza el teléfono y
-- se resuelve la sección, que son integridad del dato y no autoría. No es un hueco: quien tiene
-- la llave secreta ya se salta RLS entera.
--
-- Los `raise exception` usan P0001 a propósito. La tabla de códigos de lib/datos/cliente.ts no
-- traduce ese código, así que el mensaje en español llega entero a la pantalla; con 23514 se
-- cambiaría por "Algún dato no cumple el formato que espera la base", que no dice nada.

-- Misma regla que normalizarTelefono de lib/territorio.ts: solo dígitos, los últimos diez, null
-- si no queda nada. Las dos rutas tienen que dar el mismo resultado o la deduplicación miente.
create or replace function privado.normalizar_telefono(crudo text)
returns text language sql immutable set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(crudo, ''), '\D', '', 'g'), 10), '');
$$;

-- ---- personas ----
create or replace function privado.sellar_persona()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  hay_sesion boolean := auth.uid() is not null;
  desde_punto text;
begin
  -- Llave de deduplicación: la calcula la base siempre, con sesión o sin ella.
  new.telefono_norm := privado.normalizar_telefono(new.telefono_raw);

  -- Nombre en tres partes (11 de octubre de 2026). `nombre` queda como el nombre completo y lo
  -- arma la base: búsquedas, listados y fichas lo siguen leyendo sin saber de las partes. Si no
  -- vienen partes (carga masiva, renglones viejos), `nombre` se respeta tal cual llegó.
  new.nombres          := nullif(btrim(new.nombres), '');
  new.apellido_paterno := nullif(btrim(new.apellido_paterno), '');
  new.apellido_materno := nullif(btrim(new.apellido_materno), '');
  if new.nombres is not null or new.apellido_paterno is not null then
    new.nombre := concat_ws(' ', new.nombres, new.apellido_paterno, new.apellido_materno);
  end if;

  -- "La sección electoral es la única unidad territorial exacta" y "nada de pedir la sección
  -- cuando hay coordenada". Si hay punto, el punto manda y lo que mandó el cliente no cuenta.
  -- Si el punto cae fuera de toda geometría se respeta lo que venga: las seis secciones
  -- sustitutas no tienen geometría publicada y colgar ahí la captura sería peor que confiar.
  if new.lat is not null and new.lng is not null then
    desde_punto := public.seccion_por_punto(new.lng, new.lat);
    if desde_punto is not null then
      new.seccion_clave := desde_punto;
    end if;
  end if;

  if tg_op = 'INSERT' then
    if hay_sesion then
      new.registrada_por := auth.uid();
      new.created_at     := now();
      -- El consentimiento se fecha cuando se otorga, y se otorga en el alta. aviso_version y
      -- consentimiento_en se escriben juntos en formulario-registro.tsx y en ningún otro lado.
      new.consentimiento_en := case when new.aviso_version is not null then now() end;
    end if;
    if new.es_promovido then
      new.promovido_en  := coalesce(case when hay_sesion then now() end, new.promovido_en, now());
      new.promovido_por := coalesce(auth.uid(), new.promovido_por);
    else
      new.promovido_en  := null;
      new.promovido_por := null;
    end if;
    return new;
  end if;

  -- UPDATE: lo que cuenta la historia del renglón no se reescribe nunca.
  new.id                := old.id;
  new.created_at        := old.created_at;
  new.registrada_por    := old.registrada_por;
  -- Única excepción: `eliminar_actividad` puede vaciarlo (nunca cambiarlo por otro) a las personas
  -- que conserva, porque si no, la actividad no se podría borrar. La marca es local a la
  -- transacción de esa función; set_config no está expuesto por PostgREST, así que un cliente no
  -- la puede poner. El coalesce no es adorno: sin marca, current_setting da NULL, el `if` no
  -- entra y el campo quedaría desprotegido.
  if not (new.actividad_origen is null
          and coalesce(current_setting('soet.desligar_origen', true), '') = 'on') then
    new.actividad_origen := old.actividad_origen;
  end if;
  new.importacion_id    := old.importacion_id;
  new.consentimiento_en := old.consentimiento_en;
  new.aviso_version     := old.aviso_version;

  -- La promoción se sella en la transición, no en cada guardado: corregirle el teléfono a alguien
  -- promovido hace tres semanas no le mueve la fecha ni le cambia quién lo promovió.
  if new.es_promovido and not old.es_promovido then
    new.promovido_en  := now();
    new.promovido_por := coalesce(auth.uid(), new.promovido_por);
  elsif not new.es_promovido then
    new.promovido_en  := null;
    new.promovido_por := null;
  else
    new.promovido_en  := old.promovido_en;
    new.promovido_por := old.promovido_por;
  end if;

  return new;
end $$;

drop trigger if exists sellar_persona on public.personas;
create trigger sellar_persona before insert or update on public.personas
  for each row execute function privado.sellar_persona();

-- ---- participaciones ----
-- Quién capturó a quién en qué actividad es la columna sobre la que se apoya toda la atribución
-- del sistema. En el UPDATE del upsert se conserva la del primer captor: una recaptura de la
-- misma persona en la misma actividad no reescribe la autoría.
create or replace function privado.sellar_participacion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.registrada_por := auth.uid();
      new.created_at     := now();
    end if;
    return new;
  end if;

  new.id             := old.id;
  new.persona_id     := old.persona_id;
  new.actividad_id   := old.actividad_id;
  new.registrada_por := old.registrada_por;
  new.created_at     := old.created_at;
  return new;
end $$;

drop trigger if exists sellar_participacion on public.participaciones;
create trigger sellar_participacion before insert or update on public.participaciones
  for each row execute function privado.sellar_participacion();

-- ---- fotos ----
-- `url` guarda la ruta dentro de la cubeta y es inmutable: si se pudiera reapuntar, una foto de
-- evidencia podría cambiarse por otra sin que quede rastro de la sustitución.
create or replace function privado.sellar_foto()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.subida_por := auth.uid();
      new.created_at := now();
    end if;
    return new;
  end if;

  new.id           := old.id;
  new.actividad_id := old.actividad_id;
  new.url          := old.url;
  new.subida_por   := old.subida_por;
  new.created_at   := old.created_at;
  return new;
end $$;

drop trigger if exists sellar_foto on public.fotos;
create trigger sellar_foto before insert or update on public.fotos
  for each row execute function privado.sellar_foto();

-- ---- actividades ----
-- El cierre se sella en la transición a `realizada`, que es el momento en que el brigadista
-- pierde el acceso. Esa fecha es la prueba de cuándo lo perdió, así que no la escribe el cliente.
create or replace function privado.sellar_actividad()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.created_at := now();
    end if;
    if new.estatus <> 'realizada' then
      new.cerrada_en  := null;
      new.cerrada_por := null;
    end if;
    return new;
  end if;

  new.id         := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;

  if new.estatus = 'realizada' and old.estatus <> 'realizada' then
    new.cerrada_en  := now();
    new.cerrada_por := coalesce(auth.uid(), new.cerrada_por);
  elsif new.estatus <> 'realizada' then
    new.cerrada_en  := null;
    new.cerrada_por := null;
  else
    new.cerrada_en  := old.cerrada_en;
    new.cerrada_por := old.cerrada_por;
  end if;

  return new;
end $$;

drop trigger if exists sellar_actividad on public.actividades;
create trigger sellar_actividad before insert or update on public.actividades
  for each row execute function privado.sellar_actividad();

-- ---- representantes_casilla ----
-- Aquí no hay telefono_raw: el cliente escribe telefono_norm directo, así que se normaliza en su
-- sitio para que lo guardado sea canónico aunque se teclee con guiones o con lada.
create or replace function privado.sellar_representante()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.telefono_norm := privado.normalizar_telefono(new.telefono_norm);

  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.registrado_por := auth.uid();
      new.created_at     := now();
    end if;
    return new;
  end if;

  new.id             := old.id;
  new.registrado_por := old.registrado_por;
  new.created_at     := old.created_at;
  return new;
end $$;

drop trigger if exists sellar_representante on public.representantes_casilla;
create trigger sellar_representante before insert or update on public.representantes_casilla
  for each row execute function privado.sellar_representante();

-- ---- importaciones ----
-- Una carga masiva cambia el padrón de golpe; quién respondió por ella no es negociable.
create or replace function privado.sellar_importacion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.importada_por := auth.uid();
      new.created_at    := now();
    end if;
    return new;
  end if;

  new.id            := old.id;
  new.importada_por := old.importada_por;
  new.created_at    := old.created_at;
  return new;
end $$;

drop trigger if exists sellar_importacion on public.importaciones;
create trigger sellar_importacion before insert or update on public.importaciones
  for each row execute function privado.sellar_importacion();

-- ---- seguimientos, solicitudes, casillas ----
-- Solo la fecha de captura. El resto de sus columnas son decisiones de quien captura, no hechos
-- que el sistema conozca.
create or replace function privado.sellar_fecha_captura()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_at := now(); end if;
    return new;
  end if;
  new.created_at := old.created_at;
  return new;
end $$;

drop trigger if exists sellar_fecha_captura on public.seguimientos;
create trigger sellar_fecha_captura before insert or update on public.seguimientos
  for each row execute function privado.sellar_fecha_captura();

drop trigger if exists sellar_fecha_captura on public.solicitudes;
create trigger sellar_fecha_captura before insert or update on public.solicitudes
  for each row execute function privado.sellar_fecha_captura();

drop trigger if exists sellar_fecha_captura on public.casillas;
create trigger sellar_fecha_captura before insert or update on public.casillas
  for each row execute function privado.sellar_fecha_captura();

-- ---- usuarios ----
-- Dos cosas: la fecha de alta, y el candado del último administrador.
--
-- El candado existe porque no hay servidor de correo. Un admin que se degrada o se desactiva
-- siendo el único activo deja la plataforma sin nadie que pueda reponer una contraseña, incluida
-- la suya, y sin forma de recuperarla. Se comprueba sobre el estado ANTERIOR del renglón para que
-- la cuenta de un segundo admin desbloquee la operación en cuanto exista.
create or replace function privado.sellar_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_at := now(); end if;
    return new;
  end if;

  new.id         := old.id;
  new.created_at := old.created_at;

  if old.rol = 'admin' and old.activo
     and (new.rol <> 'admin' or not new.activo)
     and (select count(*) from public.usuarios u where u.rol = 'admin' and u.activo) <= 1 then
    raise exception 'Eres el único administrador activo. Da de alta a otro antes de cambiar tu rol o desactivarte.'
      using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists sellar_usuario on public.usuarios;
create trigger sellar_usuario before insert or update on public.usuarios
  for each row execute function privado.sellar_usuario();

-- Ninguna de estas funciones se llama a mano. Postgres otorga EXECUTE a PUBLIC en toda función
-- nueva y PUBLIC incluye a anon, así que se revoca igual que en la sección 2.
revoke all on function privado.normalizar_telefono(text) from public;
revoke all on function privado.sellar_persona() from public;
revoke all on function privado.sellar_participacion() from public;
revoke all on function privado.sellar_foto() from public;
revoke all on function privado.sellar_actividad() from public;
revoke all on function privado.sellar_representante() from public;
revoke all on function privado.sellar_importacion() from public;
revoke all on function privado.sellar_fecha_captura() from public;
revoke all on function privado.sellar_usuario() from public;

-- ---------------------------------------------------------------------------
-- 11. Reportes del territorio
-- ---------------------------------------------------------------------------
-- Mismo modelo que el resto del sistema: el administrador ve todo y cualquier otro rol ve lo suyo.
--   · Levantar: cualquier usuario activo, a nombre propio. El trigger sella el autor.
--   · Ver: el administrador, todos; los demás, solo los que levantaron ellos.
--   · Marcar como atendido: solo el administrador. Va por UPDATE normal porque el trigger deja
--     tocar únicamente `atendido`: categoría, descripción, punto, autor y fecha no se reescriben.
--   · Borrar: solo el administrador. La interfaz no lo ofrece; atendido es la salida normal.

create or replace function privado.sellar_reporte_territorio()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.descripcion := btrim(new.descripcion);
    -- El punto manda, igual que en personas: la sección no se le pide a nadie.
    new.seccion_clave := public.seccion_por_punto(new.lng, new.lat);
    new.demarcacion_id := (select s.demarcacion_id from public.secciones s
                            where s.clave = new.seccion_clave);
    if auth.uid() is not null then
      new.levantado_por := auth.uid();
      new.created_at    := now();
    end if;
    -- La foto tiene que estar ya subida, y en la carpeta de quien levanta el reporte. Sin esto
    -- un usuario podría colgarle a su reporte la ruta de una foto ajena (de una actividad o de
    -- otro reporte) y leerla por la ficha. El handler /api/fotos nombra la carpeta con el id de
    -- la sesión, así que una ruta legítima siempre pasa.
    if new.foto_ruta is not null then
      if new.foto_ruta not like 'reportes/' || new.levantado_por::text || '/%'
         or not exists (select 1 from storage.objects o
                         where o.bucket_id = 'fotos' and o.name = new.foto_ruta) then
        -- Sin errcode propio (P0001): cliente.ts no lo traduce y el texto llega tal cual.
        raise exception 'La foto del reporte no es válida. Vuelve a adjuntarla.';
      end if;
    end if;
    -- Un reporte nace pendiente, siempre.
    new.atendido    := false;
    new.atendido_en := null;
    new.atendido_por := null;
    return new;
  end if;

  new.id             := old.id;
  new.categoria      := old.categoria;
  new.descripcion    := old.descripcion;
  new.lat            := old.lat;
  new.lng            := old.lng;
  new.precision_m    := old.precision_m;
  new.seccion_clave  := old.seccion_clave;
  new.demarcacion_id := old.demarcacion_id;
  new.levantado_por  := old.levantado_por;
  new.created_at     := old.created_at;
  new.foto_ruta      := old.foto_ruta;

  if new.atendido and not old.atendido then
    new.atendido_en  := now();
    new.atendido_por := coalesce(auth.uid(), new.atendido_por);
  elsif not new.atendido then
    new.atendido_en  := null;
    new.atendido_por := null;
  else
    new.atendido_en  := old.atendido_en;
    new.atendido_por := old.atendido_por;
  end if;
  return new;
end $$;

revoke all on function privado.sellar_reporte_territorio() from public;

drop trigger if exists sellar_reporte_territorio on public.reportes_territorio;
create trigger sellar_reporte_territorio before insert or update on public.reportes_territorio
  for each row execute function privado.sellar_reporte_territorio();

alter table public.reportes_territorio enable row level security;
revoke all on public.reportes_territorio from anon;

-- `levantado_por = (select auth.uid())`: la envoltura va alrededor de auth.uid(), que no toca
-- columnas, y la columna queda afuera. Ver la regla 1 de la sección 8.
create policy reportes_territorio_select on reportes_territorio for select to authenticated
  using ((select privado.es_admin()) or levantado_por = (select auth.uid()));
create policy reportes_territorio_insert on reportes_territorio for insert to authenticated
  with check ((select privado.es_usuario_activo()) and levantado_por = (select auth.uid()));
create policy reportes_territorio_update on reportes_territorio for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy reportes_territorio_delete on reportes_territorio for delete to authenticated
  using ((select privado.es_admin()));
