-- ============================================================
-- BOS · Módulo Libros Societarios — Etapa 1
-- Datos societarios por cliente, catálogo de libros por tipo y
-- padrón de tomos reales. Las tablas de tareas, pedidos,
-- movimientos y facturas de copiadora van en las etapas 2–4.
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- 1. CLIENTES_SOCIETARIO — 1 a 1 con clientes
CREATE TABLE IF NOT EXISTS clientes_societario (
  cliente_id           UUID PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,
  tipo_societario      TEXT CHECK (tipo_societario IN
                         ('SA','SRL','SAS','FUNDACION','ASOCIACION','SOCIEDAD_SIMPLE','SOCIEDAD_DE_HECHO')),
  organismo            TEXT CHECK (organismo IN ('IGJ','DPPJ','OTRO')),
  nro_inscripcion      TEXT,
  libros_digitales     BOOLEAN NOT NULL DEFAULT FALSE,
  contacto_libros      TEXT,
  mandato_designacion  DATE,
  mandato_anios        INTEGER CHECK (mandato_anios > 0),  -- NULL = indeterminado
  observaciones        TEXT,
  actualizado_por      UUID REFERENCES liquidadoras(id) ON DELETE SET NULL,
  actualizado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE clientes_societario ENABLE ROW LEVEL SECURITY;

-- 2. LIBROS_CATALOGO — qué libros corresponden a cada tipo societario
-- periodicidad: 'balance' = se copia una vez por año con el balance;
-- 'trimestral' = reuniones de directorio/administración;
-- 'evento' = se escribe cuando pasa algo (sin atraso calculable).
-- Las actas extra de un libro 'balance' (ej. una reunión fuera del
-- balance) se cargan como evento; no cambian esta periodicidad.
CREATE TABLE IF NOT EXISTS libros_catalogo (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_societario      TEXT NOT NULL CHECK (tipo_societario IN
                         ('SA','SRL','SAS','FUNDACION','ASOCIACION','SOCIEDAD_SIMPLE','SOCIEDAD_DE_HECHO')),
  codigo               TEXT NOT NULL,
  nombre               TEXT NOT NULL,
  orden                INTEGER NOT NULL DEFAULT 0,
  dispara_con_balance  BOOLEAN NOT NULL DEFAULT FALSE,
  periodicidad         TEXT NOT NULL DEFAULT 'evento'
                         CHECK (periodicidad IN ('balance','trimestral','evento')),
  activo               BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tipo_societario, codigo)
);
ALTER TABLE libros_catalogo ENABLE ROW LEVEL SECURITY;

INSERT INTO libros_catalogo (tipo_societario, codigo, nombre, orden, dispara_con_balance, periodicidad) VALUES
  -- SA
  ('SA','actas_directorio',      'Actas de Directorio',          10, TRUE,  'trimestral'),
  ('SA','actas_asamblea',        'Actas de Asamblea',            20, TRUE,  'balance'),
  ('SA','registro_acciones',     'Registro de Acciones',         30, FALSE, 'evento'),
  ('SA','deposito_acciones_aaa', 'Depósito de Acciones y AAA',   40, TRUE,  'evento'),
  ('SA','inventario_balance',    'Inventario y Balance',         50, TRUE,  'balance'),
  ('SA','diario',                'Diario',                       60, TRUE,  'balance'),
  ('SA','iva_ventas',            'IVA Ventas',                   70, TRUE,  'balance'),
  ('SA','iva_compras',           'IVA Compras',                  80, TRUE,  'balance'),
  -- SRL
  ('SRL','libro_actas',          'Libro de Actas',               10, TRUE,  'balance'),
  ('SRL','inventario_balance',   'Inventario y Balance',         50, TRUE,  'balance'),
  ('SRL','diario',               'Diario',                       60, TRUE,  'balance'),
  ('SRL','iva_ventas',           'IVA Ventas',                   70, TRUE,  'balance'),
  ('SRL','iva_compras',          'IVA Compras',                  80, TRUE,  'balance'),
  -- SAS
  ('SAS','consejo_administracion','Consejo de Administración',   10, TRUE,  'balance'),
  ('SAS','libro_actas',          'Libro de Actas',               20, TRUE,  'balance'),
  ('SAS','libro_acciones',       'Libro de Acciones',            30, FALSE, 'evento'),
  ('SAS','asistencia_asamblea',  'Asistencia a Asamblea',        40, TRUE,  'evento'),
  ('SAS','inventario_balance',   'Inventario y Balance',         50, TRUE,  'balance'),
  ('SAS','diario',               'Diario',                       60, TRUE,  'balance'),
  ('SAS','iva_ventas',           'IVA Ventas',                   70, TRUE,  'balance'),
  ('SAS','iva_compras',          'IVA Compras',                  80, TRUE,  'balance'),
  -- FUNDACION
  ('FUNDACION','consejo_directivo','Consejo Directivo',          10, TRUE,  'balance'),
  ('FUNDACION','inventario_balance','Inventario y Balance',      50, TRUE,  'balance'),
  ('FUNDACION','diario',         'Diario',                       60, TRUE,  'balance'),
  ('FUNDACION','iva_ventas',     'IVA Ventas',                   70, TRUE,  'balance'),
  ('FUNDACION','iva_compras',    'IVA Compras',                  80, TRUE,  'balance'),
  ('FUNDACION','subdiario_caja_bancos','Subdiario Caja y Bancos',90, TRUE,  'balance'),
  -- ASOCIACION
  ('ASOCIACION','libro_actas',   'Libro de Actas',               10, TRUE,  'balance'),
  ('ASOCIACION','registro_asociados','Registro de Asociados',    20, FALSE, 'evento'),
  ('ASOCIACION','inventario_balance','Inventario y Balance',     50, TRUE,  'balance'),
  ('ASOCIACION','diario',        'Diario',                       60, TRUE,  'balance'),
  ('ASOCIACION','iva_ventas',    'IVA Ventas',                   70, TRUE,  'balance'),
  ('ASOCIACION','iva_compras',   'IVA Compras',                  80, TRUE,  'balance'),
  -- SOCIEDAD SIMPLE
  ('SOCIEDAD_SIMPLE','libro_actas','Libro de Actas',             10, TRUE,  'balance'),
  ('SOCIEDAD_SIMPLE','inventario_balance','Inventario y Balance',50, TRUE,  'balance'),
  ('SOCIEDAD_SIMPLE','diario',   'Diario',                       60, TRUE,  'balance'),
  ('SOCIEDAD_SIMPLE','iva_ventas','IVA Ventas',                  70, TRUE,  'balance'),
  ('SOCIEDAD_SIMPLE','iva_compras','IVA Compras',                80, TRUE,  'balance'),
  -- SOCIEDAD DE HECHO
  ('SOCIEDAD_DE_HECHO','libro_actas','Libro de Actas',           10, TRUE,  'balance'),
  ('SOCIEDAD_DE_HECHO','inventario_balance','Inventario y Balance',50, TRUE, 'balance'),
  ('SOCIEDAD_DE_HECHO','diario', 'Diario',                       60, TRUE,  'balance'),
  ('SOCIEDAD_DE_HECHO','iva_ventas','IVA Ventas',                70, TRUE,  'balance'),
  ('SOCIEDAD_DE_HECHO','iva_compras','IVA Compras',              80, TRUE,  'balance')
ON CONFLICT (tipo_societario, codigo) DO NOTHING;

-- 3. LIBROS — un registro por tomo real del cliente
CREATE TABLE IF NOT EXISTS libros (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id              UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  catalogo_id             UUID NOT NULL REFERENCES libros_catalogo(id),
  tomo                    INTEGER NOT NULL DEFAULT 1 CHECK (tomo > 0),
  soporte                 TEXT NOT NULL DEFAULT 'fisico' CHECK (soporte IN ('fisico','digital')),
  estado                  TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','cerrado','sin_libro')),
  rubrica_nro             TEXT,
  rubrica_fecha           DATE,
  folios_totales          INTEGER CHECK (folios_totales > 0),
  folios_usados           INTEGER NOT NULL DEFAULT 0 CHECK (folios_usados >= 0),
  ultimo_periodo_copiado  DATE,
  -- NULL = vale la periodicidad del catálogo. Se completa cuando el estatuto
  -- del cliente pide otra frecuencia (ej. SAS con reuniones trimestrales).
  periodicidad            TEXT CHECK (periodicidad IN ('balance','trimestral','evento')),
  ubicacion               TEXT NOT NULL DEFAULT 'estudio'
                            CHECK (ubicacion IN ('estudio','cliente','copiadora','otro')),
  ubicacion_detalle       TEXT,
  observaciones           TEXT,
  creado_en               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actualizado_en          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cliente_id, catalogo_id, tomo),
  CHECK (folios_totales IS NULL OR folios_usados <= folios_totales)
);
ALTER TABLE libros ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS libros_cliente_idx ON libros (cliente_id);
-- Un solo tomo en uso por libro y cliente: el resto queda como 'cerrado'.
CREATE UNIQUE INDEX IF NOT EXISTS libros_un_activo_idx
  ON libros (cliente_id, catalogo_id) WHERE estado = 'activo';
