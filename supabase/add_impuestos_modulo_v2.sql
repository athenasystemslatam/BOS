-- BOS · Impuestos v2: SICORE, datos fijos por cliente y responsable rotativo
-- Ejecutar en Supabase → SQL Editor ANTES de la importación de
-- BOS_Actualizacion_Clientes.xlsx. Solo agrega: no borra ni cambia datos.

BEGIN;

-- 1. SICORE como cuarto impuesto (amplía el CHECK con la lista completa).
ALTER TABLE impuestos_tareas DROP CONSTRAINT IF EXISTS impuestos_tareas_subtipo_check;
ALTER TABLE impuestos_tareas
  ADD CONSTRAINT impuestos_tareas_subtipo_check CHECK (subtipo IN ('iva', 'iibb', 'seh', 'sicore'));

-- 2. Datos de Impuestos que no cambian mes a mes.
CREATE TABLE IF NOT EXISTS impuestos_clientes (
  cliente_id      uuid        PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  agencias_iibb   text[]      NOT NULL DEFAULT '{}',   -- CM, AGIP, ARBA, RIO NEGRO…
  seh_municipios  int         CHECK (seh_municipios IS NULL OR seh_municipios > 0),
  apoyo_iva_id    uuid        REFERENCES liquidadoras(id) ON DELETE SET NULL, -- prepara subdiarios
  otros_servicios jsonb       NOT NULL DEFAULT '[]',   -- [{servicio, responsable_id, responsable, detalle}]
  observaciones   text,
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);
-- Cerrada desde afuera; BOS la lee con la llave de servicio (ver DIAGNOSTICO U4).
ALTER TABLE impuestos_clientes ENABLE ROW LEVEL SECURITY;

-- 3. Responsable compartido de Salomé y Guillermo: una ficha sin mail (no
-- entra al sistema), elegible como responsable y visible en los tableros.
INSERT INTO liquidadoras (nombre, rol, activa)
SELECT 'Salo / Guille (rotativo)', 'liquidadora', true
WHERE NOT EXISTS (SELECT 1 FROM liquidadoras WHERE nombre = 'Salo / Guille (rotativo)');

INSERT INTO equipo_modulos (equipo_id, modulo)
SELECT l.id, 'impuestos' FROM liquidadoras l
WHERE l.nombre = 'Salo / Guille (rotativo)'
  AND NOT EXISTS (SELECT 1 FROM equipo_modulos em WHERE em.equipo_id = l.id AND em.modulo = 'impuestos');

-- 4. Índices para el volumen de Impuestos (~470 tareas por mes).
CREATE INDEX IF NOT EXISTS impuestos_tareas_anio_mes_idx ON impuestos_tareas (anio, mes);
CREATE INDEX IF NOT EXISTS asignaciones_servicio_servicio_idx ON asignaciones_servicio (servicio, subtipo);

COMMIT;

-- Verificación (solo lee):
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'impuestos_tareas_subtipo_check';
-- SELECT l.nombre, em.modulo FROM liquidadoras l JOIN equipo_modulos em ON em.equipo_id = l.id WHERE l.nombre LIKE 'Salo / Guille%';
