-- Ejecutar en Supabase Dashboard → SQL Editor
-- Agrega campo para claves de acceso en clientes y fecha de baja en liquidadoras

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS claves_acceso JSONB DEFAULT '[]'::jsonb;

ALTER TABLE liquidadoras
  ADD COLUMN IF NOT EXISTS fecha_baja TIMESTAMPTZ;
