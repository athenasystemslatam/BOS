-- ============================================================
-- BOS · Módulo Libros Societarios — Etapa 11 (objetivos)
-- Objetivos del módulo: cada uno mide una métrica que BOS calcula solo
-- (src/lib/librosObjetivos.ts) contra una meta en % y una fecha límite.
-- Se editan en Libros → Configuración (solo admin). Al llegar a la meta
-- pasan solos a "cumplido" con la fecha. Sin fecha límite = permanente
-- (no se cierra nunca: es de mantenimiento).
-- Solo aditivo. Se puede correr más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

CREATE TABLE IF NOT EXISTS libros_objetivos (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre              TEXT        NOT NULL,
  metrica             TEXT        NOT NULL CHECK (metrica IN (
                        'mandatos_cargados', 'renovaciones_iniciadas', 'renovaciones_cerradas',
                        'datos_completos', 'puesta_al_dia', 'envios_60_dias')),
  meta                NUMERIC(5,2) NOT NULL CHECK (meta > 0 AND meta <= 100),
  fecha_limite        DATE,
  estado              TEXT        NOT NULL DEFAULT 'actual' CHECK (estado IN ('actual', 'cumplido')),
  fecha_cumplimiento  DATE,
  orden               INTEGER     NOT NULL DEFAULT 0,
  creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE libros_objetivos ENABLE ROW LEVEL SECURITY;

-- Objetivos iniciales (20-oct-2026). Solo se cargan si no existe uno con el
-- mismo nombre.
INSERT INTO libros_objetivos (nombre, metrica, meta, fecha_limite, orden)
SELECT v.nombre, v.metrica, v.meta, v.fecha_limite, v.orden
FROM (VALUES
  ('Mandatos cargados (SA y SAS)',               'mandatos_cargados',      100.0, date '2026-11-20', 10),
  ('Renovaciones iniciadas de mandatos vencidos', 'renovaciones_iniciadas', 100.0, date '2026-11-20', 20),
  ('Datos completos de los libros',              'datos_completos',        100.0, date '2026-11-20', 30),
  ('Puesta al día (mitad)',                       'puesta_al_dia',           50.0, date '2027-03-31', 40),
  ('Puesta al día completa',                      'puesta_al_dia',          100.0, date '2027-06-30', 50),
  ('Envío anual dentro de 60 días',               'envios_60_dias',         100.0, NULL,              60)
) AS v(nombre, metrica, meta, fecha_limite, orden)
WHERE NOT EXISTS (SELECT 1 FROM libros_objetivos o WHERE o.nombre = v.nombre);
