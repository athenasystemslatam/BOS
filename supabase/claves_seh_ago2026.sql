-- BOS · Claves de Seg. e Higiene encontradas en ESTATUS IMPUESTOS 2026.xlsx (24-ago)
-- Solo había 2 filas completas (usuario+clave) y 1 con usuario nomás, de 119.
-- Ejecutar en Supabase SQL Editor. OJO: no está hecha para correrse dos veces
-- (agregaría la clave duplicada) — si hace falta re-correr, avisar.

UPDATE clientes
SET claves_acceso = COALESCE(claves_acceso, '[]'::jsonb) || jsonb_build_array(
  jsonb_build_object(
    'sistema', 'Seg. e Hig. — Escobar',
    'usuario', '33718342029',
    'contrasena', 'Market2024',
    'url', '',
    'modulo', 'impuestos'
  )
)
WHERE regexp_replace(cuit, '\D', '', 'g') = '33718342029'; -- MARKETDELBARRIO S.R.L.

UPDATE clientes
SET claves_acceso = COALESCE(claves_acceso, '[]'::jsonb) || jsonb_build_array(
  jsonb_build_object(
    'sistema', 'Seg. e Hig. — Morón',
    'usuario', '30716054558',
    'contrasena', 'Tucuman1731',
    'url', '',
    'modulo', 'impuestos'
  )
)
WHERE regexp_replace(cuit, '\D', '', 'g') = '30716054558'; -- NEO KINGS SAS

UPDATE clientes
SET claves_acceso = COALESCE(claves_acceso, '[]'::jsonb) || jsonb_build_array(
  jsonb_build_object(
    'sistema', 'Seg. e Hig. — Malvinas',
    'usuario', '30718506863',
    'contrasena', '',
    'url', '',
    'modulo', 'impuestos'
  )
)
WHERE regexp_replace(cuit, '\D', '', 'g') = '30718506863'; -- TERRAZAS DEL TALAR S.R.L. (sin clave, solo usuario en el Excel)
