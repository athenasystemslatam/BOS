-- BOS · Permitir varios emails de contacto por cliente — 04-sep-2026
-- Reemplaza el campo email_contacto (uno solo) por emails_contacto (lista).
-- Migra el valor que ya estuviera cargado antes de borrar la columna vieja.
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS emails_contacto TEXT[] NOT NULL DEFAULT '{}';

UPDATE clientes
SET emails_contacto = ARRAY[email_contacto]
WHERE email_contacto IS NOT NULL
  AND email_contacto <> ''
  AND emails_contacto = '{}';

-- Hay que borrar la vista ANTES que la columna: vista_empresas depende de
-- email_contacto, así que dropear la columna primero falla. Y no alcanza
-- con CREATE OR REPLACE VIEW porque tampoco permite sacar/renombrar una
-- columna existente (solo agregar al final) — hay que recrearla entera.
DROP VIEW IF EXISTS vista_empresas;

ALTER TABLE clientes DROP COLUMN IF EXISTS email_contacto;

CREATE VIEW vista_empresas AS
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
  c.emails_contacto
FROM clientes c;
