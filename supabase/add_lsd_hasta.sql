ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS lsd_hasta_anio INT,
  ADD COLUMN IF NOT EXISTS lsd_hasta_mes  INT;
