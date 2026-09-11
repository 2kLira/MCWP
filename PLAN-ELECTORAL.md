# Plan de la etapa electoral, versión 2

Reemplaza a `PLAN-ELECTORAL-v1.md`, que queda solo como registro de lo que se decidió antes. Este
documento recoge las notas del 11 de septiembre de 2026 y reordena todo lo que falta.

La regla de trabajo no cambia: una fase a la vez, `npm run build` al terminar cada una, y no se
empieza la siguiente sin que la anterior compile. Las migraciones las corre el cliente en el editor
SQL de Supabase.

---

## Qué cambió respecto a la versión 1

**Se da por hecho lo ya construido.** La fase 1 de la v1 (género, fecha de nacimiento, promovidos,
validación de teléfono, cumpleaños) está terminada y sembrada. La fase 4 (carga masiva de
promovidos) está terminada. De la fase 5 quedó el calor de promovidos por sección.

**Se retira trabajo terminado.** Las vistas de mapa de **problemáticas** y de **colonias** se
eliminan. La de colonias se construyó apenas y sale: lo que se quería no era una capa de calor por
colonia, sino saber qué colonias integran cada sección, que es un dato de la ficha y no del mapa. Las
problemáticas se siguen capturando y se siguen reportando; lo que desaparece es su capa en el mapa.

**Cambia el lenguaje del sistema.** "Personas" pasa a "Personas alcanzadas". El rol "colaborador"
pasa a "brigadista". No son etiquetas: son los nombres con los que esta gente se llama a sí misma, y
el sistema tiene que hablar como ellos.

**La unidad de medida deja de ser la persona y pasa a ser el voto.** Cada sección gana meta de votos
y lista nominal, y las secciones se clasifican en prioritarias A, prioritarias B y el resto. Esa
clasificación es la que manda en el mapa y en los listados.

**La casilla entra al centro.** Ya no es solo cartografía: es el lugar donde se registran titulares y
suplentes, con su estado de capacitación, de manual y de acreditación, y con barras de avance. Y el
día de la elección, 402 representantes con usuario propio reportan desde ahí.

**Cae la escalera de permisos por estatus.** Brigadistas, responsables de sección y responsables de
demarcación dejan de ver las actividades realizadas: solo programadas y en curso. Lo cerrado es
historia, y la historia es de quien coordina.

---

## Archivos que hacen falta y no están

Tres, y bloquean fases completas. Van en `data/`.

1. **Excel de lista nominal por sección.** Bloquea la meta de votos y los indicadores de avance.
2. **Archivo de coordenadas de casilla.** Bloquea el mapa de casillas y todo lo que cuelga de él.
3. **Clasificación de secciones prioritarias A y B.** Si viene dentro del Excel de lista nominal, se
   destraba junto con el primero.

Los resultados de revocación de mandato y los demás históricos se cargarán por CSV más adelante. La
tabla `resultados_historicos` ya existe y se queda vacía a propósito.

---

## Fase A · Lenguaje y limpieza

Sin dependencias. Se empieza de inmediato. Toca muchos archivos pero no tiene decisiones abiertas.

- **"Personas" pasa a "Personas alcanzadas"** en navegación, tablero, listas, reportes y filtros.
- **"Colaborador" pasa a "brigadista"**, incluido el valor del enum en la base y la tabla
  `actividad_colaboradores`, que pasa a `actividad_brigadistas`. Se renombra completo y no solo la
  etiqueta: dejar `colaborador` en el esquema mientras la pantalla dice otra cosa confunde a quien
  reciba esto después.
- **Se eliminan del mapa las vistas de problemáticas y de colonias.** Los datos se quedan, las capas
  no.
- **Actividades**: se quita `subtipo` y se agrega `crucero` a los tipos, junto a reunión, activismo y
  recorrido.

**Migración** `2026-09-11-faseA-lenguaje.sql`.

---

## Fase B · La sección como unidad de meta

Depende del Excel de lista nominal para llenarse, pero **el código se construye desde ahora** y los
campos quedan capturables a mano mientras el archivo llega.

- `secciones.lista_nominal`, `secciones.meta_votos` y `secciones.prioridad` (`a`, `b` o vacío).
- **Ficha de sección**: lista nominal, meta de votos, promovidos, y el avance contra la meta. El
  avance es lo que se mira en la junta, no el conteo suelto.
- **Detalle de colonias que integran cada sección**, desde la cartografía que ya está cargada. Es lo
  que sustituye a la capa de colonias que se retira.
- Indicadores de meta y avance en el tablero, recortados por territorio como todo lo demás.

---

## Fase C · Secciones prioritarias

Depende de la clasificación A y B.

- **Listado nuevo**, después de Recorridos: secciones prioritarias, con A y B en listas separadas,
  cada una con sus indicadores.
- **Vista de mapa nueva**, que ocupa el lugar que dejan las dos que se retiran. La escala naranja
  dice de un vistazo qué falta por recorrer: las prioritarias ya recorridas en naranja pleno, las
  prioritarias pendientes en el naranja intermedio, y las que no son prioritarias en naranja casi
  transparente, para que estén pero no compitan.
- Una sección cuenta como recorrida cuando tiene al menos una actividad de tipo recorrido en estatus
  realizada. Esa definición se escribe aquí para que no se invente dos veces.

---

## Fase D · Captura de personas alcanzadas

Sin dependencias externas. Se puede construir en paralelo a la B.

- **Problemática nueva**: servicios de salud.
- **Petición particular que requiere seguimiento**: casilla y texto en el formulario de registro. La
  tabla `solicitudes` ya tiene `requiere_seguimiento`, así que esto es interfaz y conexión, no
  esquema nuevo.
- **Promotor**: se pregunta sí o no, y al decir sí se despliega el menú de promotores registrados.
- **La sección se puede cambiar a mano.** Hoy sale del GPS o de un toque en el mapa y se muestra como
  confirmación; ahora además se puede corregir, porque el GPS falla y quien captura sabe dónde está.
  La regla de fondo no cambia: el sistema propone, la persona corrige, y queda registrado de dónde
  salió.
- **Filtro por sección en todas las listas de personas**, incluidas promovidos y representantes.
- **Exportación a Excel de promovidos**, por sección y por colonia.

---

## Fase E · Actividades y quién ve qué

Sin dependencias externas.

- **El responsable de una actividad ya no tiene que ser el responsable de esa sección.** Puede ser
  cualquiera, y la actividad lleva su propia sección, que se elige al crearla.
- **Evidencia de inicio y de cierre.** Al arrancar la actividad, el responsable sube una foto con
  sello de tiempo y coordenada; al cerrar, la evidencia final. La hora y el lugar los pone el
  sistema, no se teclean.
- **Brigadista**: solo su agenda y sus actividades programadas o en curso. Al cerrarse, la actividad
  desaparece de su vista.
- **Responsable de sección y de demarcación**: en actividades y en agenda, solo programadas y en
  curso.

---

## Fase F · Casillas y representantes

Bloqueada por el archivo de coordenadas de casilla.

- Tabla de casillas con su punto, su sección y su lista nominal.
- **Mapa de casillas.** Al seleccionar un punto se registran **titular y suplente**, editables.
- Cada representante lleva tres estados, que son los que se preguntan en la junta:
  capacitado o por capacitar, manual entregado o pendiente, acreditación o pendiente.
- **Dos barras de avance** sobre el mapa: titulares cubiertos contra faltantes, y lo mismo para
  suplentes. Es el indicador que contesta "¿cómo vamos?" sin abrir nada.

---

## Fase G · Jornada electoral

Bloqueada por las cuentas de usuario y por la fase F.

- **402 representantes con usuario propio**, cada uno atado a su casilla.
- Reporte de incidencias con foto.
- Subida de actas, **una por casilla**.
- **Contador de votos por partido**, capturado del acta.
- Métricas de la jornada: actas entregadas y casillas pendientes.

---

## Orden y dependencias

```
Fase A  Lenguaje y limpieza        se empieza hoy
Fase D  Captura de personas        se empieza hoy, en paralelo a la A
Fase E  Actividades y visibilidad  después de la A, porque toca los mismos archivos
Fase B  Sección como meta          código desde hoy, datos con el Excel de lista nominal
Fase C  Secciones prioritarias     espera la clasificación A y B
        Cuentas de usuario         prerrequisito de lo que sigue
Fase F  Casillas y representantes  espera el archivo de coordenadas
Fase G  Jornada                    después de cuentas y de la F
```
