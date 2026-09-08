# Cartografía Oaxaca de Juárez

Paquete listo para consumir. Todo en EPSG:4326 (WGS84), sin shapefiles, sin reproyección
pendiente, sin problemas de encoding. Origen: marco geográfico electoral del INE, entidad 20,
municipio 066, cruzado contra el catálogo de 14 demarcaciones y 169 secciones que entregó el
cliente.

## Archivos

**secciones.geojson** (156 KB) — 157 polígonos. Simplificados a 3 metros de tolerancia, lo bastante
ligeros para cachearse en el service worker y resolver punto en polígono en el navegador sin red.
Propiedades: `seccion` (entero), `clave` (texto de 4 dígitos con ceros), `demarcacion`,
`distrito_local`, `distrito_federal`, `area_km2`, `lon` y `lat` del centroide para colocar etiquetas,
`sustituta`, y en las sustitutas también `confianza`, `secciones_sucesoras` y `nota`.

**colonias.geojson** (218 KB) — 286 polígonos con `nombre`, `cp`, `demarcacion_principal`, `partida`
y el arreglo `secciones`. Es capa de referencia y de autocompletado, no fuente de verdad territorial.

**colonia-seccion-demarcacion.csv** — 477 filas, la relación completa con el porcentaje de traslape
de cada colonia sobre cada sección. Umbral de corte en 2 por ciento para descartar roces de frontera.

**colonias-en-disputa.csv** — las 28 colonias que caen en más de una demarcación, con el reparto
porcentual y una sugerencia basada en el traslape dominante. Esta es la lista que revisa el socio.

**demarcaciones.json** — el catálogo completo, con las secciones del catálogo, cuáles tienen
geometría, cuáles son sustitutas, las colonias de cada demarcación y el centro para encuadrar el
mapa. Incluye un bloque `meta` con bbox y centro del municipio.

## Advertencia importante

La cartografía es anterior al catálogo. Hubo reseccionamiento: 18 secciones del catálogo
(2541 a 2543 y 2573 a 2587) no existen en ningún archivo, y 6 secciones de la cartografía
(0471, 0478, 0493, 0500, 0593 y 0616) ya no aparecen en el catálogo. Dieciocho nuevas menos seis
viejas explican exactamente la diferencia de doce.

Para la maqueta esas 6 quedan como sustitutas visuales, pintadas con el color de la demarcación a la
que pertenecen sus herederas. Vienen marcadas con `sustituta: true` y un nivel de confianza:

- 0471 a Pueblo Nuevo, 0478 a San Luis Beltrán y 0616 a Trinidad de Viguera son de confianza alta,
  ancladas en colonias homónimas.
- 0593 a San Juan Chapultepec es de confianza media.
- 0493 y 0500 quedan tentativamente en Cabecera Municipal porque están rodeadas de secciones suyas.

Para producción hay que bajar el marco geográfico electoral vigente del INE. Con esa versión las 169
secciones cuadran solas y estas seis excepciones desaparecen.

## Nota de escala

Cabecera Municipal concentra 86 de las 169 secciones del catálogo. En el tablero y en el mapa esa
demarcación va a dominar visualmente sobre las otras trece, y varias tienen una o dos secciones.
No es un error de los datos, es cómo está organizado el territorio, pero conviene tenerlo presente
al diseñar los reportes comparativos.
