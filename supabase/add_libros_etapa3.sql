-- ============================================================
-- BOS · Módulo Libros Societarios — Etapa 3
-- Pedidos y trámites (pantalla), Entrada y Salida, Copiadora.
-- Requiere add_libros_etapa2.sql corrido. Se puede correr más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. libros_pedidos — ajustes al esquema de la etapa 2
-- ──────────────────────────────────────────────────────────────

-- 1a. Columnas nuevas
ALTER TABLE libros_pedidos
  ADD COLUMN IF NOT EXISTS responsable_id UUID REFERENCES liquidadoras(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS solicitante    TEXT;

-- 1b. Cambiar el CHECK de estado y renombrar los valores existentes.
--     El constraint tiene un nombre generado; se busca dinámicamente para
--     que el script sea idempotente aunque ya se haya corrido en parte.
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT constraint_name INTO cname
  FROM information_schema.table_constraints
  WHERE table_name = 'libros_pedidos'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%estado%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE libros_pedidos DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- Eliminar el índice único antes de tocar los datos (filtra por estado)
DROP INDEX IF EXISTS libros_pedidos_tomo_abierto_idx;

-- Migrar valores: pendiente → abierto, enviado → esperando_cliente, cancelado → cerrado
UPDATE libros_pedidos SET estado = 'abierto'           WHERE estado = 'pendiente';
UPDATE libros_pedidos SET estado = 'esperando_cliente' WHERE estado = 'enviado';
UPDATE libros_pedidos SET estado = 'cerrado'           WHERE estado = 'cancelado';

-- Nuevo constraint y nuevo default
ALTER TABLE libros_pedidos
  ALTER COLUMN estado SET DEFAULT 'abierto',
  ADD CONSTRAINT libros_pedidos_estado_check
    CHECK (estado IN ('abierto','esperando_cliente','esperando_tercero',
                      'aprobado','rechazado','cerrado'));

-- Recrear el índice único con los nuevos nombres de estado
CREATE UNIQUE INDEX IF NOT EXISTS libros_pedidos_tomo_abierto_idx
  ON libros_pedidos (libro_id)
  WHERE tipo = 'presupuesto_tomo_nuevo'
    AND estado IN ('abierto','esperando_cliente','esperando_tercero');

-- 1c. Quitar la columna seguimientos JSONB — reemplazada por la tabla de seguimientos
ALTER TABLE libros_pedidos DROP COLUMN IF EXISTS seguimientos;

-- ──────────────────────────────────────────────────────────────
-- 2. libros_pedidos_seguimientos
-- ──────────────────────────────────────────────────────────────
-- Cada fila es un seguimiento registrado sobre un pedido.
-- Al insertar una fila, la action actualiza también libros_pedidos.ultimo_seguimiento
-- y libros_pedidos.proximo_seguimiento.
CREATE TABLE IF NOT EXISTS libros_pedidos_seguimientos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id           UUID NOT NULL REFERENCES libros_pedidos(id) ON DELETE CASCADE,
  fecha               DATE NOT NULL DEFAULT CURRENT_DATE,
  nota                TEXT NOT NULL,
  proximo_seguimiento DATE,
  registrado_por      UUID REFERENCES liquidadoras(id) ON DELETE SET NULL,
  creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE libros_pedidos_seguimientos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS libros_pedidos_seg_pedido_idx
  ON libros_pedidos_seguimientos (pedido_id);

-- ──────────────────────────────────────────────────────────────
-- 3. libros — columna extraviado
-- ──────────────────────────────────────────────────────────────
-- Permite calcular el resumen (en estudio / en copiadora / en cliente / extraviados)
-- con un COUNT simple. Se setea a TRUE al registrar un extravío y a FALSE al resolverlo.
ALTER TABLE libros ADD COLUMN IF NOT EXISTS extraviado BOOLEAN NOT NULL DEFAULT FALSE;

-- ──────────────────────────────────────────────────────────────
-- 4. libros_movimientos
-- ──────────────────────────────────────────────────────────────
-- Una fila por libro por movimiento. Registrar la salida/entrada de varios
-- libros del mismo cliente inserta varias filas (una por libro).
-- Al registrar una salida se actualiza libros.ubicacion en la app.
-- Si tipo='salida' y destino='copiadora', la action cambia el estado de la
-- tarea abierta del libro a 'copiandose'.
CREATE TABLE IF NOT EXISTS libros_movimientos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  libro_id       UUID NOT NULL REFERENCES libros(id) ON DELETE CASCADE,
  tarea_id       UUID REFERENCES libros_tareas(id) ON DELETE SET NULL,
  fecha          DATE        NOT NULL DEFAULT CURRENT_DATE,
  tipo           TEXT        NOT NULL CHECK (tipo IN ('entrada','salida')),
  destino        TEXT        NOT NULL CHECK (destino IN ('copiadora','cliente','estudio','otro')),
  persona        TEXT,
  es_mensajeria  BOOLEAN     NOT NULL DEFAULT FALSE,
  comentario     TEXT,
  registrado_por UUID REFERENCES liquidadoras(id) ON DELETE SET NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE libros_movimientos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS libros_movimientos_libro_idx ON libros_movimientos (libro_id);
CREATE INDEX IF NOT EXISTS libros_movimientos_tarea_idx ON libros_movimientos (tarea_id);

-- ──────────────────────────────────────────────────────────────
-- 5. libros_incidencias
-- ──────────────────────────────────────────────────────────────
-- Extravíos y daños. Registrar un extravío también setea libros.extraviado = TRUE.
-- Resolverlo setea libros.extraviado = FALSE (si no hay otras incidencias abiertas).
CREATE TABLE IF NOT EXISTS libros_incidencias (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  libro_id       UUID NOT NULL REFERENCES libros(id) ON DELETE CASCADE,
  fecha          DATE        NOT NULL DEFAULT CURRENT_DATE,
  tipo           TEXT        NOT NULL DEFAULT 'extravio'
                   CHECK (tipo IN ('extravio','daño','otro')),
  situacion      TEXT        NOT NULL,
  resolucion     TEXT,
  resuelto       BOOLEAN     NOT NULL DEFAULT FALSE,
  registrado_por UUID REFERENCES liquidadoras(id) ON DELETE SET NULL,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE libros_incidencias ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS libros_incidencias_libro_idx ON libros_incidencias (libro_id);

-- ──────────────────────────────────────────────────────────────
-- 6. copiadora_facturas
-- ──────────────────────────────────────────────────────────────
-- Una fila por cliente por factura recibida (no por mes).
-- 'mes' es opcional: primer día del mes (ej. 2026-10-01 = octubre 2026),
-- útil para filtrar por período pero sin restricción de unicidad.
CREATE TABLE IF NOT EXISTS copiadora_facturas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor           TEXT        NOT NULL DEFAULT 'Arena Mattioni',
  cliente_id          UUID        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nro_factura         TEXT,
  fecha_factura       DATE,
  mes                 DATE,
  monto               NUMERIC(14,2),
  factura_recibida    BOOLEAN     NOT NULL DEFAULT FALSE,
  reenviada_cliente   BOOLEAN     NOT NULL DEFAULT FALSE,
  pagado              BOOLEAN     NOT NULL DEFAULT FALSE,
  comprobante_enviado BOOLEAN     NOT NULL DEFAULT FALSE,
  observaciones       TEXT,
  creado_por          UUID REFERENCES liquidadoras(id) ON DELETE SET NULL,
  creado_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE copiadora_facturas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS copiadora_facturas_cliente_idx ON copiadora_facturas (cliente_id);

-- Tabla puente: qué tareas de copiado cubre cada factura.
-- Permite saber, desde la tarea, si ya tiene factura asociada.
CREATE TABLE IF NOT EXISTS copiadora_facturas_tareas (
  factura_id UUID NOT NULL REFERENCES copiadora_facturas(id) ON DELETE CASCADE,
  tarea_id   UUID NOT NULL REFERENCES libros_tareas(id)      ON DELETE CASCADE,
  PRIMARY KEY (factura_id, tarea_id)
);
ALTER TABLE copiadora_facturas_tareas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS copiadora_ft_tarea_idx ON copiadora_facturas_tareas (tarea_id);
