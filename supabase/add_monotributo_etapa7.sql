-- BOS · Módulo Monotributo — etapa 7: alertas internas (16-nov-2026)
-- Las alertas se calculan en el momento a partir del estado del mes y la ficha
-- del cliente, y se cierran solas cuando el estado cambia. Esta tabla guarda
-- solo las que se cierran a mano con "Resuelta" (las que no tienen un estado
-- en BOS que las cierre, hoy: intimación Sí / Fijarse), con quién y cuándo.
-- Si el valor que la disparó cambia, la alerta vuelve a aparecer.
-- Solo agrega una tabla. Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS monotributo_alertas_resueltas (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id   uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tipo         text        NOT NULL,
  anio         int         NOT NULL,
  mes          int         NOT NULL CHECK (mes BETWEEN 1 AND 12),
  -- Valor que tenía el dato cuando se marcó "Resuelta" (ej. 'si' / 'fijarse').
  valor        text,
  nota         text,
  resuelta_por uuid        REFERENCES liquidadoras(id),
  resuelta_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE monotributo_alertas_resueltas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS monotributo_alertas_resueltas_periodo_idx
  ON monotributo_alertas_resueltas (anio, mes);

-- Verificación sugerida:
-- SELECT count(*) FROM monotributo_alertas_resueltas;   -- 0
