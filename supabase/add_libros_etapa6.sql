-- ============================================================
-- BOS · Módulo Libros Societarios — Etapa 6 (flujo único + mandatos)
-- - Pedido nuevo "Renovación de autoridades": el sistema lo crea solo
--   al primer aviso antes del vencimiento del mandato (uno por cliente
--   y mandato), con checklist y prioridad (P1 si el mandato ya venció).
-- - Avisos de mandato configurables (90/60/30 días) y registro de qué
--   aviso ya salió por mail, para mandar cada umbral una sola vez.
-- Requiere add_libros_etapa3.sql y add_libros_etapa4.sql corridos.
-- Se puede correr más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. Ampliar el CHECK de tipo. El constraint viene de la etapa 2 sin
--    nombre explícito; se busca dinámicamente.
DO $$
DECLARE
  cname TEXT;
BEGIN
  FOR cname IN
    SELECT constraint_name
    FROM information_schema.table_constraints
    WHERE table_name = 'libros_pedidos'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%tipo%'
  LOOP
    EXECUTE format('ALTER TABLE libros_pedidos DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

ALTER TABLE libros_pedidos
  ADD CONSTRAINT libros_pedidos_tipo_check
    CHECK (tipo IN ('presupuesto_libro_nuevo','presupuesto_tomo_nuevo','tramite',
                    'pedido_cliente','asamblea','cambio_societario','renovacion_autoridades'));

-- 2. Columnas nuevas de pedidos.
--    checklist: [{texto, hecho}] editable desde Pedidos.
--    mandato_vence: el vencimiento que originó la renovación (identifica el mandato).
ALTER TABLE libros_pedidos
  ADD COLUMN IF NOT EXISTS prioridad     TEXT CHECK (prioridad IN ('P1','P2','P3')),
  ADD COLUMN IF NOT EXISTS checklist     JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS mandato_vence DATE;

-- Una sola renovación por cliente y mandato, aunque se cierre y se
-- vuelva a abrir la pantalla.
CREATE UNIQUE INDEX IF NOT EXISTS libros_pedidos_renovacion_mandato_idx
  ON libros_pedidos (cliente_id, mandato_vence)
  WHERE tipo = 'renovacion_autoridades' AND mandato_vence IS NOT NULL;

-- 3. Días de aviso antes del vencimiento del mandato. El mayor es el que
--    crea el pedido de renovación.
ALTER TABLE libros_config
  ADD COLUMN IF NOT EXISTS mandato_avisos INTEGER[] NOT NULL DEFAULT '{90,60,30}';

-- 4. Avisos de mandato ya enviados por mail: uno por cliente, mandato y
--    umbral (0 = vencido).
CREATE TABLE IF NOT EXISTS libros_avisos_mandato (
  cliente_id    UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  mandato_vence DATE        NOT NULL,
  umbral        INTEGER     NOT NULL,
  enviado_en    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (cliente_id, mandato_vence, umbral)
);
ALTER TABLE libros_avisos_mandato ENABLE ROW LEVEL SECURITY;
