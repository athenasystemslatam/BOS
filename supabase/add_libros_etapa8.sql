-- ============================================================
-- BOS · Módulo Libros Societarios — Etapa 8
-- Vencimiento preciso del mandato: si está cargado reemplaza al calculado
-- (designación + años). En las SA el mandato se cuenta por ejercicios, así
-- que la fecha real puede no coincidir con designación + 3 años. Los avisos
-- de 90/60/30 días y la renovación de autoridades usan el vencimiento final.
-- Requiere add_libros_etapa1.sql. Se puede correr más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

ALTER TABLE clientes_societario
  ADD COLUMN IF NOT EXISTS mandato_vence_preciso DATE;
