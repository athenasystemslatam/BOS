-- BOS · Monotributo — tabla de categorías vigente desde el 01/08/2026 (18-nov-2026)
-- Valores de afip.gob.ar/monotributo/categorias.asp ("Valores de aplicación desde el 1/08/2026").
-- Correr DESPUÉS de add_monotributo_facturacion.sql. No pisa nada: si ya hay una versión con esa fecha, no la toca.
DO $$
DECLARE v uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM monotributo_categorias_versiones WHERE vigente_desde = '2026-08-01') THEN
    INSERT INTO monotributo_categorias_versiones (vigente_desde, fuente) VALUES ('2026-08-01', 'afip.gob.ar/monotributo/categorias.asp') RETURNING id INTO v;
    INSERT INTO monotributo_categorias (version_id, categoria, tope_anual, cuota_servicios, cuota_venta) VALUES
      (v, 'A', 12009410.45, 49527.18, 49527.18),
      (v, 'B', 17595182.74, 56379.08, 56379.08),
      (v, 'C', 24670494.31, 66020.12, 64530.58),
      (v, 'D', 30628651.43, 84612.93, 82564.81),
      (v, 'E', 36028231.33, 119811.45, 108267.51),
      (v, 'F', 45151659.41, 150784.21, 129930.65),
      (v, 'G', 53995798.87, 230312.94, 158815.05),
      (v, 'H', 81924660.37, 522706.68, 317895.01),
      (v, 'I', 91699761.90, 963747.86, 474992.78),
      (v, 'J', 105012519.20, 1167299.76, 580793.69),
      (v, 'K', 126610838.75, 1614446.04, 702103.24);
    INSERT INTO monotributo_historial (cliente_id, anio, mes, entidad, campo, valor_anterior, valor_nuevo, ref_id, nota)
    VALUES (null, 2026, 8, 'categorias', 'version_alta', null,
            jsonb_build_object('vigente_desde', '2026-08-01', 'fuente', 'afip.gob.ar/monotributo/categorias.asp'), v, 'Carga inicial desde ARCA');
  END IF;
END $$;

SELECT v.vigente_desde, c.categoria, c.tope_anual, c.cuota_servicios, c.cuota_venta
  FROM monotributo_categorias c JOIN monotributo_categorias_versiones v ON v.id = c.version_id
 ORDER BY v.vigente_desde, c.categoria;
