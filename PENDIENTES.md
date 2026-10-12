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

## Fase E de la etapa electoral v2

39. **El tablero todavía cuenta actividades que el rol no debería ver.** `app/page.tsx` llama a
    `actividadesDeAgenda` sin recorte de estatus, así que sus bloques de hoy y de los próximos siete
    días siguen contando realizadas para responsables y brigadistas. La agenda ya no tiene esa fuga.
    Se arregla en cuanto `lib/datos/actividades.ts` acepte el filtro de estatus en la consulta.

40. **Dos firmas de consulta que faltan en `lib/datos/actividades.ts`.** La agenda las resolvió
    provisionalmente en memoria y lo dejó comentado en `components/agenda/datos.ts`:

    ```ts
    actividadesDeAgenda(usuario, desde, hasta, estatus?: readonly EstatusActividad[])
    actividadesDeBrigadista(usuario, brigadistaId, desde, hasta, estatus?: readonly EstatusActividad[])
    ```
    La segunda se resuelve en un solo viaje con un embed `actividad_brigadistas!inner(usuario_id)`;
    hoy se piden los ids aparte y se cruzan en el cliente, que son dos viajes. Además
    `FiltrosActividades.estatus` debería aceptar varios valores y no uno solo, para que `/actividades`
    recorte en la base igual que la agenda.

41. **Los recorridos del sembrado se sesgan hacia las secciones prioritarias.** Antes se repartían
    solo por población y por las cinco demarcaciones más pobladas, y el resultado era que ninguna
    prioritaria salía recorrida: el mapa de prioritarias se veía enteramente pendiente y no enseñaba
    nada. Ahora una sección de prioridad A pesa seis veces y una B tres, sobre el mismo peso de
    población. El avance sigue saliendo de actividades reales sembradas, no de una bandera puesta a
    mano. Es una decisión de presentación, no de modelo; si el socio prefiere ver el avance real en
    cero, se quita el peso y ya.

42. **La bandeja solo puede mostrar dos estados, no cuatro.** `v_bandeja_seguimiento` trae
    únicamente a quien no tiene seguimiento registrado o lo tiene en `pendiente`: su propio `where`
    descarta `en_seguimiento` y `atendido`. Por eso el filtro de estado de la pantalla solo ofrece
    "sin atender" y "pendiente". `FiltrosBandeja` sí acepta los cuatro valores, por si algún día la
    vista se abre. **Falta decidir** si el socio quiere ver en la bandeja a quien ya está en
    seguimiento o ya fue atendido; hoy esa gente desaparece de la pantalla en cuanto se le registra
    algo, que es lo que una bandeja de pendientes debe hacer, pero deja sin manera de revisar lo ya
    trabajado sin entrar persona por persona.

## Rediseño del tablero y del cromo del mapa

43. **La paleta se templó hacia el marfil, contra lo que dice el sistema de diseño.**
    `spec/sistema-diseno.md` es explícito: "Nada de fondo crema". La referencia que eligió el
    cliente pide lo contrario, así que `app/globals.css` trae hoy `--fondo: #f7f5f2`,
    `--superficie: #fffdfa`, `--tinta: #24211e` y bordes en marrón con alfa. El naranja **no**
    cambió: sigue siendo Pantone 151 C `#FF8200`. Lo que sí bajó es el naranja tipográfico, de
    `#B35700` a `#A84400`, que da 5.5 a 1 sobre el marfil. **Falta confirmar** cuál de las dos
    paletas se presenta; volver a la neutra es cambiar diez variables en un solo archivo.

44. **El anillo de foco ya no usa `--naranja`.** El spec pide foco en `#FF8200`, que contra el
    marfil da 2.3 a 1 y no alcanza el mínimo de 3 a 1 que se le exige a un indicador de foco. Se
    cambió a `--naranja-tipografico`. Es corrección de accesibilidad, no preferencia.

45. **El desenfoque bajó de 20 a 10 píxeles y es opcional.** Las utilidades `vidrio`,
    `vidrio-denso`, `vidrio-flotante`, `capsula` y `dock` definen primero una superficie casi
    opaca que funciona sola; el `backdrop-filter` se enciende aparte, dentro de un `@supports`,
    solo desde 768 píxeles de ancho, y se apaga entero con `prefers-reduced-transparency`. La
    pantalla se ve completa sin desenfoque; está verificado con la consulta forzada.

46. **La lámina territorial bajó a marca de agua.** Sigue ahí, que es parte del diseño que el
    cliente quiere conservar, pero con el fondo marfil y las sombras suaves su relleno naranja
    competía con el título de la pantalla. Se bajó el alfa de `--lamina-relleno` y
    `--lamina-propio` y se subió `--lamina-bruma`. Si se vuelve a la paleta neutra hay que
    revisar estos tres valores.

47. **La barra superior es de alto cero solo en el tablero.** Ahí es una capa `h-0` con
    `overflow-visible`, para que el título grande quede en el mismo renglón que las cápsulas del
    buscador y el rol, como en la referencia. En las demás pantallas ocupa su alto: con alto cero
    se montaba encima de sus encabezados, y el título de Personas alcanzadas con su botón de
    exportar quedaban tapados. El tablero reserva el hueco de las cápsulas con `md:pr-[34rem]`;
    **cualquier pantalla nueva que quiera compartir renglón con ellas tiene que reservarlo igual.**

48. **Las props `conVidrio` de buscador y conmutador se llaman ahora `comoCapsula`.**
    `app/mas/page.tsx` sigue montando el conmutador sin props, en bloque y con el territorio en
    la segunda línea; la forma de cápsula solo aparece en la barra superior de escritorio.

49. **El selector de capas dejó de anunciarse como pestañas.** Tenía `role="tablist"` y
    `role="tab"` sin ningún `tabpanel` y sin navegación con flechas, que es lo que un lector de
    pantalla espera de un tablist. Ahora es un `role="group"` de botones con `aria-pressed`. La
    selección no depende solo del color: la dicen `aria-pressed` y el peso 600.

50. **El mapa ya tiene control de zoom.** Se añadió `NavigationControl` sin brújula, en
    `bottom-right`, y `app/globals.css` le da aspecto de vidrio del sistema con botones de 44
    píxeles, que es el piso táctil de la casa (MapLibre trae 29). La atribución de CARTO y
    OpenStreetMap sigue en su sitio, debajo del zoom.

51. **La nota de las secciones sin polígono se reescribió.** Decía "N sin polígono publicado:
    cuentan aquí, no se pintan en el mapa". Ahora dice que esas secciones están incluidas en el
    total y aún no tienen límites disponibles en el mapa. Misma limitación y mismo conteo, sin
    jerga cartográfica.

52. **El tablero dejó de mostrar la franja de barras semanales.** No está en la referencia y
    "nuevas esta semana" ya se lee como texto bajo la cifra principal. Con eso salió la consulta
    `reporteSemanal` del tablero, que sigue viva en `/reportes`. También salieron las dos
    tarjetas de vidrio del componente `Indicador`: Promovidos y Quieren ser representantes son
    ahora dos celdas más de la banda de métricas. `components/tablero/indicador.tsx` quedó sin
    usarse; **conviene borrarlo** si no se va a volver a él.

53. **El tablero ya no inventa un total de secciones mientras carga.** Tenía un `secciones || 157`
    que disfrazaba el estado de carga con un número fijo. Ahora muestra una raya mientras carga y
    un mensaje honesto si el total es cero, sin `NaN` ni porcentajes inválidos.

54. **Actividades y Agenda ya no comparten icono.** Las dos usaban `CalendarDays` y en un riel de
    solo iconos eran indistinguibles. Actividades pasó a `ClipboardList`. Es lo único del riel
    que no volvió a como estaba; la barra lateral flotante en sí quedó idéntica.

55. **`registrar-representante` no aparece en el riel de escritorio.** El destino existe en
    `DESTINOS` con su permiso, pero la constante `GRUPOS` de `components/navegacion/dock.tsx` no
    lo incluye, igual que ya pasaba con `/casillas` y `/importar`. En celular sí se llega, desde
    Más. **Falta decidir** si esos cuatro destinos entran al riel o si el riel se queda corto a
    propósito.

## Fase F de la etapa electoral v2

43. **Las tablas nuevas nacen con Row Level Security activo y hay que apagarlo.** `casillas`,
    `representantes_casilla` y `resultados_historicos` quedaron con RLS encendido y sin políticas,
    así que el navegador, que entra con la llave anónima, veía cero renglones: en el mapa se leía
    "0 de 0 casillas" con 185 cargadas. Ninguna otra tabla del proyecto tiene RLS, porque no hay
    login y el filtrado por territorio vive en `lib/permisos.ts`. Lo corrige
    `supabase/migraciones/2026-09-14-rls-casillas.sql`.

    **Esto va a volver a pasar con cada tabla nueva**, así que quien cree una tiene que revisarlo, y
    la forma rápida de detectarlo es consultar la tabla con la llave anónima y con la secreta y
    comparar los conteos: si la anónima devuelve cero y la secreta no, es esto.

    Cuando entre el bloque de cuentas, RLS se enciende en todas las tablas con políticas que
    repliquen la regla de `lib/permisos.ts`, y esta migración se revierte.

## Rama soet

56. **Acento azul en vez de naranja.** En esta rama los tokens `--naranja*` y `--mapa-*` de
    `app/globals.css` valen azul, y los neutros perdieron la calidez que el spec les daba para
    acompañar al naranja. Los nombres se dejaron igual para no divergir de main. La regla del spec
    "nunca blanco sobre naranja" se invierte: el azul de relleno es oscuro, así que el texto encima va
    en blanco con el token nuevo `--sobre-naranja` (`text-sobre-naranja`). En oscuro el relleno sube a
    `#2b6fd0` para seguir despegándose del fondo.

57. **Recibió apoyo.** `spec/modelo-datos.md` no tiene este campo. Se agregó `personas.recibio_apoyo`
    como sí o no, sin decir qué apoyo fue ni cuándo se entregó; si el cliente lo quiere, eso es una
    tabla aparte de entregas, no más columnas. El "mapa de calor" se resolvió como una vista más del
    mapa por sección (cuantiles, igual que Promovidos) y no como mapa de puntos: la sección es la
    unidad exacta del sistema. La migración es `supabase/migraciones/2026-09-21-soet-apoyo.sql` y
    marca a tres de cada diez personas sembradas para que la demo no salga vacía. Falta confirmar si
    la demo de esta rama usa la misma base que main o una propia.

## Proyecto real: login, roles y RLS (8 de octubre de 2026)

58. **Dejó de ser maqueta.** Se aprobó el proyecto y se montó una base nueva
    (`mybauwarryjnhmbvpnoe`) con login de correo y contraseña contra Supabase Auth y RLS en las
    veinte tablas. Esto deroga dos reglas que `CLAUDE.md` tenía marcadas como no negociables —"no
    hay login" y "ningún dato personal real"— y deroga la línea de `spec/alcance.md` que decía
    "Row Level Security. Fuera, por la decisión de no tener login". El propio párrafo de
    `CLAUDE.md` ya preveía el cambio: "cuando el proyecto se apruebe, ese módulo se reemplaza por
    políticas de base de datos".

    El esquema se **consolidó**: `supabase/schema.sql` es la estructura completa y
    `supabase/seguridad.sql` la seguridad. Las once migraciones de la maqueta se archivaron en
    `supabase/migraciones-maqueta-v1/` y no deben aplicarse, porque una apaga RLS y cuatro
    redefinen `v_seccion_resumen` sin `security_invoker`. Eso deja obsoleta la entrada 55.

    `lib/permisos.ts` (359 líneas) quedó sin uso y **todavía no se ha borrado ni reemplazado**. Es
    lo siguiente que hay que hacer: mientras siga ahí, hay dos fuentes de verdad de permisos.

59. **Bloqueante antes de capturar gente real.** Se decidió que la base ya recibe datos personales
    reales, pero quedan dos cosas sin resolver que no son opcionales:

    - El aviso de privacidad sigue siendo el texto provisional que `spec/alcance.md` marcó como
      "pendiente de revisión legal". `personas.aviso_version` y `consentimiento_en` existen y se
      guardan, pero están guardando consentimiento a un texto que nadie revisó.
    - No hay política de retención ni figura definida de quién responde por los datos.

    Mientras eso no se cierre, lo sensato es capturar solo con datos de prueba del rango
    951 100 0000 a 951 100 9999.

60. **Los dos roles territoriales no tienen políticas.** El enum `rol_usuario` conserva
    `resp_demarcacion` y `resp_seccion`, pero `supabase/seguridad.sql` solo escribe políticas para
    `admin` y `brigadista`, que son los dos roles que el cliente pidió para arrancar. Un usuario con
    rol territorial **no ve nada**. Se dejó así a propósito en lugar de inventarles un alcance que
    el spec no define con RLS. Las entradas 1 y 2 de este archivo describen lo que se había
    decidido para ellos en la maqueta; sirve de punto de partida, pero hay que confirmarlo antes de
    escribir esas políticas.

61. **Detección de duplicados sin exponer datos.** El registro rápido exige avisar del teléfono
    repetido en el momento, pero un brigadista no puede leer personas de otras capturas. Se resolvió
    con `public.telefono_ya_registrado(tel)`, que responde sí o no y nunca devuelve el registro.

    El costo es real y hay que decirlo: el brigadista se enterará de que el teléfono ya existe pero
    **no podrá agregarle la participación a la persona existente**, que es el camino que
    `spec/alcance.md` marcaba por defecto. Tendrá que avisarle al admin. Si eso estorba en campo, la
    alternativa es dejarle leer las personas de su sección, que fue la opción descartada.

    La función vive en `public` y es `SECURITY DEFINER`, lo que el asesor de Supabase marca como
    aviso. Es intencional: PostgREST solo expone RPC de esquemas expuestos. Está blindada por
    dentro (comprueba sesión y usuario activo antes de leer) y solo `authenticated` tiene `EXECUTE`.

62. **Al cerrar la actividad, el brigadista pierde el acceso.** En cuanto pasa a `realizada` o
    `cancelada` deja de ver la actividad y a las personas que capturó. Se eligió lo más estricto de
    las tres opciones.

    Queda un residuo menor sin resolver: sigue viendo su propio renglón de
    `actividad_brigadistas`, así que sabe que fue invitado a un `actividad_id`, aunque no pueda leer
    ni la actividad ni una sola persona. Se dejó porque es su propio registro de invitación y
    esconderlo le quitaría la lista de "a qué me han invitado". Falta decidir si debe desaparecer.

    Consecuencia operativa que hay que avisar en campo: **si la actividad se cierra con capturas a
    medias, el brigadista ya no puede corregirlas.** Las corrige el admin.

63. **Dos cosas de configuración que no se pueden hacer por SQL.**

    - Hay ajustes de Authentication que solo se tocan en el tablero y que quedan anotados, sin su
      estado, en `AUDITORIA-SEGURIDAD.md`. **Este archivo está versionado en un repositorio
      público: el estado de un control de seguridad no se escribe aquí.** Lo que sí va aquí es la
      decisión: esos ajustes los aplica el administrador en el tablero, no se pueden automatizar
      por SQL, y hay que revisarlos al montar cualquier instancia nueva.
    - Los cuatro brigadistas se crearon con correos de un dominio inventado, que no existe. Sirve
      para entrar, pero **no hay recuperación de contraseña posible**: si uno la olvida, el admin se
      la tiene que reponer. Falta decidir si se les dan correos reales o si el método de acceso
      cambia a teléfono con código, que era la opción con costo de SMS.

64. **El acento vuelve a ser naranja.** Se revirtió la decisión de la entrada 56. La paleta se tomó
    textualmente de la rama `main` —no se reconstruyó del spec— con `git checkout main --
    app/globals.css`, así que `spec/sistema-diseno.md` **vuelve a ser la verdad** y la nota que la
    entrada 56 derogaba queda sin efecto: la regla "nunca blanco sobre naranja" rige otra vez.

    También regresaron a sus valores naranjas los colores de respaldo que estaban codificados a
    mano fuera de la hoja de estilos, que es donde se escondían: cuatro en
    `components/mapa/mapa-lienzo.tsx`, dos en `components/casillas/mapa-casillas.tsx`, uno en
    `components/mapa/tokens.ts` y los dos `themeColor` de `app/layout.tsx`. El CSS compilado no
    contiene un solo hexadecimal azul.

    **El token `--sobre-naranja` sobrevive**, porque nació con el azul pero hoy lo usan 21
    archivos y borrarlo habría obligado a editarlos todos. Vale `var(--tinta)`, que es exactamente
    lo que hace mcwp con `--primary-foreground`.

    **Deuda de contraste conocida y aceptada a propósito.** En modo oscuro `--tinta` se invierte a
    casi blanco y `main` nunca redefine `--naranja`, así que el texto sobre un relleno naranja
    queda en **2.49 a 1**, por debajo del mínimo de 4.5 que pide el propio `spec/sistema-diseno.md`
    y en contra de su regla "nunca blanco sobre naranja". No es un descuido: se comparó contra el
    despliegue vivo de mcwp y **mcwp se comporta igual** —se ve en su dock, el icono sobre el
    cuadro naranja es blanco— y la instrucción fue "estilo mcwp".

    Si algún día pesa más el contraste que la fidelidad, el arreglo es **una línea**:
    `--sobre-naranja: #24211e` fijo en `app/globals.css`. Da 6.44 a 1 en los dos modos y no toca
    ninguna pantalla, porque las 21 ya leen el token. Vale la pena resolverlo antes de que esto
    pase por una revisión de accesibilidad.

    Contrastes verificados del resto de la paleta: naranja tipográfico sobre fondo claro 5.53;
    naranja claro sobre fondo oscuro 8.97; tinta sobre fondo 14.72; tinta tenue sobre fondo 4.79.
    Ésos sí están por encima del mínimo.

    La comparación se hizo bajando el CSS de `https://mcwp.vercel.app`: los veinte tokens de color,
    en claro y en oscuro, son idénticos.

65. **Fuera el apoyo recibido.** Se revirtió la entrada 57 completa, a pedido del cliente. Salió de
    las nueve vistas del mapa (quedan ocho), del filtro y la píldora de Personas, de la píldora y
    el botón de la ficha, del interruptor del registro, del renglón de la ficha de sección, del
    tipo y el filtro de la capa de datos, de `personas.recibio_apoyo` y del campo `apoyos` de
    `v_seccion_resumen`. La base tenía cero personas, así que no se perdió ningún dato.

    **Error de secuencia que hay que no repetir.** Se soltó la columna de la base mientras el
    despliegue de Vercel seguía sirviendo el código anterior, que todavía la mandaba al insertar.
    Resultado: el registro de personas quedó roto en producción con
    `Could not find the 'recibio_apoyo' column of 'personas' in the schema cache`. Se repuso de
    inmediato y queda pendiente volver a soltarla **después** de desplegar.

    La regla: en una aplicación ya desplegada, una columna se quita en dos pasos y en este orden
    —primero el código deja de usarla y se despliega, después se suelta la columna— nunca al revés.

66. **El nombre del dueño.** El cliente pidió que su nombre no aparezca en ningún lado y que el
    líder, dueño y administrador sea Carlos Lira. El nombre no estaba en ningún archivo del
    proyecto, solo en la base.

    `Carlos Lira` es el administrador general. La cuenta anterior se renombró a "Cuenta de
    respaldo" y se desactivó **en lugar de borrarla**, porque es la única del sistema con correo
    real y por tanto la única vía de recuperación si se pierde la contraseña del admin, que usa un
    dominio inexistente. Está pendiente decidir si se borra del todo, aceptando quedarse sin esa
    red.

    **Queda un lugar sin limpiar:** la autoría de git. Los commits ya empujados llevan el nombre y
    el correo anteriores, y reescribir historia publicada no se hizo sin pedirlo. Para los commits
    futuros basta cambiar `git config user.name` y `user.email`.

67. **Los errores de Storage no pasaban por la traducción centralizada.** `resultado()` en
    `lib/datos/cliente.ts` traduce `PostgrestError`, pero la subida del archivo la contesta Storage
    con un `StorageError`, que nunca entra ahí. Un rechazo de `almacen_fotos_insert` se mostraba
    crudo y en inglés.

    Se añadió `avisoDeAlmacenamiento()` en `lib/datos/almacenamiento.ts` —junto al resto de lo del
    bucket, no en un componente— y la usan tanto la evidencia de inicio y cierre como la galería.
    Respeta la misma regla: lo desconocido no se tapa con una frase amable.

    Si mañana aparece otra ruta que hable con Storage, tiene que usar esa función. El embudo de
    `cliente.ts` no la ve.

68. **El brigadista solo ve Agenda, y dos decisiones que el spec no cubría.** El cliente lo pidió
    así: "al brigadista nada más le debe salir el de agenda y ya es su módulo único". Los siete
    módulos de vista agregada —tablero, mapa, personas, actividades, estructura territorial,
    seguimiento y reportes— cuelgan ahora de `puedeVerListadosGenerales` en
    `components/navegacion/destinos.ts`, y las diez rutas que le quedaban alcanzables por URL
    reciben el portón de `components/porton-agenda.tsx`, que explica y devuelve a `/agenda`.
    Esconderlas coincide con RLS en lugar de competir con él: ahí ya le salían vacías.

    Dos cosas no estaban en `spec/alcance.md` y se decidieron aquí:

    - **Registrar se queda** en la barra inferior de celular y en el riel de escritorio. Es una
      acción, no un módulo de consulta, y es lo único que el brigadista hace en la calle. Desde que
      `components/registro/elegir-actividad.tsx` le ofrece primero sus actividades abiertas,
      `/registrar` sin actividad ya no es la trampa que era. Quitarlo costaría tres toques en la
      pantalla donde más prisa hay.
    - **La raíz redirige, no avisa.** `proxy.ts` manda a `/` a todo el que entra con sesión, así
      que un portón ahí sería una pared cada vez que el brigadista abre la aplicación. Se le
      redirige a `/agenda` desde el cliente, porque el rol vive en el cliente y el proxy no lee la
      base. El portón se pinta mientras la navegación ocurre y es la red si no corre.

    Se agregó una tercera, por coherencia: **el buscador general de escritorio no se le pinta**.
    Sus tres salidas son `/personas/[id]`, `/mapa` y `/territorio`, o sea un cajón de texto cuyo
    único destino posible sería un portón. Las colonias y demarcaciones salen de archivos locales,
    no de la base, así que RLS no lo habría dejado vacío solo.

    Lo que queda sin resolver: `/mas` en celular sigue existiendo para él, porque es la única
    puerta a la cápsula de sesión y a cerrar sesión. Su lista de destinos queda vacía y en su lugar
    va un renglón con el enlace a la agenda. Falta decidir si la cápsula de sesión debería vivir en
    algún lugar de la agenda y `/mas` desaparecerle del todo.

- **"Servicios públicos" retirada del catálogo de problemáticas (9 de octubre de 2026).** A
  petición del cliente deja de aparecer en el formulario de registro. `spec/modelo-datos.md` la
  lista; esto lo supera. Se desactivó con `activa = false` y no se borró, porque ya había menciones
  que la referencian y deben seguir contando en los reportes históricos.

- **El brigadista escribe la conclusión general (9 de octubre de 2026).** Pedido del cliente.
  `spec/alcance.md` dice que el responsable escribe la conclusión; esto lo amplía. Va por la
  función `guardar_conclusion_actividad` de `supabase/seguridad.sql`, que solo toca la columna
  `conclusion`, solo con la actividad abierta y solo si quien llama está invitado. Cerrar sigue
  siendo del administrador, que ve el texto ya escrito y puede ajustarlo. Queda abierto: es un solo
  campo compartido, así que si dos brigadistas de la misma actividad escriben, gana el último
  que guarda. Si el cliente quiere una conclusión por brigadista, hace falta una tabla aparte.

- **El administrador puede eliminar actividades (10 de octubre de 2026).** Pedido del cliente.
  Es borrado real, no baja lógica: se lleva la actividad, sus invitaciones, fotos (renglón y
  archivo), participaciones, menciones, solicitudes y las personas que se registraron por primera
  vez en ella. Se conservan, y solo pierden el vínculo de origen, las personas que además
  participaron en otra actividad, tienen seguimiento o son representantes de casilla. Pide dos
  confirmaciones: ver el resumen que cuenta la base y escribir ELIMINAR. Para que se pudiera
  vaciar `actividad_origen`, `privado.sellar_persona` tiene ahora una excepción acotada a la
  transacción de `eliminar_actividad`; ver el comentario en seguridad.sql.

- **Exportar a Excel (10 de octubre de 2026).** Pedido del cliente. Pantalla `/exportar` con un
  archivo .xlsx de verdad: una hoja por tabla, encabezado congelado, filtros y fechas como fecha.
  Se escribe sin librería (`lib/xlsx.ts`, un ZIP sin compresión con el XML mínimo) para no sumar
  dependencias. La ven el administrador y los responsables de demarcación, el mismo criterio que la
  carga masiva; RLS recorta los renglones. Seguimiento y representantes solo se ofrecen al
  administrador porque a otros roles les saldrían vacías. Pendiente de la revisión legal: un
  archivo descargado queda fuera de RLS y de cualquier política de retención; la pantalla lo
  advierte, pero no hay bitácora de quién exportó qué.

69. **Ronda de endurecimiento del 10 de octubre de 2026.** Salió de la auditoría de seguridad; el
    informe con los 17 hallazgos y su estado está en `AUDITORIA-SEGURIDAD.md`, que **no se
    versiona a propósito**: este repositorio es público y un inventario de huecos abiertos no se
    publica.

    Lo que se cambió, y las decisiones que hay detrás:

    - **Sección 10 de `supabase/seguridad.sql`: nueve triggers de sellado.** Es la corrección de
      fondo. RLS decide qué renglón tocas, **no qué columna**, y el grant es por tabla, así que
      `authenticated` tenía UPDATE sobre todas las columnas: `registrada_por`, `promovido_por`,
      `created_at`, `telefono_norm` y la sección los afirmaba el cliente. Ahora los calcula la
      base. Son `SECURITY DEFINER` porque resolver la sección desde la coordenada necesita leer
      `secciones_geom`, y al brigadista el catálogo está cerrado; con `INVOKER` devolvería null
      justo para quien captura en la calle. Viven en `privado` y con `EXECUTE` revocado a PUBLIC.
      Todos llevan la guarda `auth.uid() is not null`: sin sesión quien escribe es la llave
      secreta —sembrado, respaldo, consola— y ahí no se impone autoría, porque una restauración
      necesita conservar las originales.

    - **La baja de un usuario dejó de ser un `update` desde el navegador.** Pasó a
      `app/api/admin/usuarios/[id]/activo/route.ts`, que además suspende la cuenta de acceso con
      `ban_duration`. Motivo medido: `activo = false` cerraba los datos en el acto pero **no la
      sesión**, y el refresh token seguía emitiendo tokens. Se usa la suspensión y no
      `admin.signOut` porque `signOut` recibe el JWT de esa persona, que el admin no tiene ni debe
      tener.

    - **Candado del último administrador**, en `privado.sellar_usuario` y no en el handler, para
      que también cubra el `update` directo y la consola de Supabase. Sin servidor de correo, una
      plataforma sin admin activo no tiene forma de reponer ninguna contraseña.

    - **`lib/sesion.ts`**, con los atributos de la cookie compartidos por los tres clientes.
      Trampa que hay que recordar: **`@supabase/ssr` ignora el `maxAge` que se le pasa** —vuelve a
      poner sus 400 días después de aplicar los nuestros, en las dos rutas de escritura de
      `cookies.js`—. Por eso el recorte a 30 días se impone además en `proxy.ts`, y solo hacia
      abajo, porque un `maxAge` de 0 es el borrado al salir. `secure` solo en producción: en
      `http://localhost` una cookie `Secure` no se guarda y el login dejaría de funcionar.

    - **`textoDeBusqueda()` en `lib/datos/cliente.ts`**, aplicado en los cinco puntos de búsqueda.
      Quita en lugar de escapar, y es deliberado: escapar exige dos pasadas que se pisan —la barra
      de LIKE y la de las comillas de PostgREST—. Conserva acentos, ñ, apóstrofo y guion.

    - **`lib/csv.ts`**: neutraliza las fórmulas, pero **no** los números negativos, que se
      detectan con `Number.isFinite` para que la hoja siga sumándolos.

    - URL firmadas de 3600 a 300 segundos. `next@16.4.0` y `eslint-config-next@16.4.0`, fijados
      **sin caret** porque `AGENTS.md` avisa que este Next trae cambios de ruptura. Cinco
      dependencias muertas fuera, y con ellas `components/ui/button.tsx`, su único consumidor.
      `Cross-Origin-Resource-Policy` añadido; **sin `report-to`**, porque no hay endpoint que
      recoja los informes y una cabecera que apunta a ningún lado es otra promesa falsa.

    - `supabase/verificacion.sql` gana cuatro comprobaciones: que cada tabla con autoría tenga su
      trigger, que las funciones de sellado estén fuera de `public` con `search_path` fijado, que
      la normalización del teléfono en la base dé lo mismo que en TypeScript, y el candado del
      último admin.

    **Lo que sigue abierto y no es trabajo de programación:** cerrar el registro público, encender
    la protección contra contraseñas filtradas y subir el mínimo de longitud, los tres en el
    tablero de Supabase; y **rotar las cinco contraseñas**, que es lo único que cierra que los
    correos de las cuentas estén en la historia de un repositorio público. Redactar el archivo no
    borra los commits.

    **Y una decisión pendiente con ventana corta:** validar los bytes de las fotos en el servidor.
    Hoy la cubeta compara el `Content-Type` que declara el cliente, así que una subida directa por
    API puede meter un JPEG con su EXIF intacto —coordenadas GPS e identificador de dispositivo—
    saltándose el compresor, que es lo único que lo quita. La cubeta está vacía: hacerlo ahora no
    cuesta migración, después sí.

70. **Las fotos ya no se suben directo a Storage.** Segunda mitad de la ronda de endurecimiento,
    11 de octubre de 2026.

    El motivo, medido y no supuesto: con una sesión real de brigadista, un `POST` directo a la API
    de Storage con texto plano y la cabecera `content-type: image/webp` **subió con 200**. La
    cubeta compara el tipo que declara el cliente, no los bytes, y el compresor del navegador —que
    sí valida de verdad, porque `createImageBitmap` decodifica y el reencode por canvas tira los
    bytes originales— es código de cliente, o sea opcional.

    Ahora va por `app/api/fotos/route.ts` y **se quitó la política `almacen_fotos_insert`**, así
    que no queda un segundo camino sin validar. Decisiones que vale dejar escritas:

    - **La autorización no se reimplementó en el handler.** Le pregunta a la base con el cliente de
      la petición si alcanza esa actividad abierta; si RLS no se la entrega, no puede subirle fotos.
      Misma fuente de verdad que `privado.actividad_abierta_mia`.
    - **El nombre del archivo lo pone el servidor.** La ruta es lo que las políticas de lectura usan
      para decidir quién ve la foto, así que no la elige el cliente. El prefijo se valida contra una
      lista de tres (`inicio`, `cierre`, `galeria`); cualquier otra cosa cae en `galeria`.
    - **Sin librería de imágenes.** `sharp` está en el árbol como transitiva de Next, pero
      declararla exigía anotarlo aquí primero, y no hace falta: recortar segmentos de un JPEG o
      chunks de un RIFF es caminar una lista encadenada, no decodificar la imagen. Está en
      `lib/api/imagen.ts`.
    - **APP0 del JPEG se conserva.** Es el JFIF, solo densidad de píxeles, y es justo lo que
      escribe `canvas.toBlob("image/jpeg")` en Safari. Se recortan APP1 a APP15 y los comentarios,
      que es donde viven EXIF, XMP, ICC y los bloques de Adobe.
    - En WebP se recortan los chunks `EXIF`, `XMP ` e `ICCP` **y se apagan sus banderas en VP8X**,
      o el archivo quedaría anunciando metadatos que ya no están. El WebP que produce `canvas` es
      de forma simple y no tiene metadatos: ese camino sale del limpiador con los bytes intactos,
      byte por byte, y la parte que reescribe solo corre con archivos que vienen de otro lado.
    - `avisoDeAlmacenamiento()` y `rutaDeFoto()` se quedaron sin consumidores y se fueron con esto:
      los rechazos ahora los traduce el handler y la ruta la nombra el servidor.

    **Comprobación cruzada que estaba pendiente desde la maqueta, ya hecha:** el punto en polígono
    del cliente (`lib/territorio.ts`) y el de la base (`seccion_por_punto`) coinciden en cinco
    puntos, incluidos dos fuera de toda geometría. Y desde el sellado de columnas **manda el de la
    base**: el trigger sobrescribe la sección que mande el cliente cuando hay coordenada. El del
    cliente sigue sirviendo para pintar la sección antes de guardar, sin esperar un viaje.

    **Pérdida de datos que causé y conviene que quede anotada:** al limpiar los objetos de prueba
    borré por prefijo toda la carpeta de la actividad, y con ellos las dos fotos reales de inicio y
    cierre que se habían subido el 9 de octubre. Los renglones de `fotos` siguen ahí apuntando a
    objetos que ya no existen. Hay que volver a subirlas o borrar esos dos renglones. La lección es
    la obvia: un borrado por prefijo no distingue lo que uno puso de lo que ya estaba.

- **Capturas por usuario en la pantalla de Usuarios (11 de octubre de 2026).** Pedido del cliente.
  Columna "Personas registradas" con total, hoy, últimos 7 días, asistencias y la última captura;
  el encabezado ordena de quien más registró a quien menos. Lo cuenta la vista
  `v_capturas_por_usuario` (security_invoker). "Hoy" es el día de America/Mexico_City. Se cuenta
  por `personas.registrada_por`, o sea quién dio de alta a la persona; las asistencias a otras
  actividades van aparte porque no son gente nueva. Una persona borrada al eliminar una actividad
  deja de contar.

- **Nombre en tres partes (11 de octubre de 2026).** Pedido del cliente. El registro pide
  Nombre(s), Apellido paterno (obligatorio) y Apellido materno (opcional: hay quien tiene uno solo).
  Se guardan en `personas.nombres`, `apellido_paterno` y `apellido_materno`; `nombre` sigue siendo
  el nombre completo y lo arma `privado.sellar_persona`, así que búsquedas, listados, fichas y
  vistas no cambiaron. El Excel de personas trae las tres columnas y se ordena por paterno,
  materno y nombre con reglas del español. La única persona que existía ("Carlos Lira") se separó
  a mano. Queda abierto: la carga masiva sigue recibiendo el nombre completo en una columna y no
  lo parte, porque adivinar dónde empiezan los apellidos ("María del Carmen de la Cruz") metería
  errores en datos reales; esas personas van al final del Excel. Si el cliente quiere partirlas,
  la plantilla tendría que pedir las tres columnas.

- **Levantar reporte del territorio (11 de octubre de 2026).** Pedido del cliente. Pantalla
  `/levantar-reporte`: el usuario elige una de trece categorías y escribe la descripción; la
  ubicación sale del GPS (se vuelve a leer al guardar) y autor, fecha, sección y demarcación los
  sella `privado.sellar_reporte_territorio`. Sin ubicación no se guarda y se explica cómo dar el
  permiso. Tabla `reportes_territorio`, sección 11 de seguridad.sql. Los pendientes salen en el
  mapa como marcadores con el icono de su categoría, en neutro y no en naranja (el naranja es de
  la escala del mapa); se esconden en la vista de casillas. "Marcar como atendido" lo hace solo
  el administrador y el reporte deja de pedirse, así que no vuelve al recargar.
  Decisiones que no venían en el pedido:
  · En la barra inferior del celular aparece solo para el brigadista (le sobraban lugares). Los
    demás roles ya tienen cinco y lo encuentran en Más y en el riel de escritorio.
  · Quién ve qué sigue la regla del resto del sistema: el administrador todos, los demás solo los
    suyos. Un responsable no ve los reportes de su territorio. Si el cliente lo quiere, hay que
    decidir primero el alcance territorial de los responsables, que hoy no existe en RLS.
  · Atender no borra: queda guardado quién lo atendió y cuándo, para un reporte futuro.
  · (12 de octubre de 2026) Los reportes pasaron a su propia vista del mapa, "Reportes", la novena
    del selector, en /mapa y en el mapa del tablero. Ya no flotan encima de las demás vistas: ahí
    tapaban el color de las secciones, que es lo que esas vistas miden. En la vista de reportes las
    secciones quedan atenuadas y sin clic, igual que en casillas, y la leyenda lista solo las
    categorías con pendientes y cuántos hay de cada una.
  · (12 de octubre de 2026) Foto opcional, una por reporte. Se comprime igual que la de
    actividades (`comprimirFoto`) y sube por `/api/fotos` con `destino=reporte` a
    `reportes/<id de quien lo levanta>/`. Se sube al guardar, antes del reporte, y la columna
    `reportes_territorio.foto_ruta` guarda la ruta. El trigger rechaza rutas fuera de la carpeta
    propia o que no existan en la cubeta, y la lectura de la cubeta sigue la regla de la tabla
    (admin todas, cada quien las suyas). Hueco conocido: si la subida pasa y el insert del reporte
    falla, la foto queda suelta en la cubeta sin nadie que la enlace; solo el admin la alcanza.

- **Cierre de pendientes de código (12 de octubre de 2026).** Revisados contra el código y la base,
  no contra este archivo:
  · **55, resuelta.** El riel de escritorio (`components/navegacion/dock.tsx`) ya trae Registrar
    representante, Carga masiva, Exportar y Levantar reporte. Causa de fondo: el riel se arma con
    una lista fija y todo destino que no estuviera en ella desaparecía sin avisar. Ahora cualquier
    destino que falte en `GRUPOS` sale al final. Con todo, el riel del administrador ya no cabe en
    una pantalla de 720 de alto: se desplaza por dentro, y las etiquetas van en un portal para que
    el desplazamiento no las recorte.
  · **65, resuelta.** `personas.recibio_apoyo` se soltó de la base. Antes se comprobó que ninguna
    rama publicada (main, soet) ni ninguna vista o función la usaba, y que ningún renglón la tenía
    en verdadero. El Excel de personas, que la había vuelto a usar, ya no la pide.
  · **70, resuelta.** Los dos renglones de `fotos` que apuntaban a archivos borrados (inicio y
    cierre de "Recorrido por la colonia Reforma") se borraron. La actividad sigue en curso: se
    pueden volver a subir desde su ficha.
  · **52, resuelta.** `components/tablero/indicador.tsx` borrado; nadie lo importaba.
  · **37 y 38 ya estaban resueltas** en `v_demarcacion_resumen` y `v_seccion_resumen`
    (`tiene_geometria`), sin anotarse aquí. También 21 (el trigger sella `promovido_por`), 39 (el
    tablero ya pasa `estatusVisibles`) y 40 (la agenda ya recorta en la consulta).
  · **Lint en cero errores.** Cuatro buscadores limpiaban estado dentro de un efecto; ahora guardan
    la respuesta junto con lo que la produjo y derivan "buscando" y los resultados al pintar. En
    `formulario-representante.tsx` eso destapó un error real: la búsqueda de nombre leía la
    sección de la casilla desde una variable declarada después y fuera de las dependencias, así
    que al cambiar de casilla seguía buscando en la sección anterior. Queda un solo aviso,
    informativo: el compilador de React no optimiza la lista virtual de Personas porque TanStack
    Virtual no es compatible con él.

## Rediseño general (12 de octubre de 2026)

71. **Rediseño de todas las pantallas, aprobado sobre maqueta. Contradice el sistema de diseño en
    varios puntos y se anota aquí en lugar de reescribir la historia.** El cliente trajo tres
    referencias (tablero, estructura territorial, personas) y aprobó una maqueta estática antes de
    tocar código. Lo que cambió respecto a `spec/sistema-diseno.md`, que ya se actualizó con una
    nota al inicio:
    · **El vidrio va en todas las tarjetas**, no solo en lo que flota sobre el mapa. Utilidad
      nueva `tarjeta` en `app/globals.css`; las de antes (`vidrio`, `capsula`, `dock`…) no se
      tocaron porque el mapa las usa.
    · **El naranja ya no vive solo en tres lugares.** Lo pidió el cliente viendo la maqueta: las
      fichas de icono de las cifras, sus flechas, la barra de cobertura y los filtros encendidos
      son naranjas. La jerarquía sigue en tinta: el destino activo del riel es una ficha en tinta
      con un punto naranja, ya no texto naranja.
    · **Fondo greige (`#f1efec`) y texto base de 14.** El spec pedía 15 a 16 fluido. En celular
      los campos se quedan en 16 para que iOS no acerque la página al enfocarlos.
    · **Radio de control de 10**, antes 6.
    · **Buscador y cuenta flotan a la derecha del título en todas las pantallas**, no solo en el
      tablero, y ya no son pegajosos. Cada pantalla arma su encabezado con
      `components/sistema/encabezado-pagina.tsx`, que reserva ese hueco.
    · **La cápsula de sesión es ahora un menú de cuenta** (`<details>`, sigue cerrando sesión sin
      JavaScript). En celular, dentro de Más, sigue siendo la caja de antes.
    · **El mapa no se rediseñó, por instrucción expresa.** `components/mapa/` no se tocó. Su
      contenedor lleva la clase `mapa-intacto`, que devuelve adentro los dos tokens que cambiaron
      (texto base y radio de control). Lo que el mapa pinta en un portal fuera de ese contenedor
      sí toma los valores nuevos; la diferencia es de un punto de letra y cuatro de radio.

72. **Tres cosas nuevas que entraron con el rediseño, todas de presentación.**
    · Las cinco cifras del tablero ahora son enlaces a `/personas`, sin filtro. Antes no llevaban
      a ningún lado. Si se quiere que cada una filtre (promovidos, quieren participar…), falta
      que `/personas` lea sus filtros de la URL: no se hizo.
    · En el tablero, "Hoy" y "Esta semana" son una sola tarjeta con un conmutador. Mismas dos
      listas, mismas consultas.
    · `⌘K` o `Ctrl+K` enfoca el buscador de la barra.

73. **Lo que traían las referencias y no se construyó porque no existe en el sistema.** Campana de
    avisos; selector de alcance ("Todo el municipio": el alcance sale de la sesión); conmutador
    mapa/lista en la tarjeta del mapa; "última actualización"; en Personas, paginación numerada,
    casillas de selección y menú por renglón; en Estructura territorial, pestañas
    Demarcaciones/Secciones/Responsables, minimapa de demarcaciones, dona y conmutador
    lista/rejilla. Cada una es una función nueva y se decide aparte.
