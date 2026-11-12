-- ============================================================
-- BOS · Módulo Libros — "Sacar de la cola"
-- Una tarea sacada de la cola queda en un estado final propio (no cuenta
-- como copiado) con quién, cuándo y por qué. Solo aditivo. Se puede correr
-- más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- Correr ANTES de pushear el código que lo usa.
-- ============================================================

ALTER TABLE libros_tareas ADD COLUMN IF NOT EXISTS quitada_en     TIMESTAMPTZ;
ALTER TABLE libros_tareas ADD COLUMN IF NOT EXISTS quitada_por    UUID REFERENCES liquidadoras(id) ON DELETE SET NULL;
ALTER TABLE libros_tareas ADD COLUMN IF NOT EXISTS quitada_motivo TEXT;

INSERT INTO libros_estados (nombre, orden, es_final, codigo) VALUES
  ('Sacada de la cola', 70, TRUE, 'quitada')
ON CONFLICT (codigo) DO NOTHING;
