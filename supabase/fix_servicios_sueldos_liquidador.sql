-- Corrección de backfill_servicios_sueldos.sql (corrida en producción el mismo
-- día, minutos después). Ese backfill asumía que "cliente sin ninguna fila en
-- servicios_cliente" = cliente viejo de Sueldos. Estaba mal: también agarró
-- a ~197 clientes cargados directo en `clientes` para otros módulos
-- (Impuestos/Contable/Monotributo, fuera de la app, sin pasar por
-- servicios_cliente) y los etiquetó como Sueldos por error.
--
-- La señal confiable de "cliente real de Sueldos" es `liquidador_id`: el
-- import original de Sueldos siempre lo completa, el de los otros módulos
-- nunca lo tocó. Verificado en producción: 85 clientes con liquidador_id,
-- contra 84 originalmente reales de Sueldos (recordado por Giuliana) — cierra.
--
-- 1) Deshace el backfill solo donde se aplicó de más (clientes sin liquidador,
--    etiquetados en la corrida de backfill_servicios_sueldos.sql):
DELETE FROM servicios_cliente
WHERE servicio = 'sueldos'
  AND subtipo = 'general'
  AND fecha_alta > now() - interval '2 hours'
  AND cliente_id IN (SELECT id FROM clientes WHERE liquidador_id IS NULL);

-- 2) Dos clientes con liquidador_id asignado no tenían fila de sueldos (ni
--    siquiera antes del backfill) — se los agrega:
INSERT INTO servicios_cliente (cliente_id, servicio, subtipo, estado)
VALUES
  ('2524fa64-64af-4b83-9790-56e2cffff7ff', 'sueldos', 'general', true), -- KENT NYLA
  ('0f8e552e-a2c0-444e-b498-89afdaa3036b', 'sueldos', 'general', true)  -- ARISTIZABAL JUAN SEBASTIAN
ON CONFLICT (cliente_id, servicio, subtipo) DO UPDATE SET estado = true;

-- Resultado verificado en producción: 86 clientes con sueldos activo, 85 con
-- liquidador_id — la diferencia de 1 es un cliente con Sueldos activo pero
-- sin liquidadora asignada todavía (caso ya contemplado por la alerta de
-- Panel General, no es un error de este backfill).
