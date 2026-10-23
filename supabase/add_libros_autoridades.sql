-- Módulo Libros — Cargos vigentes (autoridades) de cada cliente
-- Correr en Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS clientes_autoridades (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id    UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  cargo         TEXT        NOT NULL,
  nombre        TEXT        NOT NULL,
  dni_cuit      TEXT,
  fecha_desde   DATE,
  fecha_hasta   DATE,
  vigente       BOOLEAN     NOT NULL DEFAULT TRUE,
  renovacion_id UUID        REFERENCES libros_pedidos(id) ON DELETE SET NULL,
  observaciones TEXT,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_autoridades_cliente
  ON clientes_autoridades(cliente_id);

CREATE INDEX IF NOT EXISTS idx_clientes_autoridades_vigentes
  ON clientes_autoridades(cliente_id, vigente);
