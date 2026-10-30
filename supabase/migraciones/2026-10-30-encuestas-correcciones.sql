-- Correcciones a las encuestas del mismo día. Mismo texto que supabase/seguridad.sql, sección 14.
--
-- guardar_encuesta: si llegó la primera respuesta con el editor abierto, rechaza en lugar de
--   tirar las preguntas editadas y contestar que sí.
-- responder_encuesta: con un teléfono que ya existía, la sección de la respuesta sale del punto
--   de quien contestó, no de la ficha de esa persona.

begin;

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
    -- Si llegó la primera respuesta mientras el editor estaba abierto, las preguntas que manda ya
    -- no se van a guardar. Se rechaza en lugar de contestar que sí y tirarlas sin avisar. Sin la
    -- llave (un editor anterior a este cambio) se conserva el trato viejo.
    if v_con_resp and (p ->> 'congelada')::boolean is false then
      raise exception 'Esta encuesta recibió respuestas mientras la editabas, así que sus preguntas ya no se pueden cambiar. Recarga la página para ver cómo quedó.';
    end if;
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

    -- La sección de la respuesta es la de quien contestó, no la de la ficha que ya tenía ese
    -- teléfono: nadie verificó que fueran la misma persona. Sale de su punto, si lo compartió.
    if v_persona is null then
      select id into v_persona from public.personas where telefono_norm = v_tel;
      v_existente := true;
      v_seccion := case when v_lat is not null then public.seccion_por_punto(v_lng, v_lat) end;
    end if;
  end if;

  insert into public.encuesta_respuestas (encuesta_id, persona_id, telefono_ya_registrado,
                                          respuestas, seccion_clave)
  values (e.id, v_persona, v_existente, v_limpias, v_seccion);
end $$;

revoke all on function public.responder_encuesta(text, jsonb, jsonb) from public, anon,
  authenticated;
grant execute on function public.responder_encuesta(text, jsonb, jsonb) to service_role;

commit;
