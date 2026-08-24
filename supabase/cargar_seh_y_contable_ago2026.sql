-- BOS · Carga Seguridad e Higiene + responsables de Contable (24-ago-2026)
-- Origen: cruce de ESTATUS IMPUESTOS 2026.xlsx / ESTATUS BALANCES .xlsx contra
-- los datos reales de BOS (leídos en vivo desde el Panel General, no desde una
-- copia local de la base). Ejecutado por Giuliana vía Supabase Dashboard → SQL
-- Editor porque la sesión de Claude no tenía credenciales de escritura.
-- Segura de re-ejecutar (usa ON CONFLICT / matching estricto por CUIT).

-- ── 1. Seguridad e Higiene — 20 clientes con responsable confirmado ────────
WITH seh (cuit, responsable_nombre) AS (
  VALUES
    ('30715597523', 'Vanesa'),      -- BLACK FISH SRL
    ('30715821989', 'Vanesa'),      -- GASTROFAN
    ('30717226905', 'Vanesa'),      -- GRUPO GARMI
    ('30638569368', 'Salomé'),      -- MAXIGAS S A
    ('30714337900', 'Guillermo'),   -- MASTER MEAT
    ('30718254910', 'Guillermo'),   -- HYGGE INVESTMENTS S.A
    ('33718342029', 'Candela R.'),  -- MARKETDELBARRIO S.R.L.
    ('30716054558', 'Candela R.'),  -- NEO KINGS SAS
    ('30717004570', 'Vanesa'),      -- LAUSANM 2021 S.R.L.
    ('30716742594', 'José'),        -- RIALTO CAFFE S.R.L.
    ('30715692119', 'José'),        -- TECNOLOGIA Y LUZ SA
    ('30710847939', 'José'),        -- BOULEVARD PILAR
    ('30709327727', 'José'),        -- TERMOGROSS S.R.L.
    ('30597915264', 'José'),        -- RODBALL
    ('30716423030', 'José'),        -- MAYANA
    ('30708987529', 'José'),        -- JUAN LUIS A.Y CASSELLA NORBERTO E. (SH)
    ('30712305890', 'José'),        -- DELICIAS DEL NORTE S.R.L
    ('23345025359', 'José'),        -- SEDERO RICARDO MARTIN
    ('30717088561', 'José'),        -- MITLAU S.R.L.  (fila "MITLAU" del Excel)
    ('30719192250', NULL),          -- MITLAU LA PLATA (sin responsable en el Excel)
    ('30719209439', NULL)           -- MITLAU LELOIR   (sin responsable en el Excel)
)
INSERT INTO servicios_cliente (cliente_id, servicio, subtipo, responsable_id, estado)
SELECT c.id, 'impuestos', 'seh', l.id, true
FROM seh
JOIN clientes c ON regexp_replace(c.cuit, '\D', '', 'g') = seh.cuit
LEFT JOIN liquidadoras l ON l.nombre = seh.responsable_nombre
ON CONFLICT (cliente_id, servicio, subtipo)
DO UPDATE SET responsable_id = EXCLUDED.responsable_id, estado = true;

-- ── 2. TERRAZAS DEL TALAR S.R.L. — confirmado por Giuliana como el mismo
--    cliente que "TERRAZAS DEL NORTE" en el Excel (nombre distinto, no typo).
INSERT INTO servicios_cliente (cliente_id, servicio, subtipo, responsable_id, estado)
SELECT c.id, 'impuestos', 'seh', l.id, true
FROM clientes c
JOIN liquidadoras l ON l.nombre = 'Candela R.'
WHERE regexp_replace(c.cuit, '\D', '', 'g') = '30718506863'
ON CONFLICT (cliente_id, servicio, subtipo)
DO UPDATE SET responsable_id = EXCLUDED.responsable_id, estado = true;

INSERT INTO impuestos_tareas (cliente_id, subtipo, anio, mes, observaciones)
SELECT c.id, 'seh', 2026, 8,
       '⚠ En el archivo ESTATUS original figuraba como "TERRAZAS DEL NORTE" — confirmar que corresponde a este cliente.'
FROM clientes c
WHERE regexp_replace(c.cuit, '\D', '', 'g') = '30718506863'
ON CONFLICT (cliente_id, subtipo, anio, mes)
DO UPDATE SET observaciones = EXCLUDED.observaciones;

-- ── 3. Contable — 10 responsables desde el Excel de Balances ───────────────
-- El resto de los ~76 clientes de Contable sin responsable son balances de
-- 2026 que todavía no cerraron (período vencido, no un dato faltante) —
-- confirmado por Giuliana, no se tocan.
WITH contable (cuit, responsable_nombre) AS (
  VALUES
    ('30712400621', 'Lautaro'),
    ('33710244109', 'Cristina'),
    ('30719128455', 'Héctor'),
    ('30718444663', 'Anabel'),
    ('30718047672', 'Cristina'),
    ('30717847500', 'Laura'),
    ('30715040634', 'Lautaro'),
    ('30716423030', 'Anabel'),
    ('30716742594', 'Anabel'),
    ('30709327727', 'Lautaro')
)
UPDATE servicios_cliente sc
SET responsable_id = l.id
FROM contable, clientes c, liquidadoras l
WHERE sc.cliente_id = c.id
  AND regexp_replace(c.cuit, '\D', '', 'g') = contable.cuit
  AND sc.servicio = 'contable'
  AND l.nombre ILIKE contable.responsable_nombre || '%'
  AND sc.responsable_id IS NULL;
