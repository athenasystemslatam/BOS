-- Corrección de unificar_equipo.sql (corrida en producción el mismo día,
-- minutos después). El paso 3 de esa migración (backfill de
-- equipo_modulos(modulo='sueldos') para liquidadoras activas) corría
-- DESPUÉS de haber mezclado `equipo` adentro de `liquidadoras` en el paso 1
-- — así que también etiquetó como "sueldos" a las 24 personas que vinieron
-- de Impuestos/Contable/Monotributo, que nunca fueron de Sueldos.
--
-- Se identifican con certeza porque preservaron su id original — están en
-- equipo_legacy.
DELETE FROM equipo_modulos
WHERE modulo = 'sueldos' AND equipo_id IN (SELECT id FROM equipo_legacy);

-- Verificado en producción: equipo_legacy tenía 24 filas, las 24 migraron
-- ok a liquidadoras. con_area_sueldos bajó de 33 a 9 (33 - 24 = 9), que
-- coincide exacto con la cantidad real de liquidadoras originales activas.
