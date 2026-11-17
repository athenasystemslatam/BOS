-- BOS · Monotributo — punto 5a (17-nov-2026)
-- 1) Resuelve en lote las marcas "verificar pago" de septiembre y octubre 2026
--    (historial importado de la planilla) con la nota "historial importado, sin
--    verificar". No se borra nada: quedan como resueltas, con su entrada en el
--    historial, y se pueden reabrir desde A revisar → "Ver marcas resueltas".
-- 2) Índices para que las pantallas sigan rápidas con más clientes y meses.
-- Correr DESPUÉS de add_monotributo_historial.sql. Ejecutar en Supabase SQL Editor.

BEGIN;

WITH res AS (
  UPDATE monotributo_revisiones
     SET estado = 'resuelta', resolucion = 'confirmado', resuelta_at = now(),
         nota = 'historial importado, sin verificar', valor_confirmado = 'enviado'
   WHERE estado = 'pendiente' AND campo = 'pago' AND anio = 2026 AND mes IN (9, 10)
  RETURNING id, cliente_id, anio, mes, motivo
)
INSERT INTO monotributo_historial (cliente_id, anio, mes, entidad, campo, valor_anterior, valor_nuevo, usuario_id, ref_id, nota)
SELECT cliente_id, anio, mes, 'revision', 'pago',
       jsonb_build_object('estado', 'pendiente', 'motivo', motivo),
       jsonb_build_object('estado', 'resuelta', 'resolucion', 'confirmado', 'motivo', motivo),
       NULL, id, 'historial importado, sin verificar'
FROM res;

-- Índices (solo agregan; no cambian datos)
CREATE INDEX IF NOT EXISTS monotributo_tareas_periodo_idx ON monotributo_tareas (anio, mes);
CREATE INDEX IF NOT EXISTS monotributo_revisiones_pendientes_idx ON monotributo_revisiones (gravedad, campo) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS monotributo_revisiones_resueltas_idx ON monotributo_revisiones (resuelta_at DESC) WHERE estado = 'resuelta';
CREATE INDEX IF NOT EXISTS servicios_cliente_servicio_idx ON servicios_cliente (servicio, subtipo, estado);
CREATE INDEX IF NOT EXISTS monotributo_alertas_resueltas_cliente_idx ON monotributo_alertas_resueltas (cliente_id, anio, mes);

COMMIT;

-- Verificación sugerida:
-- SELECT count(*) FROM monotributo_revisiones WHERE campo = 'pago' AND nota = 'historial importado, sin verificar';  -- ~128
-- SELECT count(*) FROM monotributo_revisiones WHERE campo = 'pago' AND estado = 'pendiente';                          -- 0
