-- BOS · Agregar Monotributo a vista_empresas (Panel General) — 24-ago-2026
-- La vista tenía Sueldos/Impuestos/Contable/Libros pero nunca se agregó
-- Monotributo, aunque el módulo existe hace semanas. Causó una falsa alarma
-- el 24-ago: 72 clientes activos parecían "sin ningún módulo" en Panel
-- General cuando en realidad la mayoría ya estaban bien cargados en
-- Monotributo, solo invisibles ahí. Ejecutar en Supabase SQL Editor.

CREATE OR REPLACE VIEW vista_empresas AS
SELECT
  c.id,
  c.nombre,
  c.cuit,
  c.estado,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN liquidadoras e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'sueldos' AND sc.subtipo = 'general'
     AND sc.estado = true
   LIMIT 1) AS responsable_sueldos,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN liquidadoras e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'impuestos' AND sc.subtipo = 'iva'
     AND sc.estado = true
   LIMIT 1) AS responsable_impuestos_iva,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN liquidadoras e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'impuestos' AND sc.subtipo = 'iibb'
     AND sc.estado = true
   LIMIT 1) AS responsable_impuestos_iibb,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN liquidadoras e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'impuestos' AND sc.subtipo = 'seh'
     AND sc.estado = true
   LIMIT 1) AS responsable_impuestos_seh,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN liquidadoras e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'contable' AND sc.subtipo = 'general'
     AND sc.estado = true
   LIMIT 1) AS responsable_contable,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN liquidadoras e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'libros' AND sc.subtipo = 'general'
     AND sc.estado = true
   LIMIT 1) AS responsable_libros,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN liquidadoras e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'monotributo' AND sc.subtipo = 'general'
     AND sc.estado = true
   LIMIT 1) AS responsable_monotributo
FROM clientes c;

-- Verificación sugerida:
-- SELECT count(*) FROM vista_empresas WHERE responsable_monotributo IS NOT NULL;
--   → debería acercarse a los ~130 clientes que ya tiene el módulo Monotributo.
