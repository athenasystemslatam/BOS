-- BOS · Agregar tipo_contribuyente a vista_empresas (Panel General)
-- Panel General filtra por tipo de contribuyente (Empresa/Monotributista/
-- Inscripto), pero la vista no traía esa columna de `clientes`. Se parte de
-- la definición actual (add_fecha_inicio_liquidacion.sql, 07-sep-2026, la
-- más reciente — incluye emails_contacto y fecha_inicio_liquidacion) y se
-- agrega tipo_contribuyente al final: CREATE OR REPLACE VIEW no admite
-- insertar/renombrar una columna en el medio. Ejecutar en Supabase SQL Editor.

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
  c.fecha_inicio_liquidacion,
  c.tipo_contribuyente
FROM clientes c;

-- Verificación sugerida:
-- SELECT tipo_contribuyente, count(*) FROM vista_empresas GROUP BY tipo_contribuyente;
