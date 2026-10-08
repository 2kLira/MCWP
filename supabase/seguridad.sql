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
grant execute on function public.telefono_ya_registrado(text) to authenticated;
grant execute on function public.normalizar_telefono(text) to authenticated;
grant execute on function public.seccion_por_punto(double precision, double precision) to authenticated;

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
    'resultados_historicos'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Catálogo territorial y de referencia
-- ---------------------------------------------------------------------------
-- Lo lee cualquier usuario activo porque el mapa y la resolución de sección por GPS lo
-- necesitan, y no contiene datos personales. Escribir, solo el admin.

do $$
declare t text;
begin
  foreach t in array array[
    'demarcaciones','secciones','colonias','colonia_seccion','secciones_geom',
    'problematicas','casillas','resultados_historicos','asignaciones_responsable'
  ]
  loop
    execute format($f$
      create policy %1$s_lectura on public.%1$I for select
        to authenticated using ((select privado.es_usuario_activo()));
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
-- 512000 bytes porque components/actividades/comprimir.ts ya rechaza arriba de 400 KB: el tope del
-- bucket es el cinturón que respalda ese tirante, para que una subida que no pase por el compresor
-- tampoco entre. Solo WebP, que es lo único que produce el compresor.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 512000, array['image/webp'])
on conflict (id) do nothing;

-- Convención de ruta: actividades/<actividad_id>/<archivo>.webp
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
create policy almacen_fotos_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos'
         and ((select privado.es_admin())
              or privado.actividad_abierta_mia(privado.actividad_de_ruta(name))));

-- No se comprueba `owner`: cualquier invitado a esa actividad debe poder subir, y la atribución de
-- quién subió la lleva fotos.subida_por en la tabla, no el objeto de Storage. Una condición de más
-- solo agrega formas de fallar.
create policy almacen_fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos'
              and ((select privado.es_admin())
                   or privado.actividad_abierta_mia(privado.actividad_de_ruta(name))));

-- Borrar, solo el admin: una foto es evidencia y el brigadista no la retira.
create policy almacen_fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (select privado.es_admin()));

-- Sin política de UPDATE a propósito: los nombres llevan marca de tiempo y azar, así que nunca se
-- sobreescribe un objeto. Sin UPDATE, un upsert de Storage rebota, que es lo que se quiere.
