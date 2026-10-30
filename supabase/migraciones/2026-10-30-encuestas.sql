-- Encuestas propias con QR. Reemplazan al Google Form: el administrador las arma, el sistema le
-- da un enlace y un QR, y quien lo escanea contesta sin cuenta en /e/<codigo>.
--
-- Estructura: la misma que quedó en supabase/schema.sql, sección "Encuestas".
-- Permisos: los mismos que quedaron en supabase/seguridad.sql, sección 14.
-- Esto es la unión de los dos, para aplicarlo de una vez a una base que ya existe.

begin;

-- ===========================================================================
-- Estructura
-- ===========================================================================

create type tipo_pregunta as enum ('opcion_unica', 'opcion_multiple', 'escala', 'texto');

create table encuestas (
  id               uuid primary key default gen_random_uuid(),
  -- Lo que va en la URL pública. Lo pone guardar_encuesta; no se elige ni se cambia.
  codigo           text not null unique check (codigo ~ '^[a-z0-9]{10}$'),
  titulo           text not null check (length(btrim(titulo)) between 1 and 120),
  descripcion      text check (descripcion is null or length(descripcion) <= 600),
  -- Si pide los datos de la persona antes de las preguntas, como un registro de brigadista.
  incluye_registro boolean not null default false,
  mensaje_final    text check (mensaje_final is null or length(mensaje_final) <= 600),
  -- La baja es cerrar la encuesta, no borrarla: sus respuestas se quedan.
  activa           boolean not null default true,
  creada_por       uuid references usuarios(id),
  created_at       timestamptz not null default now()
);

create table encuesta_preguntas (
  id           uuid primary key default gen_random_uuid(),
  encuesta_id  uuid not null references encuestas(id) on delete cascade,
  orden        integer not null,
  tipo         tipo_pregunta not null,
  texto        text not null check (length(btrim(texto)) between 1 and 300),
  obligatoria  boolean not null default true,
  -- [{ "id": "a1", "texto": "Agua", "mensaje": "…" }]. `mensaje` es opcional: se le muestra al
  -- final a quien eligió esa opción. Vacío en escala y texto.
  opciones     jsonb not null default '[]'::jsonb check (jsonb_typeof(opciones) = 'array'),
  unique (encuesta_id, orden)
);

create table encuesta_respuestas (
  id                     uuid primary key default gen_random_uuid(),
  encuesta_id            uuid not null references encuestas(id),
  -- Solo en encuestas con registro. Si el teléfono ya existía, apunta a esa persona pero su ficha
  -- no se tocó: `telefono_ya_registrado` lo dice, porque nadie verificó que fuera ella.
  persona_id             uuid references personas(id) on delete set null,
  telefono_ya_registrado boolean not null default false,
  -- { "<pregunta_id>": "a1" | ["a1","a3"] | 4 | "texto libre" }. Lo limpia responder_encuesta.
  respuestas             jsonb not null check (jsonb_typeof(respuestas) = 'object'),
  seccion_clave          text references secciones(clave),
  created_at             timestamptz not null default now()
);

create index encuesta_preguntas_encuesta_idx on encuesta_preguntas (encuesta_id, orden);
create index encuesta_respuestas_encuesta_idx on encuesta_respuestas (encuesta_id, created_at desc);
create index encuesta_respuestas_persona_idx on encuesta_respuestas (persona_id);

-- Cuántas respuestas trae cada encuesta. Con left join, para que una recién creada salga en cero.
create view v_encuesta_resumen with (security_invoker = true) as
select e.id as encuesta_id,
  count(r.id)::int as respuestas,
  (count(r.id) filter (where r.persona_id is not null))::int as con_datos,
  (count(r.id) filter (where r.persona_id is not null and not r.telefono_ya_registrado))::int
    as personas_nuevas,
  max(r.created_at) as ultima_respuesta
from encuestas e
left join encuesta_respuestas r on r.encuesta_id = e.id
group by e.id;

-- Conteo por opción de cada pregunta cerrada. Las opciones que nadie eligió no salen: la pantalla
-- las completa en cero con la lista de opciones de la pregunta, que ya tiene.
create view v_encuesta_conteos with (security_invoker = true) as
select p.encuesta_id, p.id as pregunta_id, v.valor, count(*)::int as total
from encuesta_respuestas r
join encuesta_preguntas p on p.encuesta_id = r.encuesta_id and p.tipo <> 'texto'
cross join lateral (
  select jsonb_array_elements_text(r.respuestas -> (p.id::text)) as valor
   where jsonb_typeof(r.respuestas -> (p.id::text)) = 'array'
  union all
  select r.respuestas ->> (p.id::text)
   where jsonb_typeof(r.respuestas -> (p.id::text)) in ('string', 'number')
) v
group by p.encuesta_id, p.id, v.valor;

-- ===========================================================================
-- Permisos
-- ===========================================================================

alter table public.encuestas           enable row level security;
alter table public.encuesta_preguntas  enable row level security;
alter table public.encuesta_respuestas enable row level security;

revoke all on public.encuestas, public.encuesta_preguntas, public.encuesta_respuestas from anon;
revoke all on public.v_encuesta_resumen, public.v_encuesta_conteos from anon;

-- Solo el administrador las ve. Nadie escribe directo: se arma con guardar_encuesta y se contesta
-- con responder_encuesta. La única escritura directa es abrir o cerrar, y solo esa columna.
create policy encuestas_select on encuestas for select to authenticated
  using ((select privado.es_admin()));
create policy encuestas_update on encuestas for update to authenticated
  using ((select privado.es_admin())) with check ((select privado.es_admin()));
create policy encuesta_preguntas_select on encuesta_preguntas for select to authenticated
  using ((select privado.es_admin()));
create policy encuesta_respuestas_select on encuesta_respuestas for select to authenticated
  using ((select privado.es_admin()));

revoke insert, update, delete, truncate
  on public.encuestas, public.encuesta_preguntas, public.encuesta_respuestas from authenticated;
grant update (activa) on public.encuestas to authenticated;

-- ---- Armar o editar una encuesta ----
create or replace function public.guardar_encuesta(p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id        uuid := nullif(p ->> 'id', '')::uuid;
  v_titulo    text := btrim(coalesce(p ->> 'titulo', ''));
  v_preguntas jsonb := coalesce(p -> 'preguntas', '[]'::jsonb);
  v_pregunta  jsonb;
  v_opciones  jsonb;
  v_tipo      public.tipo_pregunta;
  v_orden     integer := 0;
  v_con_resp  boolean := false;
begin
  if not privado.es_admin() then
    raise exception 'Solo el administrador arma encuestas.' using errcode = '42501';
  end if;
  if v_titulo = '' then
    raise exception 'La encuesta necesita un título.';
  end if;
  if jsonb_typeof(v_preguntas) <> 'array' or jsonb_array_length(v_preguntas) = 0 then
    raise exception 'La encuesta necesita al menos una pregunta.';
  end if;
  if jsonb_array_length(v_preguntas) > 40 then
    raise exception 'Son demasiadas preguntas: el máximo es 40.';
  end if;

  if v_id is null then
    insert into public.encuestas (codigo, titulo, descripcion, incluye_registro, mensaje_final,
                                  creada_por)
    values (substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), v_titulo,
            nullif(btrim(p ->> 'descripcion'), ''),
            coalesce((p ->> 'incluye_registro')::boolean, false),
            nullif(btrim(p ->> 'mensaje_final'), ''), auth.uid())
    returning id into v_id;
  else
    v_con_resp := exists (select 1 from public.encuesta_respuestas where encuesta_id = v_id);
    update public.encuestas set
      titulo        = v_titulo,
      descripcion   = nullif(btrim(p ->> 'descripcion'), ''),
      mensaje_final = nullif(btrim(p ->> 'mensaje_final'), ''),
      -- Con respuestas ya no cambia: las que llegaron se contestaron con o sin registro.
      incluye_registro = case when v_con_resp then incluye_registro
                              else coalesce((p ->> 'incluye_registro')::boolean, false) end
    where id = v_id;
    if not found then
      raise exception 'Esa encuesta no existe.';
    end if;
    -- Las preguntas de una encuesta con respuestas no se tocan: las respuestas guardadas apuntan
    -- a sus ids y a sus opciones, y cambiarlas haría mentir a las gráficas.
    if v_con_resp then
      return v_id;
    end if;
    delete from public.encuesta_preguntas where encuesta_id = v_id;
  end if;

  for v_pregunta in select * from jsonb_array_elements(v_preguntas) loop
    v_orden := v_orden + 1;
    v_tipo := (v_pregunta ->> 'tipo')::public.tipo_pregunta;
    v_opciones := '[]'::jsonb;
    if v_tipo in ('opcion_unica', 'opcion_multiple') then
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'id', o ->> 'id',
               'texto', left(btrim(o ->> 'texto'), 160),
               'mensaje', left(nullif(btrim(o ->> 'mensaje'), ''), 400)))), '[]'::jsonb)
        into v_opciones
        from jsonb_array_elements(coalesce(v_pregunta -> 'opciones', '[]'::jsonb)) o
       where btrim(coalesce(o ->> 'texto', '')) <> '';
      if jsonb_array_length(v_opciones) < 2 then
        raise exception 'La pregunta % necesita al menos dos opciones.', v_orden;
      end if;
      if exists (select 1 from jsonb_array_elements(v_opciones) o
                  where coalesce(o ->> 'id', '') !~ '^[a-z0-9]{1,12}$')
         or (select count(distinct o ->> 'id') from jsonb_array_elements(v_opciones) o)
            <> jsonb_array_length(v_opciones) then
        raise exception 'Las opciones de la pregunta % vienen mal formadas.', v_orden;
      end if;
    end if;
    insert into public.encuesta_preguntas (encuesta_id, orden, tipo, texto, obligatoria, opciones)
    values (v_id, v_orden, v_tipo, btrim(coalesce(v_pregunta ->> 'texto', '')),
            coalesce((v_pregunta ->> 'obligatoria')::boolean, true), v_opciones);
  end loop;

  return v_id;
end $$;

revoke all on function public.guardar_encuesta(jsonb) from public, anon;
grant execute on function public.guardar_encuesta(jsonb) to authenticated;

-- ---- Contestar, sin cuenta ----
-- No la llama el navegador: anon no existe en este proyecto (sección 1). La llama el handler
-- /api/encuestas/[codigo] con la llave secreta, después de sus propias revisiones. Por eso solo
-- service_role tiene EXECUTE. Toda la validación de fondo vive aquí, no en el handler: qué
-- encuesta, si sigue abierta, qué preguntas existen y qué opciones valen.
create or replace function public.responder_encuesta(p_codigo text, p_respuestas jsonb,
                                                     p_persona jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  e           public.encuestas;
  q           public.encuesta_preguntas;
  v_valor     jsonb;
  v_limpias   jsonb := '{}'::jsonb;
  v_validas   text[];
  v_persona   uuid;
  v_existente boolean := false;
  v_seccion   text;
  v_tel       text;
  v_lat       double precision;
  v_lng       double precision;
  v_colonia   integer;
  v_genero    public.genero_persona;
  v_fecha     date;
begin
  select * into e from public.encuestas where codigo = p_codigo and activa;
  if not found then
    raise exception 'Esta encuesta ya no recibe respuestas.';
  end if;
  p_respuestas := coalesce(p_respuestas, '{}'::jsonb);
  if jsonb_typeof(p_respuestas) <> 'object' then
    raise exception 'Las respuestas llegaron mal formadas.';
  end if;

  -- Solo se guardan las preguntas de esta encuesta, y solo valores que les corresponden.
  for q in select * from public.encuesta_preguntas where encuesta_id = e.id order by orden loop
    v_valor := p_respuestas -> (q.id::text);
    if q.tipo = 'texto' and jsonb_typeof(v_valor) = 'string' then
      v_valor := to_jsonb(left(btrim(v_valor #>> '{}'), 1000));
    end if;
    if v_valor is null or v_valor in ('null'::jsonb, '""'::jsonb, '[]'::jsonb) then
      if q.obligatoria then
        raise exception 'Falta contestar: %', q.texto;
      end if;
      continue;
    end if;

    select coalesce(array_agg(o ->> 'id'), '{}') into v_validas
      from jsonb_array_elements(q.opciones) o;

    if (q.tipo = 'opcion_unica'
          and (jsonb_typeof(v_valor) <> 'string' or not (v_valor #>> '{}') = any(v_validas)))
       or (q.tipo = 'opcion_multiple'
          and (jsonb_typeof(v_valor) <> 'array'
               or exists (select 1 from jsonb_array_elements_text(v_valor) x
                           where not x = any(v_validas))))
       or (q.tipo = 'escala'
          and (jsonb_typeof(v_valor) <> 'number' or (v_valor #>> '{}') not in ('1','2','3','4','5')))
       or (q.tipo = 'texto' and jsonb_typeof(v_valor) <> 'string') then
      raise exception 'Una respuesta no corresponde a la pregunta: %', q.texto;
    end if;

    if q.tipo = 'opcion_multiple' then
      v_valor := (select jsonb_agg(distinct x) from jsonb_array_elements_text(v_valor) x);
    end if;
    v_limpias := v_limpias || jsonb_build_object(q.id::text, v_valor);
  end loop;

  if e.incluye_registro then
    if p_persona is null or jsonb_typeof(p_persona) <> 'object' then
      raise exception 'Faltan tus datos.';
    end if;
    if coalesce(p_persona ->> 'consiente', '') <> 'true' then
      raise exception 'Para guardar tus datos hace falta que aceptes el aviso de privacidad.';
    end if;
    if btrim(coalesce(p_persona ->> 'nombres', '')) = ''
       or btrim(coalesce(p_persona ->> 'apellido_paterno', '')) = '' then
      raise exception 'Falta tu nombre y tu primer apellido.';
    end if;
    v_tel := privado.normalizar_telefono(p_persona ->> 'telefono');
    if v_tel is null or v_tel !~ '^[2-9][0-9]{9}$' then
      raise exception 'El teléfono no es válido: son diez dígitos.';
    end if;

    -- Lo opcional que llegue mal se descarta, no tumba el registro (PENDIENTES.md, entrada 24).
    if jsonb_typeof(p_persona -> 'lat') = 'number' and jsonb_typeof(p_persona -> 'lng') = 'number'
    then
      v_lat := (p_persona ->> 'lat')::double precision;
      v_lng := (p_persona ->> 'lng')::double precision;
      if v_lat not between -90 and 90 or v_lng not between -180 and 180 then
        v_lat := null; v_lng := null;
      end if;
    end if;
    if coalesce(p_persona ->> 'colonia_id', '') ~ '^[0-9]{1,9}$' then
      select c.id into v_colonia from public.colonias c
       where c.id = (p_persona ->> 'colonia_id')::integer;
    end if;
    if (p_persona ->> 'genero') = any(enum_range(null::public.genero_persona)::text[]) then
      v_genero := (p_persona ->> 'genero')::public.genero_persona;
    end if;
    if coalesce(p_persona ->> 'fecha_nacimiento', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      begin
        v_fecha := (p_persona ->> 'fecha_nacimiento')::date;
        if v_fecha <= date '1900-01-01' or v_fecha > current_date then v_fecha := null; end if;
      exception when others then v_fecha := null;
      end;
    end if;

    -- Un teléfono que ya existe no se sobrescribe nunca (PENDIENTES.md, entrada 23): quien
    -- escanea un QR puede escribir el número de otra persona. La respuesta se cuelga de ella,
    -- marcada, y su ficha queda como estaba. La sección la saca sellar_persona del punto.
    insert into public.personas (nombre, nombres, apellido_paterno, apellido_materno,
                                 telefono_raw, calle, colonia_id, lat, lng, origen_ubicacion,
                                 genero, fecha_nacimiento, quiere_participar, quiere_info,
                                 aviso_version, consentimiento_en)
    values (left(btrim(p_persona ->> 'nombres'), 80),
            left(btrim(p_persona ->> 'nombres'), 80),
            left(btrim(p_persona ->> 'apellido_paterno'), 80),
            left(nullif(btrim(p_persona ->> 'apellido_materno'), ''), 80),
            v_tel,
            left(nullif(btrim(p_persona ->> 'calle'), ''), 160),
            v_colonia, v_lat, v_lng, case when v_lat is not null then 'gps' end,
            v_genero, v_fecha,
            coalesce(p_persona ->> 'quiere_participar', '') = 'true',
            coalesce(p_persona ->> 'quiere_info', '') = 'true',
            left(coalesce(p_persona ->> 'aviso_version', 'provisional-1'), 40), now())
    on conflict (telefono_norm) do nothing
    returning id, seccion_clave into v_persona, v_seccion;

    if v_persona is null then
      select id, seccion_clave into v_persona, v_seccion
        from public.personas where telefono_norm = v_tel;
      v_existente := true;
    end if;
  end if;

  insert into public.encuesta_respuestas (encuesta_id, persona_id, telefono_ya_registrado,
                                          respuestas, seccion_clave)
  values (e.id, v_persona, v_existente, v_limpias, v_seccion);
end $$;

revoke all on function public.responder_encuesta(text, jsonb, jsonb) from public, anon,
  authenticated;
grant execute on function public.responder_encuesta(text, jsonb, jsonb) to service_role;

-- Bitácora: quien cierre una encuesta o corrija su título queda registrado.
create trigger bitacora after update or delete on public.encuestas
  for each row execute function privado.registrar_bitacora();
create trigger bitacora after update or delete on public.encuesta_preguntas
  for each row execute function privado.registrar_bitacora();
create trigger bitacora after update or delete on public.encuesta_respuestas
  for each row execute function privado.registrar_bitacora();

commit;
