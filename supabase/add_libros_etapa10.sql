-- ============================================================
-- BOS · Módulo Libros Societarios — Etapa 10 (mails)
-- - Mail diario (lunes a viernes): a cada persona del equipo de Libros,
--   con lo de sus clientes. Se guarda a quién NO mandarle, así quien se
--   suma al equipo lo recibe sin tocar nada.
-- - Resumen semanal: a las personas elegidas (NULL = los administradores),
--   el día elegido (1 = lunes … 5 = viernes).
-- Se configura en Libros → Configuración. Requiere add_libros_etapa4.sql.
-- Se puede correr más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

ALTER TABLE libros_config
  ADD COLUMN IF NOT EXISTS mail_diario_excluidos UUID[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS mail_semanal_ids      UUID[],
  ADD COLUMN IF NOT EXISTS mail_semanal_dia      INTEGER NOT NULL DEFAULT 5
    CHECK (mail_semanal_dia BETWEEN 1 AND 5);
