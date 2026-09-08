# Sistema de diseño

El producto es una herramienta de operación territorial que se usa caminando en la calle y se
presenta en una sala de juntas. Tiene que verse serio como software de gobierno y sentirse rápido
como una app de campo. El mapa es el protagonista, no un adorno del tablero.

## Color

El naranja es Pantone 151 C, `#FF8200`. Su contraste contra blanco es 2.49 a 1, o sea que **texto
naranja sobre fondo claro y texto blanco sobre botón naranja son ilegibles**. Contra negro da 7.96,
que es excelente. De ahí salen tres variantes obligatorias:

```css
--naranja:        #FF8200;  /* solo como relleno, con texto casi negro encima */
--naranja-texto:  #B35700;  /* naranja tipográfico en modo claro, 4.91 sobre blanco */
--naranja-claro:  #FF9B33;  /* naranja tipográfico en modo oscuro, 8.91 sobre el fondo */
```

Nunca pongas blanco sobre `--naranja`. El texto de un botón naranja es `--tinta`.

Los neutros son casi neutros, con una pizca de calidez solo en los extremos oscuros. Nada de fondo
crema: el naranja ya aporta toda la temperatura que el sistema necesita, y un fondo cálido lo apaga.

```css
/* claro */
--fondo: #F7F7F6;  --superficie: #FFFFFF;  --borde: #E4E3E1;
--tinta: #1C1B19;  --tinta-suave: #6B6966;  --tinta-tenue: #94918C;

/* oscuro */
--fondo: #121110;  --superficie: #1B1A18;  --borde: #2E2C29;
--tinta: #F5F4F2;  --tinta-suave: #A3A09B;  --tinta-tenue: #6E6B66;
```

Una sola señal de alerta, `#C0362C` en claro y `#FF6B5E` en oscuro. Los estados de las actividades y
la etiqueta de sección sin responsable van en neutros, no en colores. Sin responsable se representa
con relleno hueco y borde punteado, no con rojo: no es un error, es trabajo pendiente.

La escala del mapa va del neutro al naranja pleno, cinco pasos, y es donde el naranja deja de ser
decoración y se vuelve información:

```css
--mapa-0: #EFEDEA;  --mapa-1: #FFE0BF;  --mapa-2: #FFC48A;
--mapa-3: #FFA34D;  --mapa-4: #FF8200;
```

### Dónde vive el naranja

Solo en tres lugares: la escala del mapa, una única acción primaria por pantalla, y los estados de
foco junto con el destino activo del menú y el marcador de hoy en la agenda. En las gráficas, una
sola serie naranja y todo lo demás en neutros. Si ves dos cosas naranjas al mismo tiempo que no son
de la misma categoría, una está mal.

Títulos, cuerpo, bordes, iconos, botones secundarios y etiquetas de estatus van todos en neutros.

## Tipografía

IBM Plex Sans, una sola familia, pesos 400, 500 y 600. Se eligió por linaje institucional, por su
buen tratamiento de acentos y eñes, y sobre todo porque tiene cifras tabulares reales, que en un
sistema lleno de conteos y claves de sección importa más que la personalidad.

Todo lo numérico lleva `font-variant-numeric: tabular-nums`: indicadores del tablero, claves de
sección, columnas de tablas, conteos de menciones. No metas una familia monoespaciada para eso.

```css
--texto-xs:   0.75rem;                                        /* 12, etiquetas de tabla */
--texto-sm:   0.8125rem;                                      /* 13, apoyo */
--texto-base: clamp(0.9375rem, 0.90rem + 0.20vw, 1rem);
--texto-lg:   clamp(1.0625rem, 1.00rem + 0.30vw, 1.1875rem);
--texto-xl:   clamp(1.25rem, 1.15rem + 0.50vw, 1.5rem);
--texto-cifra: clamp(1.75rem, 1.40rem + 1.60vw, 2.5rem);      /* indicadores */
```

Interlineado 1.5 en cuerpo, 1.2 en títulos y cifras. Longitud de línea máxima 68 caracteres en texto
corrido. Sentence case en todo, incluidos botones y encabezados de tabla. Cero versalitas, cero
etiquetas en mayúsculas sostenidas.

## Espacio, forma, elevación

Base de 4 píxeles. Escala 4, 8, 12, 16, 24, 32, 48, 64.

Los radios cambian según jerarquía, no son uno solo para todo: 6 en controles y campos, 12 en
tarjetas, 20 en hojas y paneles que suben desde abajo, 999 en píldoras de estatus.

La sombra se usa poco y nunca es la gris genérica. En modo claro, `0 1px 2px rgba(28,27,25,.06)` para
apoyo y `0 8px 24px rgba(28,27,25,.10)` para lo que flota. En modo oscuro no hay sombras: la
elevación se lee con un borde un paso más claro.

## Vidrio

El vidrio va **solo en las superficies que flotan encima del mapa**: la ficha lateral de sección, la
barra superior del mapa y el selector de capas. En ningún otro lado.

```css
backdrop-filter: blur(20px) saturate(1.4);
background: rgba(255,255,255,.72);   /* oscuro: rgba(27,26,24,.72) */
border: 1px solid rgba(255,255,255,.55);  /* oscuro: rgba(255,255,255,.08) */
```

Dos reglas que lo salvan. Mientras el mapa se mueve, apaga el desenfoque y súbele la opacidad a .92;
nadie lo nota y recuperas veinte cuadros por segundo en celular. Y sobre vidrio el texto va siempre
en `--tinta`, nunca en naranja, porque el desenfoque ya se comió parte del contraste.

En el tablero, donde no hay mapa detrás, el vidrio no aplica. Si en algún momento hace falta, ponle
al fondo un lavado apenas perceptible con una gota de naranja para que el vidrio tenga de qué
agarrarse, pero no lo fuerces.

## Movimiento

Nada de rebote, nada de sobrepaso, nada de resortes. Una sola familia de curvas.

```css
--curva: cubic-bezier(0.2, 0, 0, 1);
--dur-ui: 160ms;      /* cambios de estado, apertura de menús */
--dur-panel: 240ms;   /* fichas y hojas */
--dur-camara: 600ms;  /* movimientos de mapa */
```

Lo que sí se anima, en orden de importancia:

El mapa al cambiar de capa. Los polígonos interpolan color, no saltan, con un desfase mínimo entre
secciones vecinas de modo que el cambio recorra el mapa. MapLibre lo hace nativo con transiciones
sobre las propiedades de pintado.

La cámara al seleccionar una sección: se desplaza y ajusta encuadre con la curva, nunca salta.

La ficha lateral no aparece de la nada, crece desde el polígono tocado. Lo mismo entre la lista de
personas y la ficha individual: el nombre viaja, no desaparece y reaparece. Usa transiciones de
elemento compartido donde el navegador las soporte, y una transición sencilla donde no.

La entrada del tablero, una sola vez al montar: los indicadores cuentan hacia su número en unos 700
milisegundos con desaceleración, las gráficas se trazan una vez, con escalonado de 60 milisegundos
entre elementos. Nunca se repite al volver con scroll.

Lo que no se anima: las tarjetas al tocarlas. Nada de inclinación en tres dimensiones, nada de
elevación al pasar el cursor. Se ve barato y es el tell más común de una maqueta hecha con prisa.

Solo una cosa se mueve a la vez. Y respeta `prefers-reduced-motion`: cuando esté activo, todo se
reduce a cambios instantáneos y desvanecidos de 80 milisegundos.

Nada de indicadores giratorios. Esqueletos que se disuelven en el contenido.

## Estructura y respuesta

Tres anchos, no más: 390 para celular, 768 para tableta, 1280 para escritorio. El contenedor tope
en 1280. Diseña los dos extremos y deja que lo de en medio se acomode.

La navegación cambia de forma, no de tamaño. En celular, barra inferior fija con cinco destinos:
Tablero, Agenda, Registrar, Mapa y Más. Registrar va al centro, en relleno naranja, y es la única
acción naranja de esa barra. En escritorio, barra lateral colapsable con la lista completa y sin
botón central.

Las tablas nunca hacen que la página se desplace de lado. Se envuelven en su propio contenedor con
desplazamiento horizontal, o en celular se convierten en tarjetas apiladas.

Durante actividades los botones son grandes de verdad: altura mínima 48 píxeles, área táctil de 44
como piso absoluto en cualquier control.

## Piso de calidad

Foco visible con anillo de 2 píxeles en `--naranja` y desplazamiento de 2. Contraste mínimo 4.5 a 1
en todo texto. La lista de personas va virtualizada desde el primer día: con dos mil registros
sembrados, un solo tirón a treinta cuadros por segundo destruye más la sensación de producto
terminado que cualquier animación mal elegida.
