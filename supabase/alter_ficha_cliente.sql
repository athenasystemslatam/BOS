-- ============================================================
-- Ficha de cliente — campos nuevos
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Idempotente: se puede correr más de una vez sin problema.
-- ============================================================

-- CUIL de acceso a ARCA — campo específico y copiable, separado del
-- array genérico claves_acceso (que sigue existiendo para usuario/contraseña/URL).
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS cuil_arca TEXT;

-- Fecha de alta como empleador ante ARCA (distinta de fecha_alta, que es
-- cuándo se cargó el cliente en el sistema).
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS fecha_alta_empleador DATE;

-- Red bancaria — renombre de vep_banco, mismo campo.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'vep_banco'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clientes' AND column_name = 'red_bancaria'
  ) THEN
    ALTER TABLE clientes RENAME COLUMN vep_banco TO red_bancaria;
  END IF;
END $$;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS red_bancaria TEXT;

-- Tipo de contribuyente (empresa / monotributista / inscripto) — antes se
-- confundía con "tipo" (mensual/quincenal). Se separa en dos columnas.
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS tipo_contribuyente TEXT DEFAULT 'empresa';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clientes_tipo_contribuyente_check'
  ) THEN
    ALTER TABLE clientes
      ADD CONSTRAINT clientes_tipo_contribuyente_check
      CHECK (tipo_contribuyente IN ('empresa', 'monotributista', 'inscripto'));
  END IF;
END $$;

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS es_quincenal BOOLEAN DEFAULT FALSE;

-- Backfill: lo que hoy dice tipo = 'quincenal' pasa a es_quincenal = true.
-- La columna vieja `tipo` queda en la tabla sin uso (no se dropea acá para
-- no arriesgar una migración irreversible) — el código deja de leerla/escribirla.
UPDATE clientes SET es_quincenal = true WHERE tipo = 'quincenal' AND NOT es_quincenal;

-- Verificación rápida
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'clientes'
ORDER BY ordinal_position;
