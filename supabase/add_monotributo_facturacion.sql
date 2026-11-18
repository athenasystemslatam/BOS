-- BOS · Monotributo — Facturación: categorías con vigencia, controles y cargas (18-nov-2026)
-- Solo agrega: tablas nuevas, funciones de cálculo, y amplía el CHECK de
-- monotributo_historial.entidad (mismos valores + los nuevos; no cambia datos).
-- Antes: bajar el backup del módulo (Dashboard de Monotributo → Backup).
-- Ejecutar todo junto en Supabase → SQL Editor.

-- ── 1. Tabla de categorías ARCA, por versión (cada actualización es una versión nueva) ──
CREATE TABLE IF NOT EXISTS monotributo_categorias_versiones (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vigente_desde  date        NOT NULL UNIQUE,
  fuente         text,
  nota           text,
  creado_por     uuid        REFERENCES liquidadoras(id),
  creado_en      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE monotributo_categorias_versiones ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS monotributo_categorias (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id       uuid    NOT NULL REFERENCES monotributo_categorias_versiones(id) ON DELETE CASCADE,
  categoria        text    NOT NULL CHECK (categoria IN ('A','B','C','D','E','F','G','H','I','J','K')),
  tope_anual       numeric(16,2) NOT NULL CHECK (tope_anual > 0),
  cuota_servicios  numeric(14,2),   -- total mensual, locaciones y prestaciones de servicios (opcional)
  cuota_venta      numeric(14,2),   -- total mensual, venta de cosas muebles (opcional)
  UNIQUE (version_id, categoria)
);
ALTER TABLE monotributo_categorias ENABLE ROW LEVEL SECURITY;

-- ── 2. Controles de facturación por año ──
CREATE TABLE IF NOT EXISTS monotributo_controles (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  anio                int         NOT NULL CHECK (anio BETWEEN 2020 AND 2100),
  mes                 int         NOT NULL CHECK (mes BETWEEN 1 AND 12),
  -- La ventana de 12 meses termina en la fecha de corte (hasta) y empieza 12 meses antes + 1 día (desde).
  fecha_corte         date        NOT NULL,
  es_cierre_semestre  boolean     NOT NULL DEFAULT false,
  nota                text,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_por         uuid        REFERENCES liquidadoras(id),
  UNIQUE (anio, mes)
);
ALTER TABLE monotributo_controles ENABLE ROW LEVEL SECURITY;

-- ── 3. Fase 2 (todavía sin uso): archivos "Mis Comprobantes Emitidos" de ARCA ──
-- Cuando se suba el archivo, BOS guarda acá los totales (facturas menos notas de crédito)
-- y la carga del control apunta a este archivo con origen = 'archivo'.
CREATE TABLE IF NOT EXISTS monotributo_facturacion_archivos (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id            uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  control_id            uuid        NOT NULL REFERENCES monotributo_controles(id) ON DELETE CASCADE,
  nombre_archivo        text,
  comprobantes          int,
  total_facturas        numeric(16,2),
  total_notas_credito   numeric(16,2),
  total_neto            numeric(16,2),
  subido_por            uuid        REFERENCES liquidadoras(id),
  subido_en             timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE monotributo_facturacion_archivos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS monotributo_fact_archivos_idx ON monotributo_facturacion_archivos (cliente_id, control_id);

-- ── 4. Carga por cliente y por control ──
CREATE TABLE IF NOT EXISTS monotributo_facturacion (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id           uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  control_id           uuid        NOT NULL REFERENCES monotributo_controles(id) ON DELETE CASCADE,
  total_facturado      numeric(16,2) CHECK (total_facturado >= 0),
  origen               text        NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'archivo')),
  archivo_id           uuid        REFERENCES monotributo_facturacion_archivos(id) ON DELETE SET NULL,
  ficha_enviada        boolean     NOT NULL DEFAULT false,
  ficha_enviada_fecha  date,
  nota                 text,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_por          uuid        REFERENCES liquidadoras(id),
  UNIQUE (cliente_id, control_id)
);
ALTER TABLE monotributo_facturacion ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS monotributo_facturacion_control_idx ON monotributo_facturacion (control_id);

-- ── 5. Configuración del módulo (umbral de "cerca del tope", etc.) ──
CREATE TABLE IF NOT EXISTS monotributo_config (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  clave        text        PRIMARY KEY,
  valor        jsonb       NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_por  uuid        REFERENCES liquidadoras(id)
);
ALTER TABLE monotributo_config ENABLE ROW LEVEL SECURITY;
INSERT INTO monotributo_config (clave, valor) VALUES ('umbral_amarillo', '85') ON CONFLICT (clave) DO NOTHING;

-- Para leer la categoría vigente de cada cliente rápido.
CREATE INDEX IF NOT EXISTS monotributo_tareas_cliente_periodo_idx ON monotributo_tareas (cliente_id, anio DESC, mes DESC);

-- ── 6. Historial: entidades nuevas (se amplía el CHECK con la lista completa) ──
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
            WHERE conrelid = 'monotributo_historial'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) ILIKE '%entidad%'
  LOOP
    EXECUTE format('ALTER TABLE monotributo_historial DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE monotributo_historial ADD CONSTRAINT monotributo_historial_entidad_check
  CHECK (entidad IN ('tarea', 'ficha', 'responsable', 'revision', 'alerta', 'calendario',
                     'categorias', 'control', 'facturacion', 'config'));

-- ── 7. Cálculos (en la base, una sola consulta por pantalla) ──
-- Clientes con Monotributo activo para un control: categoría vigente, tope de la tabla
-- vigente en p_hoy, % usado, margen y la categoría que correspondería.
CREATE OR REPLACE FUNCTION monotributo_facturacion_control(p_control uuid, p_hoy date)
RETURNS TABLE (
  cliente_id uuid, nombre text, cuit text, responsable_id uuid,
  categoria text, tope numeric, total_facturado numeric, pct numeric, margen numeric,
  categoria_correspondiente text, ficha_enviada boolean, ficha_enviada_fecha date,
  nota text, origen text, updated_at timestamptz, cargado boolean
)
LANGUAGE sql STABLE AS $$
  WITH version AS (
    SELECT id FROM monotributo_categorias_versiones WHERE vigente_desde <= p_hoy ORDER BY vigente_desde DESC LIMIT 1
  ),
  topes AS (
    SELECT c.categoria, c.tope_anual FROM monotributo_categorias c JOIN version v ON v.id = c.version_id
  ),
  base AS (
    SELECT s.cliente_id, cl.nombre, cl.cuit, s.responsable_id,
           (SELECT t.categoria FROM monotributo_tareas t
             WHERE t.cliente_id = s.cliente_id AND t.categoria IS NOT NULL
               AND (t.anio * 100 + t.mes) <= (extract(year FROM p_hoy)::int * 100 + extract(month FROM p_hoy)::int)
             ORDER BY t.anio DESC, t.mes DESC LIMIT 1) AS categoria,
           f.total_facturado, f.ficha_enviada, f.ficha_enviada_fecha, f.nota, f.origen, f.updated_at,
           (f.total_facturado IS NOT NULL) AS cargado
      FROM servicios_cliente s
      JOIN clientes cl ON cl.id = s.cliente_id
      LEFT JOIN monotributo_facturacion f ON f.cliente_id = s.cliente_id AND f.control_id = p_control
     WHERE s.servicio = 'monotributo' AND s.estado = true
  )
  SELECT b.cliente_id, b.nombre, b.cuit, b.responsable_id, b.categoria, tp.tope_anual,
         b.total_facturado,
         CASE WHEN tp.tope_anual > 0 AND b.total_facturado IS NOT NULL THEN round(b.total_facturado * 100 / tp.tope_anual, 1) END,
         CASE WHEN b.total_facturado IS NOT NULL THEN tp.tope_anual - b.total_facturado END,
         CASE WHEN b.total_facturado IS NOT NULL THEN
           (SELECT t2.categoria FROM topes t2 WHERE t2.tope_anual >= b.total_facturado ORDER BY t2.tope_anual LIMIT 1) END,
         coalesce(b.ficha_enviada, false), b.ficha_enviada_fecha, b.nota, b.origen, b.updated_at, b.cargado
    FROM base b
    LEFT JOIN topes tp ON tp.categoria = b.categoria;
$$;

-- Resumen para el Dashboard: cargados, fichas enviadas, cerca del tope y sobre el tope.
CREATE OR REPLACE FUNCTION monotributo_facturacion_resumen(p_control uuid, p_hoy date, p_umbral numeric)
RETURNS TABLE (total int, cargados int, fichas_enviadas int, cerca_tope int, sobre_tope int)
LANGUAGE sql STABLE AS $$
  SELECT count(*)::int,
         count(*) FILTER (WHERE cargado)::int,
         count(*) FILTER (WHERE ficha_enviada)::int,
         count(*) FILTER (WHERE pct >= p_umbral AND pct <= 100)::int,
         count(*) FILTER (WHERE pct > 100)::int
    FROM monotributo_facturacion_control(p_control, p_hoy);
$$;

-- Verificación sugerida:
-- SELECT count(*) FROM monotributo_categorias_versiones;  -- 0 (se cargan desde la pantalla)
-- SELECT * FROM monotributo_config;                       -- umbral_amarillo = 85
