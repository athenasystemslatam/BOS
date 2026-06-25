-- Hace el email opcional en liquidadoras
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE liquidadoras
  ALTER COLUMN email DROP NOT NULL;
