-- BOS · Monotributo — nota libre de la deuda (17-nov-2026)
-- La ventana de Deuda de Seguimiento suma una nota libre. Se precarga con las
-- NOTAS de la planilla (que ya están en deuda_texto_original) y pasa al mes
-- siguiente junto con la deuda. Solo agrega una columna. Backup antes
-- (Monotributo → Dashboard → Backup). Ejecutar en Supabase SQL Editor.

ALTER TABLE monotributo_tareas ADD COLUMN IF NOT EXISTS deuda_nota text;

-- Verificación sugerida:
-- SELECT count(*) FROM monotributo_tareas WHERE deuda_nota IS NOT NULL;   -- 0
