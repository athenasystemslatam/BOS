-- ============================================================
-- BOS · Módulos y base maestra
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. EQUIPO — padrón general del personal de KMA
CREATE TABLE IF NOT EXISTS equipo (
  id      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre  TEXT NOT NULL,
  activo  BOOLEAN DEFAULT TRUE
);

-- 2. FK opcional en liquidadoras → equipo
ALTER TABLE liquidadoras
  ADD COLUMN IF NOT EXISTS equipo_id UUID REFERENCES equipo(id) ON DELETE SET NULL;

-- 3. EQUIPO_MODULOS — qué módulos cubre cada persona del equipo
CREATE TABLE IF NOT EXISTS equipo_modulos (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  equipo_id  UUID NOT NULL REFERENCES equipo(id) ON DELETE CASCADE,
  modulo     TEXT NOT NULL,
  UNIQUE (equipo_id, modulo)
);

-- 4. SERVICIOS_CLIENTE — módulos contratados por cada cliente
CREATE TABLE IF NOT EXISTS servicios_cliente (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  servicio        TEXT NOT NULL,
  subtipo         TEXT NOT NULL DEFAULT 'general',
  responsable_id  UUID REFERENCES equipo(id) ON DELETE SET NULL,
  fecha_alta      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  estado          BOOLEAN DEFAULT TRUE,
  UNIQUE (cliente_id, servicio, subtipo)
);

-- 5. VISTA — una fila por cliente, columnas planas por servicio+subtipo
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
   LIMIT 1) AS responsable_sueldos,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN equipo e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'impuestos' AND sc.subtipo = 'iva'
   LIMIT 1) AS responsable_impuestos_iva,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN equipo e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'impuestos' AND sc.subtipo = 'iibb'
   LIMIT 1) AS responsable_impuestos_iibb,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN equipo e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'impuestos' AND sc.subtipo = 'seh'
   LIMIT 1) AS responsable_impuestos_seh,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN equipo e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'contable' AND sc.subtipo = 'general'
   LIMIT 1) AS responsable_contable,
  (SELECT e.nombre
   FROM servicios_cliente sc
   JOIN equipo e ON e.id = sc.responsable_id
   WHERE sc.cliente_id = c.id AND sc.servicio = 'libros' AND sc.subtipo = 'general'
   LIMIT 1) AS responsable_libros
FROM clientes c;
