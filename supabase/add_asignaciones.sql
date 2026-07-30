-- Crear tabla asignaciones (reasignación de empresas con fecha efectiva)
-- Reemplaza el diseño anterior de historial_asignaciones con una estructura
-- que permite resolver qué liquidadora tenía una empresa en un período dado.
-- Ejecutar en: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS asignaciones (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id    UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  liquidador_id UUID NOT NULL REFERENCES liquidadoras(id) ON DELETE CASCADE,
  desde_anio    INTEGER NOT NULL,
  desde_mes     INTEGER NOT NULL CHECK (desde_mes BETWEEN 1 AND 12),
  creado_por    TEXT,
  creado_en     TIMESTAMPTZ DEFAULT NOW(),
  motivo        TEXT,
  UNIQUE (cliente_id, desde_anio, desde_mes)
);

-- RLS
ALTER TABLE asignaciones ENABLE ROW LEVEL SECURITY;

-- Service role: acceso total (cron, server actions con admin client)
DROP POLICY IF EXISTS "asignaciones_service" ON asignaciones;
CREATE POLICY "asignaciones_service" ON asignaciones
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Admin y supervisor: lectura y escritura
DROP POLICY IF EXISTS "asignaciones_admin" ON asignaciones;
CREATE POLICY "asignaciones_admin" ON asignaciones
  FOR ALL
  USING (is_admin())
  WITH CHECK (is_admin());

-- Liquidadoras: solo lectura de sus propias asignaciones
DROP POLICY IF EXISTS "asignaciones_liq_read" ON asignaciones;
CREATE POLICY "asignaciones_liq_read" ON asignaciones
  FOR SELECT
  USING (liquidador_id = current_liquidadora_id());
