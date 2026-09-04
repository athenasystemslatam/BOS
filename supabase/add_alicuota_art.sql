-- BOS · Agregar alícuota ART a clientes — 04-sep-2026
-- Dato del cliente (no por período), editable a mano como columna directa
-- en la tabla de Seguimiento de Sueldos, junto a Legajos/Observaciones.
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS alicuota_art TEXT;
