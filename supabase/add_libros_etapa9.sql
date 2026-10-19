-- ============================================================
-- BOS · Módulo Libros Societarios — Etapa 9
-- 1. Entrada y salida e incidencias sin libro identificado: el sheet trae
--    movimientos de documentos o de libros escritos a mano ("Actas n°1 /
--    Diario") que no siempre se pueden atar a un tomo. Se guarda el cliente
--    y el texto; libro_id pasa a ser opcional.
-- 2. Pedidos: circuito de los presupuestos (enviado al cliente, respuesta).
-- 3. Copiadora: texto de libros editable por factura.
-- 4. Orden de las tarjetas del Dashboard, por usuario.
-- Requiere add_libros_etapa3.sql. Se puede correr más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1a. Movimientos
ALTER TABLE libros_movimientos ALTER COLUMN libro_id DROP NOT NULL;
ALTER TABLE libros_movimientos
  ADD COLUMN IF NOT EXISTS cliente_id   UUID REFERENCES clientes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS libros_texto TEXT,
  ADD COLUMN IF NOT EXISTS importado    BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE libros_movimientos m SET cliente_id = l.cliente_id
FROM libros l WHERE l.id = m.libro_id AND m.cliente_id IS NULL;
CREATE INDEX IF NOT EXISTS libros_movimientos_cliente_idx ON libros_movimientos (cliente_id);

-- 1b. Incidencias
ALTER TABLE libros_incidencias ALTER COLUMN libro_id DROP NOT NULL;
ALTER TABLE libros_incidencias
  ADD COLUMN IF NOT EXISTS cliente_id   UUID REFERENCES clientes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS libros_texto TEXT,
  ADD COLUMN IF NOT EXISTS importado    BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE libros_incidencias i SET cliente_id = l.cliente_id
FROM libros l WHERE l.id = i.libro_id AND i.cliente_id IS NULL;
CREATE INDEX IF NOT EXISTS libros_incidencias_cliente_idx ON libros_incidencias (cliente_id);

-- 2. Pedidos: Pedido → Enviado al cliente (monto, fecha) → Respuesta → Aprobado
ALTER TABLE libros_pedidos
  ADD COLUMN IF NOT EXISTS fecha_envio_cliente DATE,
  ADD COLUMN IF NOT EXISTS fecha_respuesta     DATE;

-- 3. Copiadora: los libros de la factura en su propio campo. La importación
--    del sheet los había dejado como "Libros: …" en observaciones.
ALTER TABLE copiadora_facturas ADD COLUMN IF NOT EXISTS libros_texto TEXT;
UPDATE copiadora_facturas
SET libros_texto  = substring(observaciones FROM '^Libros: ([^\n]*)'),
    observaciones = NULLIF(regexp_replace(observaciones, '^Libros: [^\n]*\n?', ''), '')
WHERE libros_texto IS NULL AND observaciones LIKE 'Libros: %';

-- 4. Preferencias por usuario (por mail de login, así sirve también para
--    quien entra en modo consulta sin fila en liquidadoras).
CREATE TABLE IF NOT EXISTS libros_preferencias (
  email            TEXT        PRIMARY KEY,
  dashboard_orden  TEXT[]      NOT NULL DEFAULT '{}',
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE libros_preferencias ENABLE ROW LEVEL SECURITY;
