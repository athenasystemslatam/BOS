-- ============================================================
-- BOS · Módulo Libros Societarios — Etapa 2
-- Cola de trabajo (tareas), estados editables y pedidos. La pantalla de
-- pedidos llega en la etapa 3; la tabla se crea ahora porque registrar
-- un copiado con pocos folios ya genera el pedido de tomo nuevo.
-- Requiere add_libros_etapa1.sql. Se puede correr más de una vez.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. LIBROS_ESTADOS — editables por admin (etapa 4): se puede cambiar el
-- nombre y el orden, y agregar estados nuevos (sin código). El sistema
-- solo depende de 'pendiente' (estado de una tarea nueva), 'copiandose'
-- (salida a copiadora, etapa 3) y 'copiado' (final: pasa al historial).
CREATE TABLE IF NOT EXISTS libros_estados (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre    TEXT NOT NULL,
  orden     INTEGER NOT NULL DEFAULT 0,
  es_final  BOOLEAN NOT NULL DEFAULT FALSE,
  codigo    TEXT UNIQUE,
  activo    BOOLEAN NOT NULL DEFAULT TRUE
);
ALTER TABLE libros_estados ENABLE ROW LEVEL SECURITY;

INSERT INTO libros_estados (nombre, orden, es_final, codigo) VALUES
  ('Pendiente',   10, FALSE, 'pendiente'),
  ('En proceso',  20, FALSE, 'en_proceso'),
  ('En espera',   30, FALSE, 'en_espera'),
  ('Para copiar', 40, FALSE, 'para_copiar'),
  ('Copiándose',  50, FALSE, 'copiandose'),
  ('Copiado',     60, TRUE,  'copiado')
ON CONFLICT (codigo) DO NOTHING;

-- 2. LIBROS_PEDIDOS — pedidos, trámites y presupuestos (pantalla en etapa 3)
CREATE TABLE IF NOT EXISTS libros_pedidos (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id           UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  libro_id             UUID REFERENCES libros(id) ON DELETE SET NULL,
  tipo                 TEXT NOT NULL CHECK (tipo IN
                         ('presupuesto_libro_nuevo','presupuesto_tomo_nuevo','tramite',
                          'pedido_cliente','asamblea','cambio_societario')),
  descripcion          TEXT,
  fecha_pedido         DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_limite         DATE,
  estado               TEXT NOT NULL DEFAULT 'pendiente'
                         CHECK (estado IN ('pendiente','enviado','aprobado','rechazado','cancelado')),
  ultimo_seguimiento   DATE,
  proximo_seguimiento  DATE,
  monto                NUMERIC(14,2),
  respuesta            TEXT,
  seguimientos         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{fecha, nota, por}]
  automatico           BOOLEAN NOT NULL DEFAULT FALSE,      -- lo creó el sistema
  creado_por           UUID REFERENCES liquidadoras(id) ON DELETE SET NULL,
  creado_en            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE libros_pedidos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS libros_pedidos_cliente_idx ON libros_pedidos (cliente_id);
-- Un solo presupuesto de tomo nuevo abierto por libro: registrar dos
-- copiados seguidos con pocos folios no lo duplica.
CREATE UNIQUE INDEX IF NOT EXISTS libros_pedidos_tomo_abierto_idx
  ON libros_pedidos (libro_id)
  WHERE tipo = 'presupuesto_tomo_nuevo' AND estado IN ('pendiente','enviado');

-- 3. LIBROS_TAREAS — cola de trabajo. Lo terminado no se borra: es el historial.
-- prioridad_manual NULL = vale la que propone el sistema (se calcula en la app).
CREATE TABLE IF NOT EXISTS libros_tareas (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id              UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  libro_id                UUID NOT NULL REFERENCES libros(id) ON DELETE CASCADE,
  origen                  TEXT NOT NULL DEFAULT 'manual'
                            CHECK (origen IN ('puesta_al_dia','balance','pedido','asamblea','manual')),
  balance_id              UUID REFERENCES balances(id) ON DELETE SET NULL,
  pedido_id               UUID REFERENCES libros_pedidos(id) ON DELETE SET NULL,
  periodo_desde           DATE,
  periodo_hasta           DATE,
  estado_id               UUID NOT NULL REFERENCES libros_estados(id),
  fecha_limite            DATE,                      -- la pide un tercero (banco, IGJ, trámite)
  material_listo          BOOLEAN NOT NULL DEFAULT FALSE,
  prioridad_manual        TEXT CHECK (prioridad_manual IN ('P1','P2','P3')),
  prioridad_motivo        TEXT,
  prioridad_cambiada_por  UUID REFERENCES liquidadoras(id) ON DELETE SET NULL,
  prioridad_cambiada_en   TIMESTAMPTZ,
  orden_manual            INTEGER NOT NULL DEFAULT 0,
  insistencias            INTEGER NOT NULL DEFAULT 0 CHECK (insistencias >= 0),
  responsable_id          UUID REFERENCES liquidadoras(id) ON DELETE SET NULL,
  fecha_envio_copiar      DATE,
  fecha_retiro            DATE,
  fecha_fin               DATE,
  folios_usados           INTEGER CHECK (folios_usados >= 0),
  requiere_reformateo     BOOLEAN NOT NULL DEFAULT FALSE,
  observaciones           TEXT,
  creado_por              UUID REFERENCES liquidadoras(id) ON DELETE SET NULL,
  creado_en               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (prioridad_manual IS NULL OR prioridad_motivo IS NOT NULL)
);
ALTER TABLE libros_tareas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS libros_tareas_cliente_idx ON libros_tareas (cliente_id);
CREATE INDEX IF NOT EXISTS libros_tareas_libro_idx ON libros_tareas (libro_id);
-- El mismo balance no genera dos veces la tarea de un libro (etapa 5).
CREATE UNIQUE INDEX IF NOT EXISTS libros_tareas_libro_balance_idx
  ON libros_tareas (libro_id, balance_id) WHERE balance_id IS NOT NULL;
