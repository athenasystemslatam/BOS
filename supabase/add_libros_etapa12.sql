-- ============================================================
-- BOS · Módulo Libros — Etapa 12 (ítems 3, 7, 8)
-- Solo aditivo. Se puede correr más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- Correr ANTES de pushear el código que lo usa.
-- ============================================================

-- Ítem 3: número de acta en movimientos
ALTER TABLE libros_movimientos ADD COLUMN IF NOT EXISTS acta_numero TEXT;

-- Ítem 7: orden manual en pedidos (para drag-and-drop por prioridad)
ALTER TABLE libros_pedidos ADD COLUMN IF NOT EXISTS orden_manual INTEGER NOT NULL DEFAULT 0;

-- Ítem 8a: ampliar el CHECK de métrica en objetivos para aceptar 'relevamiento'
ALTER TABLE libros_objetivos DROP CONSTRAINT IF EXISTS libros_objetivos_metrica_check;
ALTER TABLE libros_objetivos ADD CONSTRAINT libros_objetivos_metrica_check CHECK (metrica IN (
  'mandatos_cargados', 'renovaciones_iniciadas', 'renovaciones_cerradas',
  'datos_completos', 'puesta_al_dia', 'envios_60_dias', 'relevamiento'
));

-- Ítem 8b: tabla de relevamiento por cliente (una fila por cliente de Libros)
CREATE TABLE IF NOT EXISTS libros_relevamiento (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  estado         TEXT        NOT NULL DEFAULT 'pendiente'
                             CHECK (estado IN ('pendiente', 'relevada')),
  fecha          DATE,
  relevado_por   UUID        REFERENCES liquidadoras(id),
  notas          TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cliente_id)
);
ALTER TABLE libros_relevamiento ENABLE ROW LEVEL SECURITY;

-- Ítem 8c: objetivo inicial de relevamiento (solo si no existe)
INSERT INTO libros_objetivos (nombre, metrica, meta, fecha_limite, orden)
SELECT 'Relevamiento de libros completo', 'relevamiento', 100.0, date '2026-11-30', 70
WHERE NOT EXISTS (
  SELECT 1 FROM libros_objetivos WHERE nombre = 'Relevamiento de libros completo'
);
