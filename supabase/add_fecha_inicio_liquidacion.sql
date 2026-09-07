-- BOS · Agregar fecha de inicio de liquidacion — 07-sep-2026
-- Especifica de Sueldos: desde cuando la consultora le liquida sueldos a
-- ese cliente (distinto de fecha_alta_empleador, que es el alta como
-- empleador ante ARCA). Ejecutar en Supabase SQL Editor.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS fecha_inicio_liquidacion DATE;

-- vista_empresas (Panel General) necesita el campo para poder mostrarlo
-- sin pedir la tabla clientes aparte. Se agrega al final: CREATE OR
-- REPLACE VIEW no admite insertar/renombrar una columna en el medio.
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
   LIMIT 1) AS responsable_monotributo,
  c.emails_contacto,
  c.fecha_inicio_liquidacion
FROM clientes c;
