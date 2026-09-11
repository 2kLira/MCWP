# Plan de la etapa electoral

Este documento traduce la lista de requerimientos nuevos a fases construibles, en el orden en que se
pueden construir. La regla de trabajo no cambia: una fase a la vez, `npm run build` al terminar cada
una, y no se empieza la siguiente sin que la anterior compile.

El cambio de fondo es que el sistema deja de ser solo estructura territorial y se vuelve además
operación electoral: casillas, promovidos y jornada. Eso trae dos consecuencias que conviene decir
antes de escribir una línea de código.

**La primera.** Las fases 6 y 7 no se pueden construir sin cuentas de usuario. Un jefe de casilla que
reporta un acta tiene que ser una persona identificada, y un capturista al que se le caduca el acceso
necesita tener un acceso que caducar. El bloque de autenticación deja de ser trabajo de producción y
se convierte en prerrequisito de esas dos fases.

**La segunda.** La intención de voto es dato personal sensible. Un teléfono y un nombre son datos
personales normales; saber que una persona va a votar en cierto sentido revela su opinión política, y
eso cambia el nivel de consentimiento y de protección que exige la ley. No es un detalle de abogados:
condiciona el aviso de privacidad, el cifrado de esa columna y quién puede consultarla. Está anotado
en `PENDIENTES.md` y hay que resolverlo antes de la primera carga real de promovidos.

---

## Fase 1 · Ficha de persona completa

La más barata y la que no depende de nadie. Se puede empezar hoy.

**Base de datos**

- `personas.genero` — enum `mujer | hombre | otro | no_especifica`. Se captura, nunca se infiere.
- `personas.fecha_nacimiento` — `date`, opcional. De ahí sale la edad, que no se guarda calculada.
- `personas.es_promovido` — booleano, con `promovido_en` y `promovido_por`.
- `personas.quiere_ser_representante` — booleano.
- Vista `v_cumpleanos_hoy`, recortada por territorio como todas las demás.

**Por qué booleano y no un estatus con escalones.** Un estatus tipo
`alcanzada → interesada → promovida` obliga a que las tres cosas sean excluyentes, y no lo son: una
persona puede querer información, querer participar y además ser promovida, las tres a la vez. Los
tres campos ya existentes o nuevos son independientes y el conteo de promovidos sale igual de fácil.
Si el socio prefiere la escalera, es un cambio de una columna y está anotado en `PENDIENTES.md`.

**Interfaz**

- Registro rápido: género y fecha de nacimiento. Ninguno obligatorio, para no alargar la captura en
  la calle.
- Teléfono con validación de número mexicano: diez dígitos, lada existente, y aviso en vivo si ya
  está registrado. El duplicado ya se detecta hoy; lo que falta es rechazar de entrada lo que no
  puede ser un teléfono. En la maqueta se conserva la advertencia de que el número esté fuera del
  rango sembrado.
- Filtros de la lista de personas: quiere participar, quiere información, promovido, quiere ser
  representante, género y rango de edad.
- Tablero: zona de cumpleaños de hoy, con el botón de WhatsApp que ya existe en la ficha.

**Tamaño** Chico. Nada de esto toca el mapa.

---

## Fase 2 · Las 169 secciones

**Está bloqueada, y conviene saberlo desde ahora.** El repositorio tiene geometría de 157 secciones.
El catálogo de 169 no está en `data/`: de las 18 secciones sin geometría, la cartografía solo nombra
9 como sucesoras de las sustitutas. Las otras 9 no aparecen en ningún archivo del proyecto.

**Lo que hay que pedir** El listado de las 169 claves de sección con su demarcación asignada. Es un
archivo chico y con eso la fase se destraba.

**Lo bueno** El esquema ya está preparado. La geometría vive en su propia tabla, `secciones_geom`,
separada del catálogo `secciones`. Así que las 169 entran al catálogo y solo 157 tienen polígono, sin
inventar geometrías falsas.

- `secciones.tiene_geometria` — derivado de la existencia del renglón en `secciones_geom`.
- Las 18 sin polígono aparecen en listas, conteos, buscador y asignación de responsables, con la nota
  de que no se pintan todavía. Igual de visibles que las sustitutas, por la misma razón: esconderlas
  produce cifras que no cuadran.
- Los conteos del tablero pasan a decir 169, y el mapa sigue pintando 157. Esa diferencia se explica
  en la propia pantalla, no en la junta.

**Tamaño** Chico una vez que llegue el archivo.

---

## Fase 3 · Casillas y representantes

**Base de datos**

- `casillas` — `id`, `seccion_clave`, `tipo` (`basica | contigua | extraordinaria | especial`),
  `numero`, `nombre_ubicacion`, `domicilio`, `lat`, `lng`, `lista_nominal`, `ubicacion_confirmada`.
- `representantes_casilla` — `persona_id`, `casilla_id`, `cargo`
  (`propietario_1 | propietario_2 | suplente | general`), `acreditado`, `asignado_por`, `asignado_en`.

**Interfaz**

- Capa de casillas en el mapa, sobre los polígonos de sección, con conteo agrupado al alejar.
- **Fijar coordenada.** Herramienta para colocar y mover el punto de una casilla con un toque en el
  mapa, igual que se resuelve hoy la ubicación de una persona. Al confirmar se marca
  `ubicacion_confirmada` con quién y cuándo. Es la respuesta al catálogo del INE, que trae domicilio
  pero no siempre coordenada usable.
- Bandeja de candidatos a representante: la gente que marcó que quiere serlo, filtrada por sección,
  lista para asignar a una casilla.
- Ficha de casilla: ubicación, lista nominal, representantes asignados y huecos por cubrir.
- Ficha de sección: sus casillas y cuántos representantes le faltan.

**Lo que hay que pedir** El catálogo de casillas con domicilio y lista nominal. Si no trae
coordenadas, se fijan a mano con la herramienta anterior, que para eso existe.

**Tamaño** Mediano. Es la primera fase que toca el mapa de verdad.

---

## Fase 4 · Carga masiva de promovidos

**Interfaz**

- Pantalla de importación con plantilla descargable, para que el archivo llegue con las columnas
  correctas en lugar de adivinarlas.
- Validación renglón por renglón antes de escribir nada: teléfono válido, sección existente, nombre
  presente.
- Previsualización con tres montones a la vista: nuevos, ya existentes que se van a marcar como
  promovidos, y rechazados con el motivo escrito en español.
- Nada se escribe hasta que alguien confirma. Una persona que ya existe nunca se sobrescribe en
  silencio: se le agrega la marca de promovida y el origen.
- Cada importación queda registrada con quién la hizo, cuándo, cuántos renglones y de qué archivo.

**Por qué tanto cuidado** La carga masiva es la vía más fácil por la que entran datos de origen
dudoso a un sistema como este. El registro de origen no es burocracia: es lo que permite deshacer una
carga completa si resulta que el archivo no debía estar ahí.

**Tamaño** Mediano.

---

## Fase 5 · Mapas de calor

Tres capas nuevas sobre la misma escala naranja que ya define el sistema de diseño.

**Colonias.** Calor por colonia. Con una advertencia que hay que poner en la propia pantalla: la
colonia es referencia, no unidad exacta, y 28 colonias están partidas entre demarcaciones. El conteo
se hace por la colonia declarada de cada persona, no por geometría, y cuando colonia y sección se
contradicen sigue ganando la sección.

**Revocación de mandato.** Capa con el resultado por sección. Se carga en una tabla genérica,
`resultados_historicos` — `proceso`, `seccion_clave`, `lista_nominal`, `participacion`, `votos` —
para que sirva igual con cualquier otra elección pasada sin volver a tocar el esquema. Los resultados
de la consulta de 2022 por sección son públicos y los publica el INE.

**Promovidos.** Calor de promovidos por sección, y avance contra meta cuando existan metas.

**Tamaño** Mediano. La cañería del mapa ya existe; esto agrega capas, no motor.

---

## Fase 6 · Jornada electoral

**Requiere cuentas de usuario.** No se puede construir antes del bloque de autenticación.

**Base de datos**

- `jornada_checkin` — el jefe de casilla declara que está en su casilla, con hora y coordenada. La
  coordenada se compara con la de la casilla y se marca si no coincide.
- `incidencias` — casilla, hora, tipo, descripción, foto, gravedad, estado de atención.
- `actas` — casilla, foto del acta, votos capturados, hora, quién.
- Vista de preconteo: agregación en vivo de las actas capturadas, siempre acompañada del porcentaje
  de casillas que ya reportaron, porque un preconteo sin ese porcentaje no significa nada.

**Interfaz**

- Mapa de jornada con las casillas coloreadas por estado: sin reportar, instalada, con incidencia,
  acta recibida.
- Pantalla de jefe de casilla, pensada para celular y para un pulgar: estoy en casilla, reportar
  incidencia, subir acta.
- Preconteo con su etiqueta bien visible de que es un cálculo interno y no un resultado oficial.
- **Compartir mapa** con enlace de solo lectura, caducable, que muestra únicamente agregados por
  casilla. Ningún nombre, ningún teléfono, ninguna ficha de persona.

**La consecuencia técnica que hay que aceptar.** El día de la jornada la señal se cae, y se cae justo
donde hay más gente. La cola de captura sin señal, que hasta hoy estaba fuera de alcance y cotizada
aparte, deja de ser opcional en esta fase: sin ella, un acta capturada en una escuela sin señal se
pierde. Hay que construirla aquí o asumir que el preconteo va a tener huecos.

**Tamaño** Grande. Es la fase más pesada de todas y la que tiene fecha inamovible.

---

## Fase 7 · Capturistas por actividad

**Requiere cuentas de usuario.**

- Invitar a una persona a una actividad genera un acceso temporal, atado a esa actividad y a su
  sección.
- Ese acceso abre una sola pantalla: el formulario de registro. Sin listas, sin mapa, sin fichas, sin
  buscador.
- Al cerrar la actividad el acceso caduca solo. La sesión se invalida y la pantalla deja de servir.
- Lo capturado no se borra. Queda atribuido a esa persona y a esa actividad, para siempre.

**Una precisión sobre el requerimiento** «Se les borra su página» se implementa como caducidad del
acceso, no como borrado de datos. Borrar lo capturado dejaría la actividad sin sus registros y
rompería los conteos que el sistema consolida al cerrarla.

**Por qué esta fase mejora la seguridad en lugar de complicarla.** Hoy el modo de invitar a alguien a
capturar sería darle una cuenta permanente. Un acceso que expira solo, atado a una actividad y a un
territorio, es la versión estrecha de eso: menos gente con llave, y por menos tiempo.

**Tamaño** Mediano, una vez que existan las cuentas.

---

## Orden y dependencias

```
Fase 1  Ficha de persona          sin dependencias, se empieza hoy
Fase 2  169 secciones             espera el catálogo del cliente
Fase 3  Casillas                  espera el catálogo de casillas
Fase 4  Carga masiva              después de la fase 1
Fase 5  Mapas de calor            después de las fases 3 y 4
        Cuentas y permisos        prerrequisito de lo que sigue
Fase 6  Jornada                   después de cuentas, y con cola sin señal
Fase 7  Capturistas efímeros      después de cuentas
```

Las fases 1, 2, 4 y 5 se pueden seguir presentando como maqueta con datos sembrados. Las fases 6 y 7
ya no: implican gente identificada haciendo cosas reales, y ahí se cruza la línea a producción.

## Lo que hay que pedir para destrabar

1. Catálogo de las 169 secciones con su demarcación.
2. Catálogo de casillas con domicilio, tipo y lista nominal.
3. Resultados de revocación de mandato por sección, si se quieren de una fuente distinta a la pública
   del INE.
4. Decisión sobre el aviso de privacidad y el tratamiento de la intención de voto.
5. Confirmación de si «promovido» es un campo independiente o un escalón de estatus.
