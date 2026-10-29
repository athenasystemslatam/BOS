-- FAL (Fondo de Asistencia Laboral): seguimiento por cliente de Sueldos, una
-- fila por cliente (se gestiona una sola vez, no por período). El ID FAL en sí
-- vive en clientes.id_fal (add_clientes_id_fal.sql); acá solo la fecha de carga.
-- La fecha de corte se configura en objetivos_area (area 'sueldos',
-- config.fal_fecha_corte), no necesita columna.
CREATE TABLE IF NOT EXISTS clientes_fal (
  cliente_id          UUID PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  aviso_enviado       BOOLEAN NOT NULL DEFAULT false,
  aviso_enviado_en    TIMESTAMPTZ,
  aviso_enviado_por   UUID REFERENCES liquidadoras(id),
  respondio           BOOLEAN NOT NULL DEFAULT false,
  respondio_en        TIMESTAMPTZ,
  respondio_por       UUID REFERENCES liquidadoras(id),
  id_fal_en           TIMESTAMPTZ,
  id_fal_por          UUID REFERENCES liquidadoras(id),
  confirmado_arca     BOOLEAN NOT NULL DEFAULT false,
  confirmado_arca_en  TIMESTAMPTZ,
  confirmado_arca_por UUID REFERENCES liquidadoras(id),
  -- Resultado al llegar la fecha de corte: "Asignado por default" con motivo
  -- ('no_respondio' | 'respondio_sin_confirmar'), corregible a mano.
  asignado_default    BOOLEAN NOT NULL DEFAULT false,
  default_motivo      TEXT CHECK (default_motivo IN ('no_respondio', 'respondio_sin_confirmar')),
  -- Cuándo pasó el marcado automático por este cliente: nunca se vuelve a
  -- aplicar, así una corrección a mano no se pisa.
  default_aplicado_en TIMESTAMPTZ,
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_por     UUID REFERENCES liquidadoras(id)
);
ALTER TABLE clientes_fal ENABLE ROW LEVEL SECURITY;
