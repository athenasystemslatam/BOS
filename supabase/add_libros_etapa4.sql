-- ============================================================
-- BOS · Módulo Libros Societarios — Etapa 4
-- Tabla de configuración (umbral de folios configurable).
-- Requiere add_libros_etapa3.sql corrido. Se puede correr más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

CREATE TABLE IF NOT EXISTS libros_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  umbral_folios INTEGER NOT NULL DEFAULT 10 CHECK (umbral_folios > 0)
);
ALTER TABLE libros_config ENABLE ROW LEVEL SECURITY;

-- Una sola fila; si ya existe no hace nada.
INSERT INTO libros_config (umbral_folios)
SELECT 10 WHERE NOT EXISTS (SELECT 1 FROM libros_config);
