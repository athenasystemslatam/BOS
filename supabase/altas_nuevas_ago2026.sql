-- BOS · Altas nuevas detectadas en los archivos ESTATUS (24-ago-2026)
-- 11 clientes que no existían en `clientes` (ni activos ni inactivos),
-- confirmados por Giuliana. Mismo criterio que usa crearClienteConServicios()
-- en panel-general/actions.ts: cuit = 11 dígitos sin guiones, terminacion_cuit
-- = último dígito, tipo_contribuyente en ('empresa','monotributista','inscripto').
-- Segura de re-ejecutar (ON CONFLICT (cuit) no hace nada si ya existe).

WITH nuevos (cuit, nombre, tipo_contribuyente, observaciones) AS (
  VALUES
    ('20250440228', 'LAURIA MARCELO', 'inscripto', NULL),
    ('20112055739', 'RUBI OMAR', 'inscripto', NULL),
    ('27447993134', 'ARISO MARIA PAULA', 'monotributista', NULL),
    ('30712440992', 'FUNDACION PAN Y ARTE', 'empresa',
      '⚠ Hay otro cliente con nombre parecido: PAN Y ARTE SRL (CUIT 30709589756) — confirmar que son dos entidades distintas y no un duplicado.'),
    ('30709589756', 'PAN Y ARTE SRL', 'empresa',
      '⚠ Hay otro cliente con nombre parecido: FUNDACION PAN Y ARTE (CUIT 30712440992) — confirmar que son dos entidades distintas y no un duplicado.'),
    ('30715431587', 'HERPAM SA', 'empresa', NULL),
    ('30715438336', 'RIVADAVIA SA', 'empresa', NULL),
    ('20279501056', 'CERRITO DIEGO', 'monotributista', 'Vinculado a MIT INFORMATICA según el archivo ESTATUS MONOTRIBUTISTAS.'),
    ('20454013922', 'MAZZA KIMERIS FEDERICO', 'monotributista', 'Vinculado a ASOCIACIÓN IDEHARCELAS según el archivo ESTATUS MONOTRIBUTISTAS.'),
    ('20323874663', 'ARMENDANO JUAN MANUEL', 'monotributista', 'Nota del archivo original: "Ariel Mosca".'),
    ('20376040152', 'REYES EMANUEL LUIS', 'monotributista', NULL)
)
INSERT INTO clientes (nombre, cuit, terminacion_cuit, tipo_contribuyente, observaciones)
SELECT nombre, cuit, (right(cuit, 1))::int, tipo_contribuyente, observaciones
FROM nuevos
ON CONFLICT (cuit) DO NOTHING;

-- ── Servicios de cada alta ──────────────────────────────────────────────
WITH svc (cuit, servicio, subtipo, responsable_nombre) AS (
  VALUES
    ('20250440228', 'impuestos', 'iva',  'Sol'),
    ('20250440228', 'impuestos', 'iibb', 'José'),
    ('20112055739', 'impuestos', 'iva',  'Vanesa'),
    ('20112055739', 'impuestos', 'iibb', 'Vanesa'),
    ('27447993134', 'impuestos', 'iibb', 'Candela R.'),
    ('27447993134', 'monotributo', 'general', 'Sofia'),
    ('30712440992', 'contable', 'general', NULL),
    ('30709589756', 'contable', 'general', NULL),
    ('30715431587', 'contable', 'general', NULL),
    ('30715438336', 'contable', 'general', NULL),
    ('20279501056', 'monotributo', 'general', 'Sofia'),
    ('20454013922', 'monotributo', 'general', 'Candela R.'),
    ('20323874663', 'monotributo', 'general', NULL),
    ('20376040152', 'monotributo', 'general', NULL)
)
INSERT INTO servicios_cliente (cliente_id, servicio, subtipo, responsable_id, estado)
SELECT c.id, svc.servicio, svc.subtipo, l.id, true
FROM svc
JOIN clientes c ON c.cuit = svc.cuit
LEFT JOIN liquidadoras l ON l.nombre ILIKE svc.responsable_nombre || '%'
ON CONFLICT (cliente_id, servicio, subtipo)
DO UPDATE SET responsable_id = EXCLUDED.responsable_id, estado = true;

-- Verificación sugerida:
-- SELECT nombre, cuit, tipo_contribuyente FROM clientes WHERE cuit IN
--   ('20250440228','20112055739','27447993134','30712440992','30709589756',
--    '30715431587','30715438336','20279501056','20454013922','20323874663','20376040152');
--   → debería devolver 11 filas
