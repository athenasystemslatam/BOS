-- Agrega sc.estado = true a los subqueries de vista_empresas
-- para que bajas de servicio se reflejen inmediatamente en la vista.
CREATE OR REPLACE VIEW vista_empresas AS
SELECT
  c.id,
  c.nombre,
  c.cuit,
  c.estado,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN equipo e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'sueldos' AND sc.subtipo = 'general'
     AND sc.estado = true
   LIMIT 1) AS responsable_sueldos,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN equipo e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'impuestos' AND sc.subtipo = 'iva'
     AND sc.estado = true
   LIMIT 1) AS responsable_impuestos_iva,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN equipo e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'impuestos' AND sc.subtipo = 'iibb'
     AND sc.estado = true
   LIMIT 1) AS responsable_impuestos_iibb,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN equipo e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'impuestos' AND sc.subtipo = 'seh'
     AND sc.estado = true
   LIMIT 1) AS responsable_impuestos_seh,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN equipo e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'contable' AND sc.subtipo = 'general'
     AND sc.estado = true
   LIMIT 1) AS responsable_contable,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN equipo e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'libros' AND sc.subtipo = 'general'
     AND sc.estado = true
   LIMIT 1) AS responsable_libros
FROM clientes c;
