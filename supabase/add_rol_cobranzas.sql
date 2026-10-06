-- Nuevo rol "cobranzas": ve todos los módulos, no puede editar nada, y no
-- necesita estar agregado al equipo de cada módulo para verlos (a
-- diferencia de admin/liquidadora/viewer, que sí dependen de equipo_modulos).
-- Ver requireAreaOrAdmin / requireLiquidadoraOrAdmin en src/lib/auth.ts.
ALTER TABLE liquidadoras DROP CONSTRAINT liquidadoras_rol_check;
ALTER TABLE liquidadoras ADD CONSTRAINT liquidadoras_rol_check
  CHECK (rol = ANY (ARRAY['admin','supervisor','liquidadora','viewer','cobranzas']::text[]));
