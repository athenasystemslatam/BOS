-- ============================================================
-- BOS · Módulo Libros Societarios — Etapa 7 (Tablero)
-- - Fecha meta del objetivo "Puesta al día: atraso a 0" (Configuración).
-- - libros_snapshot: una foto por día del atraso del estudio, para el
--   gráfico de evolución y el "cuánto se logró". La guarda el cron diario
--   (y el Tablero al abrirse, si todavía no hay foto del día). La fila
--   es_base = la línea base del 16-oct, que la app calcula una sola vez
--   desde los datos importados del sheet.
-- Requiere add_libros_etapa4.sql corrido. Se puede correr más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

ALTER TABLE libros_config
  ADD COLUMN IF NOT EXISTS fecha_meta_puesta DATE;

CREATE TABLE IF NOT EXISTS libros_snapshot (
  fecha                DATE        PRIMARY KEY,
  es_base              BOOLEAN     NOT NULL DEFAULT FALSE,
  periodos_pendientes  INTEGER     NOT NULL,
  libros_atrasados     INTEGER     NOT NULL,
  libros_al_dia        INTEGER     NOT NULL,
  libros_sin_dato      INTEGER     NOT NULL,
  libros_sin_libro     INTEGER     NOT NULL,
  envios_pendientes    INTEGER     NOT NULL DEFAULT 0,
  -- {libro_id: períodos atrasados}; -1 = sin dato, -2 = sin libro. Permite
  -- contar los libros que se pusieron al día entre dos fechas.
  por_libro            JSONB       NOT NULL DEFAULT '{}'::jsonb,
  actualizado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE libros_snapshot ENABLE ROW LEVEL SECURITY;
