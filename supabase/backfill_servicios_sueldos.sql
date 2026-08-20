-- ⚠️ CRITERIO INCORRECTO — ver fix_servicios_sueldos_liquidador.sql
--
-- Esta versión asumía que "cliente sin ninguna fila en servicios_cliente"
-- equivalía a "cliente viejo de Sueldos, de antes de Panel General". Al
-- correrla en producción (20-ago-2026) se descubrió que también agarraba
-- ~197 clientes cargados directo en `clientes` para otros módulos
-- (Impuestos/Contable/Monotributo, fuera de la app), que tampoco tenían
-- fila en servicios_cliente pero NO son de Sueldos.
--
-- La señal correcta es `liquidador_id IS NOT NULL` (lo completa siempre el
-- import de Sueldos, nunca el de los otros módulos). Si esto se vuelve a
-- correr desde cero en otro ambiente, usar esta versión en su lugar:
--
-- INSERT INTO servicios_cliente (cliente_id, servicio, subtipo, estado)
-- SELECT c.id, 'sueldos', 'general', true
-- FROM clientes c
-- WHERE c.liquidador_id IS NOT NULL
-- ON CONFLICT (cliente_id, servicio, subtipo) DO UPDATE SET estado = true;
--
-- Versión que efectivamente se corrió en producción (y después se corrigió
-- con fix_servicios_sueldos_liquidador.sql):
INSERT INTO servicios_cliente (cliente_id, servicio, subtipo, estado)
SELECT c.id, 'sueldos', 'general', true
FROM clientes c
WHERE NOT EXISTS (
  SELECT 1 FROM servicios_cliente sc WHERE sc.cliente_id = c.id
)
ON CONFLICT (cliente_id, servicio, subtipo) DO NOTHING;
