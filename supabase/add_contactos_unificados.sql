-- BOS · Contactos unificados del cliente (18-nov-2026)
-- Una sola lista de mails y de teléfonos por cliente, para todo el sistema (Panel General,
-- Clientes, Seguimiento de Sueldos, Monotributo y la ficha). Cada teléfono con su aclaración.
-- Solo agrega: una columna nueva (clientes.telefonos_detalle) y copia datos; no borra nada.
--   · Teléfonos: el teléfono actual del cliente + el WhatsApp de la ficha de Monotributo
--     (si es otro número, con aclaración "WhatsApp").
--   · Mails: a la lista general se le suman los mails de la ficha de Monotributo que no estaban,
--     con aclaración "Monotributo".
-- Las columnas viejas (clientes.telefono, clientes.emails_contacto y los mails/WhatsApp de
-- monotributo_clientes) quedan como están; el sistema sigue completando telefono y emails_contacto.
-- Ejecutar todo junto en Supabase → SQL Editor (una sola transacción). Correrlo dos veces no duplica.

CREATE TABLE IF NOT EXISTS backup_contactos_20261118 AS
SELECT c.id AS cliente_id, c.telefono, c.emails_contacto, c.emails_contacto_detalle,
       m.mails AS mono_mails, m.whatsapp AS mono_whatsapp, now() AS copiado_en
  FROM clientes c LEFT JOIN monotributo_clientes m ON m.cliente_id = c.id;
ALTER TABLE backup_contactos_20261118 ENABLE ROW LEVEL SECURITY;

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefonos_detalle jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Teléfonos (solo clientes que todavía no tienen la lista cargada)
UPDATE clientes c
   SET telefonos_detalle = t.lista
  FROM (
    SELECT c2.id,
           CASE
             WHEN nullif(trim(c2.telefono), '') IS NOT NULL AND nullif(trim(m.whatsapp), '') IS NOT NULL
                  AND regexp_replace(c2.telefono, '\D', '', 'g') <> regexp_replace(m.whatsapp, '\D', '', 'g')
               THEN jsonb_build_array(jsonb_build_object('telefono', trim(c2.telefono), 'aclaracion', ''),
                                      jsonb_build_object('telefono', trim(m.whatsapp), 'aclaracion', 'WhatsApp'))
             WHEN nullif(trim(c2.telefono), '') IS NOT NULL
               THEN jsonb_build_array(jsonb_build_object('telefono', trim(c2.telefono),
                      'aclaracion', CASE WHEN regexp_replace(c2.telefono, '\D', '', 'g') = regexp_replace(coalesce(m.whatsapp, ''), '\D', '', 'g') THEN 'WhatsApp' ELSE '' END))
             WHEN nullif(trim(m.whatsapp), '') IS NOT NULL
               THEN jsonb_build_array(jsonb_build_object('telefono', trim(m.whatsapp), 'aclaracion', 'WhatsApp'))
             ELSE '[]'::jsonb
           END AS lista
      FROM clientes c2 LEFT JOIN monotributo_clientes m ON m.cliente_id = c2.id
     WHERE c2.telefonos_detalle = '[]'::jsonb
  ) t
 WHERE c.id = t.id AND t.lista <> '[]'::jsonb;

-- Mails de Monotributo que no estaban en la lista general
WITH base AS (
  SELECT c.id,
         CASE WHEN jsonb_typeof(c.emails_contacto_detalle) = 'array' AND jsonb_array_length(c.emails_contacto_detalle) > 0
              THEN c.emails_contacto_detalle
              ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('email', e, 'aclaracion', ''))
                               FROM unnest(coalesce(c.emails_contacto, '{}')) e WHERE trim(e) <> ''), '[]'::jsonb)
         END AS lista,
         m.mails
    FROM clientes c JOIN monotributo_clientes m ON m.cliente_id = c.id
   WHERE coalesce(array_length(m.mails, 1), 0) > 0
),
nuevos AS (
  SELECT b.id, b.lista,
         coalesce((SELECT jsonb_agg(jsonb_build_object('email', trim(mm), 'aclaracion', 'Monotributo'))
                     FROM unnest(b.mails) mm
                    WHERE trim(mm) <> ''
                      AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(b.lista) x
                                       WHERE lower(trim(x->>'email')) = lower(trim(mm)))), '[]'::jsonb) AS agregar
    FROM base b
)
UPDATE clientes c
   SET emails_contacto_detalle = n.lista || n.agregar,
       emails_contacto = ARRAY(SELECT x->>'email' FROM jsonb_array_elements(n.lista || n.agregar) x)
  FROM nuevos n
 WHERE c.id = n.id AND n.agregar <> '[]'::jsonb;

-- Verificación
SELECT
  (SELECT count(*) FROM clientes WHERE telefonos_detalle <> '[]'::jsonb)                       AS clientes_con_telefonos,
  (SELECT count(*) FROM clientes WHERE telefonos_detalle::text ILIKE '%WhatsApp%')             AS con_whatsapp,
  (SELECT count(*) FROM clientes WHERE emails_contacto_detalle::text ILIKE '%"Monotributo"%') AS con_mails_de_monotributo;
