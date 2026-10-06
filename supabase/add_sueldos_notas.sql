-- Sección "Información" de Sueldos: cartelera de notas compartida por el
-- equipo (ver sección "Información" en el sidebar y src/app/(dashboard)/informacion/).
-- Reemplazada enseguida por rework_sueldos_notas_contactos.sql (se dejó este
-- archivo para conservar el historial del diseño original).
CREATE TABLE sueldos_notas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tema          TEXT NOT NULL,
  modulo        TEXT NOT NULL DEFAULT 'general' CHECK (modulo = ANY (ARRAY['general','sueldos','impuestos','contable','monotributo']::text[])),
  contacto      TEXT,
  contenido     TEXT NOT NULL DEFAULT '',
  importante    BOOLEAN NOT NULL DEFAULT false,
  creado_por    UUID REFERENCES liquidadoras(id),
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE sueldos_notas ENABLE ROW LEVEL SECURITY;
