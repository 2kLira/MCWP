# Migraciones de la maqueta v1 — NO aplicar

Estos once archivos son la historia de la base de la maqueta, la que no tenía login ni RLS.
Se conservan como referencia de cómo se fue construyendo el modelo, y nada más.

**No se aplican a la base del proyecto real.** Dos razones:

1. `2026-09-14-rls-casillas.sql` *apaga* Row Level Security en tres tablas.
2. `2026-09-11-faseBCF-territorio-casillas.sql` y otras tres redefinen `v_seccion_resumen`
   sin `security_invoker`, lo que haría que la vista se saltara RLS.

La estructura vigente está consolidada en `supabase/schema.sql` y la seguridad en
`supabase/seguridad.sql`. Para reconstruir la base desde cero se aplican esos dos, en ese
orden, y nada de esta carpeta.
