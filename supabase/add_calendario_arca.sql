-- BOS · Monotributo — calendario ARCA por año (17-nov-2026)
-- Reemplaza lo que estaba fijo en el código (cuota el día 20 de cada mes,
-- recategorización en febrero y agosto). Se carga a mano una vez por año desde
-- Monotributo → Calendario ARCA (solo administradores).
-- Fuente 2026: https://www.afip.gob.ar/vencimientos/
-- Solo agrega: una tabla nueva y su carga inicial (no pisa filas ya cargadas).
-- Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS calendario_arca (
  id                            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  anio                          int         NOT NULL,
  mes                           int         NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fecha_vencimiento_cuota       date        NOT NULL,
  -- Solo en los meses donde cierra una recategorización (2026: febrero y agosto)
  fecha_limite_recategorizacion date,
  recategoriza_desde            date,
  nota                          text,
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  updated_por                   uuid        REFERENCES liquidadoras(id),
  UNIQUE (anio, mes)
);
ALTER TABLE calendario_arca ENABLE ROW LEVEL SECURITY;

INSERT INTO calendario_arca (anio, mes, fecha_vencimiento_cuota, fecha_limite_recategorizacion, recategoriza_desde, nota) VALUES
  (2026,  1, '2026-01-20', NULL,         NULL,         NULL),
  (2026,  2, '2026-02-20', '2026-02-05', '2026-01-01', 'Recategorización semestral'),
  (2026,  3, '2026-03-20', NULL,         NULL,         NULL),
  (2026,  4, '2026-04-20', NULL,         NULL,         NULL),
  (2026,  5, '2026-05-20', NULL,         NULL,         NULL),
  (2026,  6, '2026-06-22', NULL,         NULL,         'El 20 cae sábado'),
  (2026,  7, '2026-07-20', NULL,         NULL,         NULL),
  (2026,  8, '2026-08-20', '2026-08-05', '2026-07-01', 'Recategorización semestral'),
  (2026,  9, '2026-09-21', NULL,         NULL,         'El 20 cae domingo'),
  (2026, 10, '2026-10-20', NULL,         NULL,         NULL),
  (2026, 11, '2026-11-20', NULL,         NULL,         NULL),
  (2026, 12, '2026-12-21', NULL,         NULL,         'El 20 cae domingo')
ON CONFLICT (anio, mes) DO NOTHING;

-- Verificación sugerida:
-- SELECT mes, fecha_vencimiento_cuota, fecha_limite_recategorizacion, recategoriza_desde FROM calendario_arca WHERE anio = 2026 ORDER BY mes;
