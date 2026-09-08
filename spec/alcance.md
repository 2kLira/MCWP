# Alcance

Criterio: todo lo que se pueda probar de verdad se construye de verdad, contra base de datos. Solo
queda como humo lo que depende de una decisión del cliente o de contratar un servicio.

## Funcional, contra base de datos

**Conmutador de rol.** Arriba a la derecha en escritorio, dentro de Más en celular. Cambia entre
administrador general, un responsable de demarcación concreto, un responsable de sección y un
colaborador. Al cambiar, todo el sistema se recorta en vivo: el tablero muestra menos, el mapa
resalta solo el territorio propio, la lista de personas se acorta, los botones de crear desaparecen.
Esto responde la pregunta de permisos antes de que la hagan en la junta, así que tiene que ser
inmediato y notorio.

**Tablero.** Indicadores calculados: personas registradas, nuevas de la semana, cuántas quieren
participar, responsables territoriales, reuniones, actividades y recorridos realizados, secciones con
responsable. Próximas actividades agrupadas en hoy y esta semana. Pendientes: personas sin
seguimiento, actividades por cerrar, secciones sin responsable. Y el mapa resumido, que ocupa el
lugar principal y desde el cual se entra a la ficha de una sección.

**Personas.** Lista virtualizada con búsqueda y filtros por demarcación, sección, quiere participar y
quiere información. Ficha con datos, ubicación, historial cronológico automático, problemáticas que
mencionó y seguimientos. Alta y edición.

**Registro rápido desde celular.** El corazón del sistema. Nombre, teléfono, calle, quiere
participar, quiere información, problemáticas, comentario, consentimiento. La sección se resuelve con
el GPS del celular contra los polígonos cacheados, sin red y sin espera, y se muestra al capturista
como confirmación, no como campo a llenar. Si no hay GPS, un toque en el mapa. Detección de teléfono
duplicado en el momento, con el camino de agregar participación marcado por defecto.

**Actividades.** Los tres tipos en una sola entidad. Creación, asignación de responsable y
colaboradores, ciclo programada a en curso a realizada o cancelada. Dentro de la actividad, registrar
personas y problemáticas, notas y fotos. Al cerrar, el sistema consolida solo: asistentes, personas
nuevas, cuántas quieren participar, cuántas quieren información, y el conteo de menciones por
problemática ordenado. El responsable únicamente escribe la conclusión general.

**Estructura territorial.** Las catorce demarcaciones con sus cifras, y al entrar, sus secciones con
responsable, personas, actividades, última y próxima. Ficha de sección completa con la lista de
personas de esa sección. Secciones sin responsable visibles y contables.

**Mapa.** MapLibre con los polígonos de sección y las cinco vistas: estructura, personas, actividad,
problemáticas y recorridos. Cada vista repinta con la escala naranja. Ficha lateral en vidrio al
seleccionar. Cambio de capa animado como dice el sistema de diseño. Este es el momento que vende, es
donde se pone el mayor cuidado.

**Agenda.** Hoy, esta semana, este mes y calendario. Botón de nueva actividad con los tres tipos.

**Seguimiento.** Bandeja de personas por atender, registro de seguimientos con tipo y nota, estados
pendiente, en seguimiento y atendido.

**Reportes.** Semanal general, por demarcación y de problemáticas, calculados en vivo. Con
exportación a CSV desde cualquier tabla, que cuesta poco y en juntas siempre lo preguntan.

**Buscador general.** Una sola caja que resuelve tres cosas: nombre de demarcación o colonia, nombre
de persona, y clave de sección de cuatro dígitos. Cada una abre lo que corresponde.

**Usuarios.** Alta, edición, asignación de rol y territorio, activación y desactivación. Solo visible
para el administrador.

**Fotos.** Galería sembrada en las actividades realizadas, más subida real con compresión en el
navegador. En la presentación se puede tomar una foto en vivo y aparece, que siempre pega bien.

## Humo, con motivo

**Geocodificación desde dirección escrita.** Depende de contratar un servicio. En la maqueta el
campo de calle es texto libre y la sección sale del GPS o del toque en el mapa, que funciona igual de
bien. El autocompletado usa las 286 colonias del archivo local.

**Operación sin señal.** Los polígonos ya están cacheados y la resolución de sección funciona sin
red, eso es real. Lo que no se construye es la cola de sincronización de capturas. Se explica en la
junta y se cotiza aparte.

**Aviso de privacidad.** El campo de consentimiento existe, se guarda y se muestra con su versión.
El texto va provisional con una nota visible de que está pendiente de revisión legal.

**Mensajes y notificaciones.** Fuera. El botón de WhatsApp en una ficha abre el enlace normal de
WhatsApp, nada más.

**Respaldos y bitácora de auditoría.** Fuera de la interfaz. El registro de quién capturó cada cosa
sí es real y sí se guarda, solo que no hay pantalla que lo muestre.

**Row Level Security.** Fuera, por la decisión de no tener login. Está anotado como trabajo de
producción.

## Lo que hay que decir en la junta sin que se los pregunten

Que seis secciones traen geometría de referencia porque el INE resecccionó y hace falta el marco
vigente. Que las veintiocho colonias partidas entre demarcaciones necesitan una decisión de ellos.
Que Cabecera Municipal concentra ochenta y seis de las ciento sesenta y nueve secciones y quizá
convenga subdividirla. Que la maqueta no tiene login y por eso no puede recibir datos reales
todavía.
