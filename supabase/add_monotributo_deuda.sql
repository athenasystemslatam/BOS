-- BOS · Módulo Monotributo — campos de deuda
-- Ejecutar en Supabase SQL Editor

ALTER TABLE monotributo_tareas
  ADD COLUMN IF NOT EXISTS deuda_monto numeric,
  ADD COLUMN IF NOT EXISTS deuda_aviso boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deuda_aviso_fecha date;
