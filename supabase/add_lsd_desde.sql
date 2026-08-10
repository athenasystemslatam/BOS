ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS lsd_desde_anio INT,
  ADD COLUMN IF NOT EXISTS lsd_desde_mes  INT;
