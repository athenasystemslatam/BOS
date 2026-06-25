-- ============================================================
-- BOS · KMA Consultores — Migración inicial
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- LIQUIDADORAS (van ligadas a usuarios de Supabase Auth)
CREATE TABLE IF NOT EXISTS liquidadoras (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nombre      TEXT NOT NULL,
  email       TEXT UNIQUE NOT NULL,
  rol         TEXT NOT NULL DEFAULT 'liquidadora'
                CHECK (rol IN ('admin', 'supervisor', 'liquidadora', 'viewer')),
  activa      BOOLEAN DEFAULT TRUE,
  fecha_alta  TIMESTAMPTZ DEFAULT NOW()
);

-- CLIENTES
CREATE TABLE IF NOT EXISTS clientes (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre              TEXT NOT NULL,
  cuit                TEXT NOT NULL UNIQUE,
  terminacion_cuit    INTEGER NOT NULL CHECK (terminacion_cuit BETWEEN 0 AND 9),
  liquidador_id       UUID REFERENCES liquidadoras(id) ON DELETE SET NULL,
  tipo                TEXT NOT NULL DEFAULT 'mensual'
                        CHECK (tipo IN ('mensual', 'quincenal')),
  tiene_sindicato     BOOLEAN DEFAULT FALSE,
  sindicato_nombre    TEXT,
  tiene_rubrica_lsd   BOOLEAN DEFAULT FALSE,
  jurisdiccion        TEXT,
  art                 TEXT,
  vep_banco           TEXT,
  estado              TEXT NOT NULL DEFAULT 'activo'
                        CHECK (estado IN ('activo', 'inactivo')),
  observaciones       TEXT,
  fecha_alta          TIMESTAMPTZ DEFAULT NOW(),
  fecha_baja          TIMESTAMPTZ,
  fecha_modificacion  TIMESTAMPTZ DEFAULT NOW(),
  creado_por          UUID REFERENCES liquidadoras(id) ON DELETE SET NULL
);

-- PERIODOS
CREATE TABLE IF NOT EXISTS periodos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  anio        INTEGER NOT NULL,
  mes         INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  nombre_mes  TEXT NOT NULL,
  UNIQUE (anio, mes)
);

-- TAREAS (una por cliente por período)
CREATE TABLE IF NOT EXISTS tareas (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id       UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  periodo_id       UUID NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  -- Estado lógico (calculado, no se escribe directo)
  rec_q1           BOOLEAN DEFAULT FALSE,
  recibos          BOOLEAN DEFAULT FALSE,
  f931             BOOLEAN DEFAULT FALSE,
  bol_sind         BOOLEAN DEFAULT FALSE,
  rub_lsd          BOOLEAN DEFAULT FALSE,
  sac              BOOLEAN DEFAULT FALSE,
  legajos_cantidad INTEGER DEFAULT 0,
  -- Marcado manual por la liquidadora
  rec_q1_manual    BOOLEAN DEFAULT FALSE,
  recibos_manual   BOOLEAN DEFAULT FALSE,
  f931_manual      BOOLEAN DEFAULT FALSE,
  bol_sind_manual  BOOLEAN DEFAULT FALSE,
  rub_lsd_manual   BOOLEAN DEFAULT FALSE,
  sac_manual       BOOLEAN DEFAULT FALSE,
  -- Detectado automáticamente en Drive
  rec_q1_drive     BOOLEAN DEFAULT FALSE,
  recibos_drive    BOOLEAN DEFAULT FALSE,
  f931_drive       BOOLEAN DEFAULT FALSE,
  bol_sind_drive   BOOLEAN DEFAULT FALSE,
  rub_lsd_drive    BOOLEAN DEFAULT FALSE,
  sac_drive        BOOLEAN DEFAULT FALSE,
  observaciones    TEXT,
  UNIQUE (cliente_id, periodo_id)
);

-- HISTORIAL DE ASIGNACIONES
CREATE TABLE IF NOT EXISTS historial_asignaciones (
  id                      UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id              UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  liquidador_anterior_id  UUID REFERENCES liquidadoras(id) ON DELETE SET NULL,
  liquidador_nuevo_id     UUID NOT NULL REFERENCES liquidadoras(id) ON DELETE CASCADE,
  fecha_cambio            TIMESTAMPTZ DEFAULT NOW(),
  cambiado_por            UUID NOT NULL REFERENCES liquidadoras(id) ON DELETE CASCADE,
  motivo                  TEXT
);

-- DRIVE LOG
CREATE TABLE IF NOT EXISTS drive_log (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id       UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  periodo_id       UUID NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  archivo_nombre   TEXT NOT NULL,
  archivo_url      TEXT,
  tarea_detectada  TEXT NOT NULL,
  fecha_deteccion  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Permite a todos los usuarios autenticados leer y escribir.
-- Refinar con políticas por rol antes de producción.
-- ============================================================
ALTER TABLE liquidadoras        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tareas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_asignaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE drive_log           ENABLE ROW LEVEL SECURITY;

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

-- ============================================================
-- DATOS INICIALES — Períodos 2025 y 2026
-- ============================================================
INSERT INTO periodos (anio, mes, nombre_mes) VALUES
  (2025, 1,  'Enero 2025'),
  (2025, 2,  'Febrero 2025'),
  (2025, 3,  'Marzo 2025'),
  (2025, 4,  'Abril 2025'),
  (2025, 5,  'Mayo 2025'),
  (2025, 6,  'Junio 2025'),
  (2025, 7,  'Julio 2025'),
  (2025, 8,  'Agosto 2025'),
  (2025, 9,  'Septiembre 2025'),
  (2025, 10, 'Octubre 2025'),
  (2025, 11, 'Noviembre 2025'),
  (2025, 12, 'Diciembre 2025'),
  (2026, 1,  'Enero 2026'),
  (2026, 2,  'Febrero 2026'),
  (2026, 3,  'Marzo 2026'),
  (2026, 4,  'Abril 2026'),
  (2026, 5,  'Mayo 2026'),
  (2026, 6,  'Junio 2026'),
  (2026, 7,  'Julio 2026'),
  (2026, 8,  'Agosto 2026'),
  (2026, 9,  'Septiembre 2026'),
  (2026, 10, 'Octubre 2026'),
  (2026, 11, 'Noviembre 2026'),
  (2026, 12, 'Diciembre 2026')
ON CONFLICT (anio, mes) DO NOTHING;
