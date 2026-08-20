-- Unifica el padrón de personas: la tabla `equipo` (Impuestos/Contable/
-- Monotributo) se migra a `liquidadoras`, preservando los mismos ids para
-- no tener que remapear ninguna FK existente (equipo_modulos,
-- servicios_cliente, asignaciones_servicio). A partir de acá `liquidadoras`
-- es el único padrón de personas del sistema — se sigue llamando así en la
-- base, pero en la UI pasa a presentarse como "Equipo" (ruta /equipo).
--
-- Ejecutar en: Supabase Dashboard → SQL Editor. Correr ANTES de pushear el
-- código que depende de esto.

-- 1. Migrar las filas de equipo a liquidadoras, mismo id. Sin email (no
--    tenían), rol genérico "liquidadora" (editable después desde /equipo),
--    activa según lo que ya tenían en equipo.activo.
INSERT INTO liquidadoras (id, nombre, email, rol, activa)
SELECT id, nombre, NULL, 'liquidadora', activo
FROM equipo
ON CONFLICT (id) DO NOTHING;

-- 2. Repuntar las FKs que hoy apuntan a equipo(id) para que apunten a
--    liquidadoras(id). Los datos no se tocan, solo la referencia.
ALTER TABLE equipo_modulos
  DROP CONSTRAINT equipo_modulos_equipo_id_fkey,
  ADD CONSTRAINT equipo_modulos_equipo_id_fkey
    FOREIGN KEY (equipo_id) REFERENCES liquidadoras(id) ON DELETE CASCADE;

ALTER TABLE servicios_cliente
  DROP CONSTRAINT servicios_cliente_responsable_id_fkey,
  ADD CONSTRAINT servicios_cliente_responsable_id_fkey
    FOREIGN KEY (responsable_id) REFERENCES liquidadoras(id) ON DELETE SET NULL;

ALTER TABLE asignaciones_servicio
  DROP CONSTRAINT asignaciones_servicio_responsable_id_fkey,
  ADD CONSTRAINT asignaciones_servicio_responsable_id_fkey
    FOREIGN KEY (responsable_id) REFERENCES liquidadoras(id) ON DELETE CASCADE;

ALTER TABLE balances DROP CONSTRAINT balances_responsable_id_fkey;
ALTER TABLE balances ADD CONSTRAINT balances_responsable_id_fkey
  FOREIGN KEY (responsable_id) REFERENCES liquidadoras(id);
ALTER TABLE balances DROP CONSTRAINT balances_responsable2_id_fkey;
ALTER TABLE balances ADD CONSTRAINT balances_responsable2_id_fkey
  FOREIGN KEY (responsable2_id) REFERENCES liquidadoras(id);

-- 3. Backfill: las liquidadoras activas existentes (Sueldos) pasan a tener
--    el área 'sueldos' en equipo_modulos — así no pierden acceso bajo el
--    nuevo criterio único (admin, o tener el área correspondiente).
INSERT INTO equipo_modulos (equipo_id, modulo)
SELECT id, 'sueldos'
FROM liquidadoras
WHERE activa = true
ON CONFLICT (equipo_id, modulo) DO NOTHING;

-- 4. vista_empresas — hacía JOIN contra equipo, ahora contra liquidadoras.
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
   LIMIT 1) AS responsable_libros
FROM clientes c;

-- 5. Dejar equipo fuera de uso (no se borra todavía, por las dudas — se
--    puede dropear en una limpieza posterior una vez confirmado que todo
--    anda bien en producción).
ALTER TABLE equipo RENAME TO equipo_legacy;

-- Verificación sugerida después de correr esto:
-- SELECT count(*) FROM liquidadoras;  -- debería subir en ~8 (o menos si había ids repetidos)
-- SELECT count(*) FROM equipo_modulos WHERE modulo = 'sueldos';  -- ~ cantidad de liquidadoras activas
