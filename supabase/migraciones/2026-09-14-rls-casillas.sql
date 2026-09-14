-- Las tres tablas de la migración 2026-09-11-faseBCF quedaron con Row Level Security activo y sin
-- políticas, así que el navegador —que entra con la llave anónima— no ve ni un renglón. En el mapa
-- eso se veía como "0 de 0 casillas" con 185 cargadas en la base.
--
-- Este proyecto todavía no tiene login, y por eso NO tiene RLS en ninguna otra tabla: el filtrado
-- por territorio vive en lib/permisos.ts, en la capa de aplicación. Ver CLAUDE.md. Estas tres son
-- las únicas que quedaron distintas, así que se alinean con el resto.
--
-- OJO, esto se revierte cuando entre el bloque de cuentas de usuario: ahí RLS se enciende en TODAS
-- las tablas, estas tres incluidas, con políticas que repliquen la regla de lib/permisos.ts. No es
-- que estas tablas no deban tener RLS; es que hoy ninguna lo tiene y una sola con candado sin
-- llave no protege nada, solo rompe la pantalla.

begin;

alter table casillas               disable row level security;
alter table representantes_casilla disable row level security;
alter table resultados_historicos  disable row level security;

commit;
