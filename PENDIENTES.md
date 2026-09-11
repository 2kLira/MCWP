# Pendientes

Este archivo reúne las decisiones que se tomaron durante la construcción de la maqueta y que no
estaban resueltas en los tres documentos de `spec/`. Cada entrada explica qué se decidió, por qué se
decidió así y qué falta confirmar antes de dar el asunto por cerrado.

## Alcance de los roles

1. El rol "colaborador" no está definido en `spec/alcance.md` más allá de que ve menos y no tiene
   botones de crear. Se decidió que el colaborador ve el territorio que tenga asignado (su sección si
   la tiene, si no su demarcación), puede registrar personas y subir fotos, pero no crea ni edita
   actividades, seguimientos, usuarios ni asignaciones. Falta confirmarlo con el socio antes de la
   junta.

2. Un responsable de sección ve su demarcación como contexto pero solo con el detalle de su propia
   sección. Esto no está en el spec; se eligió así para que el mapa no se le quede vacío alrededor.
   Falta confirmar si debe ver las cifras de las secciones vecinas o solo la suya.

## Cuántas secciones entran a la base

3. El catálogo del cliente trae 169 secciones, pero la cartografía solo tiene geometría para 157 (151
   del catálogo más 6 sustitutas). Se decidió cargar a la tabla `secciones` únicamente esas 157, y
   dejar fuera las 18 secciones del catálogo que no tienen geometría. La razón es que aparecerían en
   los conteos y en la lista de secciones sin responsable sin poder pintarse nunca en el mapa. Además
   el sembrado descrito en `spec/modelo-datos.md` cuadra con esta decisión: 40 responsables de sección
   sobre 157 secciones dejan las 117 sin responsable que menciona el spec. Falta que el socio confirme
   que la maqueta se presenta con 157 secciones y no con 169.

## Identificadores de demarcación

4. Los ids de la tabla `demarcaciones` se asignan explícitamente del 1 al 14 siguiendo el orden del
   arreglo en `data/demarcaciones.json`. Ese mismo orden está duplicado en `lib/demarcaciones.ts` para
   que la interfaz pueda referirse a una demarcación sin consultar la base. Si alguien reordena el
   archivo de datos, hay que reordenar los dos. No requiere confirmación de nadie, pero sí que quien
   toque esos archivos lo sepa.

## Orden del esquema

5. En `spec/modelo-datos.md` la tabla `personas` se declara antes que `actividades` y su columna
   `actividad_origen` apunta a `actividades(id)`. Tal cual no corre. En `supabase/schema.sql` las
   tablas van en el orden del spec y esa única llave foránea se agrega con un ALTER TABLE al final. Es
   el mismo modelo, en un orden que se puede ejecutar.

## Vistas

6. `spec/modelo-datos.md` describe en prosa las cuatro vistas (v_seccion_resumen,
   v_demarcacion_resumen, v_problematicas_por_seccion, v_historial_persona) pero no da su SQL. Se
   escribieron interpretando esa descripción. Decisiones concretas que conviene revisar cuando haya
   datos sembrados: la "última actividad" de una sección es la fecha máxima de las actividades con
   estatus realizada; la "próxima" es la fecha mínima de las programadas de hoy en adelante; las
   actividades canceladas no cuentan en ningún conteo; y v_problematicas_por_seccion agrupa por la
   sección de la persona que hizo la mención, no por la sección donde ocurrió la actividad. Esa última
   es la que más conviene confirmar.

## Modo oscuro

7. `spec/sistema-diseno.md` define paletas de modo claro y oscuro pero no dice cómo se elige entre
   ellas. Por ahora el modo sigue la preferencia del sistema operativo y se puede forzar con las
   clases `.claro` o `.dark` en el elemento raíz. No hay todavía un control en la interfaz para
   cambiarlo. Falta decidir si la junta lo necesita.

## Librerías agregadas

8. Fuera de la lista de la pila que fija `CLAUDE.md` se agregaron dependencias de desarrollo, solo
   para el script de carga de datos y sin llegar al navegador: `tsx` para correr el script en
   TypeScript y `dotenv` para leer `.env.local`. Ya no se usa `pg`: no tenemos la contraseña de la
   base, solo las llaves de API, así que `scripts/importar.ts` se reescribió para cargar los datos
   por la API REST de Supabase (`@supabase/supabase-js`) con la llave secreta
   (`SUPABASE_SECRET_KEY`), incluida la geometría, que se manda como texto EWKT en vez de con
   funciones de PostGIS. El esquema (`supabase/schema.sql`) ya no lo aplica ningún script: se pega
   a mano en el editor SQL de Supabase. Conviene resolver eso antes de producción, para tener el
   esquema bajo control de versiones aplicado de forma reproducible y no manual. También quedó
   instalado `@supabase/ssr`, que viene con el cliente y todavía no se usa.

## Una quinta vista para la bandeja de seguimiento

9. `spec/modelo-datos.md` dice que la bandeja de seguimiento no es una tabla aparte sino una
   consulta: personas con `quiere_participar` o `quiere_info` en verdadero cuyo último seguimiento
   sea `pendiente` o no exista. El mismo documento dice, unas líneas antes, que las agregaciones se
   resuelven en la base y se consultan desde la aplicación en lugar de armarlas en el cliente. Para
   cumplir las dos cosas se agregó a `supabase/schema.sql` una quinta vista, `v_bandeja_seguimiento`,
   que no está pedida explícitamente en el spec. Sigue el criterio al pie de la letra: solo entran
   las personas cuyo último seguimiento sea `pendiente` o no exista, así que las que están en estado
   `en_seguimiento` quedan fuera de la bandeja. Falta confirmar si eso es lo que se quiere, porque
   operativamente una persona en seguimiento tampoco está atendida y podría convenir que siguiera
   apareciendo en la bandeja, marcada aparte.

## El vacío del mapa es una elección, no un accidente

10. El sembrado deja 25 secciones sin ninguna persona registrada y las concentra en una mancha
    contigua de unos 3.5 kilómetros de diámetro, al sur y suroriente del municipio. Es a propósito:
    el mapa tiene que mostrar dónde falta trabajar, y un vacío salpicado al azar no cuenta esa
    historia. Si en la junta preguntan por esa zona, la respuesta es que así se sembró para que se
    viera el hueco, no que falten datos. Las claves están en la salida de `scripts/sembrar.ts`.

## MapLibre se quedó en la línea 5

11. `npm install maplibre-gl` traía la versión 6.8.0 y con ella el mapa no pinta: el estilo de
    CARTO se descarga completo, las capas se crean, pero ninguna fuente llega a cargar y por eso
    nunca se piden teselas. Se comprobó contra un mapa mínimo sin nuestro código: con la 5.x carga
    y con la 6.8.0 no. El proyecto quedó fijado en `maplibre-gl@^5` (5.24.0), que es la línea
    estable y la que espera el resto del código. Antes de subir a la 6 hay que revisar qué cambió
    en el arranque de fuentes.

## Cómo se revisó la interfaz

12. La revisión a 390 y 1280 píxeles se hizo con un navegador sin ventana, instalando Playwright de
    forma temporal como dependencia de desarrollo y desinstalándolo al terminar, para no meter una
    librería fuera de la pila que fija `CLAUDE.md`. Lo que se comprobó: que ninguna pantalla
    desplace la página de lado en los dos anchos, que el anillo de foco sea de dos píxeles en
    naranja, que con `prefers-reduced-motion` no corra ninguna animación, y que el conmutador de
    rol recorte de verdad los datos. Si hay que repetirla, se vuelve a instalar y a quitar.

## Etapa electoral

Las entradas siguientes vienen de la lista de requerimientos del 10 de septiembre de 2026, que
amplía el alcance de estructura territorial a operación electoral. Ninguna está en los tres
documentos de `spec/`. El plan de construcción está en `PLAN-ELECTORAL.md`.

8. **Intención de voto como dato sensible.** Marcar a una persona como promovida registra su opinión
   política, que la ley trata como dato personal sensible y no como dato personal común. Eso exige
   consentimiento expreso, no el genérico que hoy guarda la columna `consentimiento_en`. Antes de la
   primera carga real de promovidos hay que resolver tres cosas: el texto del consentimiento
   específico, si la columna se cifra a nivel de columna, y quién puede consultarla. Es la decisión
   que más urge de esta lista porque bloquea la fase 4.

9. **Promovido: campo independiente o escalón de estatus.** Se eligió `es_promovido` como booleano
   independiente, junto a `quiere_participar` y `quiere_info`, porque las tres cosas pueden ser
   ciertas a la vez y un estatus con escalones las volvería excluyentes. Si el socio prefiere la
   escalera `alcanzada → interesada → promovida`, es un cambio de una columna, pero hay que decidirlo
   antes de la carga masiva. Falta confirmarlo.

10. **169 secciones contra las 157 de la entrada 3.** El requerimiento nuevo pide presentar las 169
    del catálogo. La decisión anterior de cargar solo 157 queda revertida: entran las 169 al catálogo
    y siguen siendo 157 las que tienen polígono, porque el esquema ya separa `secciones` de
    `secciones_geom`. **Falta el archivo**: el repositorio no tiene el listado de las 169 claves. De
    las 18 sin geometría, la cartografía solo nombra 9 como sucesoras de las sustitutas; las otras 9
    no aparecen en ningún archivo del proyecto. Sin ese listado la fase 2 no se puede construir.

11. **Catálogo de casillas.** No existe en `data/`. Hace falta con domicilio, tipo y lista nominal.
    Si no trae coordenadas usables, se fijan a mano con la herramienta de la fase 3, que por eso se
    construye. Falta pedirlo.

12. **Mapa de calor por colonia.** La colonia no es unidad exacta y 28 están partidas entre
    demarcaciones, así que el calor por colonia se calcula sobre la colonia declarada de cada
    persona, no sobre geometría. La pantalla lo tiene que decir. Falta confirmar que al socio le
    sirve así, o si prefiere que el calor por colonia se reparta proporcionalmente al traslape que ya
    guarda `colonia_seccion.traslape_pct`.

13. **La cola de captura sin señal deja de ser opcional.** `spec/alcance.md` la dejó fuera y cotizada
    aparte. Con la jornada electoral adentro ya no se sostiene: un acta capturada en una casilla sin
    señal se pierde. Hay que construirla en la fase 6 o aceptar huecos en el preconteo. Falta
    decidir, y tiene costo.

14. **Caducidad, no borrado, del capturista por actividad.** El requerimiento dice que al terminar la
    actividad «se les borra su página». Se implementa como caducidad del acceso: la sesión se
    invalida y la pantalla deja de servir, pero lo capturado se conserva atribuido a esa persona y a
    esa actividad. Borrar los registros dejaría la actividad sin sus datos y rompería la
    consolidación que el sistema hace al cerrarla. No requiere confirmación, pero conviene decirlo
    para que nadie espere otra cosa.

15. **Autenticación adelantada.** Las fases 6 y 7 no se pueden construir sin cuentas de usuario. El
    bloque de autenticación, que estaba anotado como trabajo de producción, pasa a ser prerrequisito
    de esas dos fases. Falta que el socio sepa que eso mueve el orden y el presupuesto.

16. **El mapa compartible de la jornada es la única superficie pública del sistema.** Se resuelve con
    enlace de solo lectura, caducable, que muestra únicamente agregados por casilla: ningún nombre,
    ningún teléfono, ninguna ficha. Falta decidir quién puede generar esos enlaces y cuánto duran.

## Fase 1 de la etapa electoral

17. **Validación de teléfono por forma, no por catálogo.** `validarTelefonoMexicano` en
    `lib/territorio.ts` acepta diez dígitos, rechaza los que empiezan con 0 o 1, rechaza el mismo
    dígito diez veces, y distingue las cuatro ladas de dos dígitos que existen en México (33, 55, 56
    y 81) del resto, que son de tres. No comprueba que la clave exista en el catálogo del IFT, que
    tiene cientos de entradas y cambia. Si en producción hace falta esa exactitud, se carga el
    catálogo como tabla y la función lo consulta. No requiere confirmación de nadie.

18. **La edad nunca se guarda.** Se calcula desde `fecha_nacimiento` en `lib/personas.ts` y en la
    vista `v_cumpleanos_hoy`. Guardarla obligaría a recalcularla todos los días.

19. **El 29 de febrero.** `v_cumpleanos_hoy` compara mes y día exactos, así que quien nació el 29 de
    febrero solo aparece en años bisiestos. Felicitarlo el 28 sería una decisión de producto y no
    está en el spec. Falta decidirlo, aunque no urge.

20. **Mayoría de edad.** El esquema solo exige que `fecha_nacimiento` esté entre 1900 y hoy. No pide
    18 años cumplidos, porque el sistema registra gente en general y no solo a quien vota. Cuando
    entre el padrón de promovidos habrá que decidir si una persona menor de edad puede marcarse como
    promovida, que es contradictorio. Falta confirmarlo.

21. **`crearPersona` no recibe al actuante.** Por eso `promovido_por` se queda en null cuando alguien
    se registra ya marcado como promovido desde el formulario de captura; `promovido_en` sí se sella.
    La firma de esa función viene de antes de esta fase y cambiarla toca a todos sus llamadores.
    Falta decidir si se cambia ahora o cuando entren las cuentas de usuario, que es cuando de verdad
    importa saber quién promovió a quién.

## Fase 4 de la etapa electoral

22. **Quién puede hacer carga masiva.** El spec no lo dice. Se decidió: administrador general y
    responsables de demarcación, en `puedeImportar` de `lib/permisos.ts`. Un colaborador registra
    gente de una en una en la calle, pero meter un archivo de miles de renglones cambia el padrón de
    golpe y hay que poder señalar a un responsable. Además cada renglón del archivo se valida contra
    el territorio de quien lo sube: nadie carga promovidos de una sección que no le toca. Falta
    confirmarlo con el socio.

23. **Una persona que ya existe nunca se sobrescribe.** La carga masiva solo le marca
    `es_promovido`, `promovido_en` y `promovido_por`. No le toca nombre, calle ni sección, aunque el
    archivo traiga esos datos distintos. Un archivo de promovidos suele venir de un tercero y su
    versión del domicilio no es mejor que la que capturó alguien en la calle. Si el socio quiere que
    el archivo mande, es un cambio chico, pero hay que decidirlo antes de la primera carga real.

24. **Un género mal escrito no tira el renglón.** Se guarda en null y la persona entra igual.
    Perder a alguien entero por una columna opcional mal capturada sería absurdo. Los campos que sí
    tiran el renglón son nombre, teléfono y sección.

25. **Menores de 18 en la carga masiva.** La carga los rechaza, aunque el esquema sí los permita
    (entrada 20). La contradicción es a propósito y acotada: un promovido es alguien que va a votar.
    Cuando se resuelva la entrada 20 hay que alinear las dos reglas.

26. **Deshacer una importación todavía no tiene pantalla.** La tabla `importaciones` y la columna
    `personas.importacion_id` ya guardan lo necesario para revertir un archivo completo, y la llave
    foránea va con `on delete set null` para que borrar el registro de la carga no borre gente. Lo
    que falta es el botón. Se construye cuando alguien lo necesite; el dato ya se está guardando
    desde ahora, que es lo que no se puede recuperar después.

## Fase 5 de la etapa electoral

27. **El calor por colonia se agrupa por colonia, demarcación y sección a la vez.** Agrupar solo por
    colonia obligaría a decidir a qué demarcación se le cuenta cada persona, y 28 colonias cruzan
    demarcaciones. Con la vista partida así, el recorte por rol funciona con `aplicarAlcance` sin
    inventar nada, quien ve todo el municipio suma los renglones, y una colonia partida aparece con
    sus pedazos separados, que es la verdad. La ficha de colonia lo dice cuando pasa. Falta
    confirmar si al socio le sirve así o prefiere repartir proporcionalmente con el
    `colonia_seccion.traslape_pct` que ya está guardado.

28. **El conteo por colonia sale de la colonia declarada, no de geometría.** Una persona cuenta en
    la colonia que se le capturó, no en el polígono donde cayó su coordenada. Si algún día se
    quieren las dos cifras, la geometría ya está y el cálculo es un punto en polígono más. Hasta
    entonces la pantalla lo dice: la colonia es referencia, la sección es la unidad exacta.

29. **`resultados_historicos` está creada pero vacía.** Es la tabla genérica para la capa de
    revocación de mandato y para cualquier otro proceso pasado. El reparto de votos va en jsonb
    porque cada proceso tiene opciones distintas. **Falta el archivo**: los resultados de la
    revocación de 2022 por sección son públicos y los publica el INE, pero nadie los ha cargado.
    Sin ellos la capa no se puede construir, y por eso es lo único de la fase 5 que queda fuera.

## Etapa electoral versión 2

Las entradas siguientes vienen de las notas del 11 de septiembre de 2026 y de los tres archivos que
mandó el cliente. El plan vigente es `PLAN-ELECTORAL.md`; `PLAN-ELECTORAL-v1.md` queda como registro.

30. **La demarcación de 18 secciones está deducida, no declarada.** El catálogo del cliente
    (`LN FEB 26_CAPITAL.xlsx`, 169 secciones) no trae demarcación, y 18 de esas secciones no tienen
    polígono. Se resolvieron tomando la coordenada de su casilla básica y viendo en qué sección con
    geometría cae: 17 salieron así, y 15 de ellas caen dentro de las 6 sustitutas, que es justo lo
    que dice la cartografía que pasó. La 2543 se resolvió por la sucesión declarada en
    `secciones.geojson`. La columna `origen_demarcacion` de `data/secciones-catalogo.csv` guarda de
    dónde salió cada una. **Falta que el cliente confirme las 18**, sobre todo 2579 y 2587, que no
    caen en una sustituta sino en una sección vigente.

31. **Las 6 sustitutas quedan fuera del catálogo pero dentro del mapa.** `secciones.en_catalogo` las
    marca en falso. Se siguen pintando y se siguen viendo, porque esconderlas deja hoyos en el mapa y
    porque CLAUDE.md lo prohíbe, pero no entran en lista nominal ni en metas, donde contarían dos
    veces junto con sus sucesoras. La base queda con 175 renglones: 169 del catálogo más 6. Esto
    revierte parcialmente la entrada 10, que había dejado el asunto en 169 a secas.

32. **Seis secciones prioritarias no se pueden pintar.** 2541, 2542, 2574, 2581, 2582 y 2583 son
    prioritarias y están entre las 18 sin geometría. Cuentan en los indicadores y aparecen en los
    listados; lo único que no se puede es colorearlas en el mapa, y la barra del mapa lo dice. Se
    destraba solo cuando el INE publique el marco vigente.

33. **El número 402 no cuadra con 185 casillas.** Las notas dicen que el día de la elección habrá
    402 representantes con usuario. El archivo de coordenadas trae 185 casillas en Oaxaca de Juárez:
    169 básicas y 16 contiguas. A titular y suplente por casilla salen 370, no 402. Para llegar a 402
    harían falta 201 casillas, o bien el número incluye representantes generales, que son otra figura
    y no cuelgan de una casilla. **Falta que el cliente lo aclare**, porque cambia las barras de
    avance, las metas de reclutamiento y cuántos usuarios hay que crear.

34. **La meta de votos existe como campo y está vacía.** El cliente la definirá después. El indicador
    y la barra de avance ya están construidos y se muestran con la meta en guion, para poder
    presentarlos. El día que se llenen las metas la pantalla no cambia, solo se llena.

35. **El promotor es una persona ya registrada.** Así lo decidió el cliente. Se guarda en
    `personas.promotor_id`. Se eligió buscador y no desplegable porque pueden ser miles y un
    desplegable con miles de opciones es inusable en celular.

36. **La importación pasó de vaciar a upsert.** Con 169 secciones ya no bastaba con cuidar el orden
    de borrado: `personas` y `actividades` apuntan a `secciones.clave`, y `representantes_casilla`
    cuelga de `casillas.id` con borrado en cascada. Vaciar esas tablas en una base ya sembrada se
    habría llevado personas y representantes de por medio. No requiere confirmación, pero sí que
    quien toque `scripts/importar.ts` lo sepa.

37. **Una agregación quedó en el navegador, contra la regla de la casa.** El avance de meta por
    demarcación se calcula en `app/territorio/page.tsx` sumando las secciones ya traídas, en lugar de
    pedírselo a una vista. La razón: `v_demarcacion_resumen` no carga `lista_nominal`, `meta_votos`
    ni `promovidos`, y agregarlos era una migración más en medio de la fase. Está comentado en el
    archivo como excepción deliberada. **Lo correcto es sumarle esas tres columnas a
    `v_demarcacion_resumen` en la siguiente migración y borrar el cálculo del cliente.** No urge
    mientras sean 175 secciones; empezaría a importar si esto creciera a todo el estado.

38. **`clavesConGeometria` deduce del GeoJSON lo que debería estar en la base.** Para saber qué
    secciones del catálogo no tienen polígono, la pantalla compara las claves contra
    `secciones.geojson` cacheado, porque no hay columna que lo diga. Funciona y no cuesta una
    consulta, pero la fuente de verdad debería ser la base: bastaría una columna derivada de la
    existencia del renglón en `secciones_geom`. Anotado para la siguiente migración.
