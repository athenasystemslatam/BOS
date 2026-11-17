-- BOS · Monotributo — historial de cambios y deshacer (17-nov-2026)
-- Cada cambio queda con el antes y el después, quién y cuándo. "Revertir" crea
-- una entrada nueva (revierte_id) y nunca borra. Se registran: estado del mes,
-- deuda, deuda avisada, intimación, categoría y demás campos del mes; forma de
-- pago, medio y demás datos de la ficha; responsable; marcas de revisión
-- resueltas / confirmadas / reabiertas; alertas resueltas / reabiertas; y los
-- cambios del calendario ARCA.
-- Solo agrega: una tabla nueva y dos columnas nuevas. Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS monotributo_historial (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     uuid        REFERENCES clientes(id) ON DELETE CASCADE,  -- null en el calendario
  anio           int,
  mes            int         CHECK (mes BETWEEN 1 AND 12),
  entidad        text        NOT NULL CHECK (entidad IN ('tarea', 'ficha', 'responsable', 'revision', 'alerta', 'calendario')),
  campo          text        NOT NULL,
  valor_anterior jsonb,
  valor_nuevo    jsonb,
  usuario_id     uuid        REFERENCES liquidadoras(id),             -- null = automático
  creado_en      timestamptz NOT NULL DEFAULT now(),
  -- Si esta entrada es un "Revertir" / "Deshacer": la entrada que revierte.
  revierte_id    uuid        REFERENCES monotributo_historial(id),
  -- Id de la marca de revisión o de la alerta resuelta a la que se refiere.
  ref_id         uuid,
  nota           text
);
ALTER TABLE monotributo_historial ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS monotributo_historial_cliente_idx ON monotributo_historial (cliente_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS monotributo_historial_fecha_idx ON monotributo_historial (creado_en DESC);
CREATE INDEX IF NOT EXISTS monotributo_historial_revierte_idx ON monotributo_historial (revierte_id) WHERE revierte_id IS NOT NULL;

-- "Reabrir" una alerta marcada Resuelta por error: no se borra la fila, se marca reabierta.
ALTER TABLE monotributo_alertas_resueltas
  ADD COLUMN IF NOT EXISTS reabierta_at  timestamptz,
  ADD COLUMN IF NOT EXISTS reabierta_por uuid REFERENCES liquidadoras(id);

-- Verificación sugerida:
-- SELECT count(*) FROM monotributo_historial;   -- 0 al principio
