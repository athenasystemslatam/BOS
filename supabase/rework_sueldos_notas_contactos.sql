-- Rediseño de sueldos_notas a pedido del usuario: se saca "módulo" (la
-- sección ya es de Sueldos, el campo era redundante) y "contacto" pasa de
-- un campo de texto único a una lista de contactos (nombre, a quién
-- corresponde, observaciones) — ver ContactosEditor en InformacionClient.tsx.
ALTER TABLE sueldos_notas DROP COLUMN modulo;
ALTER TABLE sueldos_notas DROP COLUMN contacto;
ALTER TABLE sueldos_notas ADD COLUMN contactos JSONB NOT NULL DEFAULT '[]'::jsonb;
