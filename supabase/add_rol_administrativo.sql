-- Nuevo rol "administrativo" (ítem 119): consulta (solo lectura) en
-- Contable, acceso completo a Libros y edita Panel General como un admin —
-- pero no el resto de las acciones exclusivas de admin (Equipo, Backups,
-- Configuración, etc.). A diferencia de cobranzas, SÍ depende de
-- equipo_modulos para ver cada módulo (ver requireAreaOrAdmin y
-- requireAdminOrAdministrativo en src/lib/auth.ts).
ALTER TABLE liquidadoras DROP CONSTRAINT liquidadoras_rol_check;
ALTER TABLE liquidadoras ADD CONSTRAINT liquidadoras_rol_check
  CHECK (rol = ANY (ARRAY['admin','supervisor','liquidadora','viewer','cobranzas','administrativo']::text[]));
