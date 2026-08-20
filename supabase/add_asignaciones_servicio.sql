-- Reasignación de responsable con historial, para los módulos que se
-- manejan por servicios_cliente (Impuestos, Monotributo — Contable ya
-- resuelve esto por año directo en cada fila de balances, no lo necesita).
-- Mismo diseño que la tabla `asignaciones` de Sueldos, generalizado a
-- servicio+subtipo y usando `equipo` en vez de `liquidadoras`.
CREATE TABLE IF NOT EXISTS asignaciones_servicio (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  servicio       TEXT NOT NULL,
  subtipo        TEXT NOT NULL DEFAULT 'general',
  responsable_id UUID NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
  desde_anio     INTEGER NOT NULL,
  desde_mes      INTEGER NOT NULL CHECK (desde_mes BETWEEN 1 AND 12),
  motivo         TEXT,
  creado_por     TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cliente_id, servicio, subtipo, desde_anio, desde_mes)
);
