-- ============================================================
-- RLS FIX — Ejecutar en Supabase Dashboard → SQL Editor
-- Idempotente: se puede correr más de una vez sin problema
-- ============================================================

-- 1. Asegurarse de que RLS esté habilitado en todas las tablas
-- (si ya estaba habilitado, no hace nada)
ALTER TABLE liquidadoras            ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE tareas                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_asignaciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_log               ENABLE ROW LEVEL SECURITY;

-- 2. Borrar políticas existentes (evita error "ya existe")
DROP POLICY IF EXISTS "Acceso total para autenticados" ON liquidadoras;
DROP POLICY IF EXISTS "Acceso total para autenticados" ON clientes;
DROP POLICY IF EXISTS "Acceso total para autenticados" ON periodos;
DROP POLICY IF EXISTS "Acceso total para autenticados" ON tareas;
DROP POLICY IF EXISTS "Acceso total para autenticados" ON historial_asignaciones;
DROP POLICY IF EXISTS "Acceso total para autenticados" ON drive_log;

-- 3. Recrear políticas: acceso total para usuarios autenticados
CREATE POLICY "Acceso total para autenticados" ON liquidadoras
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total para autenticados" ON clientes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total para autenticados" ON periodos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total para autenticados" ON tareas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total para autenticados" ON historial_asignaciones
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Acceso total para autenticados" ON drive_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4. Verificación rápida: debería mostrar 6 filas (una por tabla)
SELECT tablename, COUNT(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'liquidadoras','clientes','periodos',
    'tareas','historial_asignaciones','drive_log'
  )
GROUP BY tablename
ORDER BY tablename;
