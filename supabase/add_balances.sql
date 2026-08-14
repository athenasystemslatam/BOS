-- BOS · Módulo Contable — tabla de balances anuales
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS balances (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id         uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  anio_fiscal        int         NOT NULL,
  fecha_cierre       date        NOT NULL,

  -- Responsables (puede haber hasta 2)
  responsable_id     uuid        REFERENCES equipo(id),
  responsable2_id    uuid        REFERENCES equipo(id),

  -- Estado general del balance
  estado             text        NOT NULL DEFAULT 'sin_asignar'
                                 CHECK (estado IN ('sin_asignar','asignado','en_proceso','finalizado','frenado')),
  avance             int         NOT NULL DEFAULT 0,

  -- Pedido de información al cliente (3 envíos + recibido)
  envio1             boolean     NOT NULL DEFAULT false,
  envio1_fecha       date,
  envio2             boolean     NOT NULL DEFAULT false,
  envio2_fecha       date,
  envio3             boolean     NOT NULL DEFAULT false,
  envio3_fecha       date,
  info_recibida      boolean     NOT NULL DEFAULT false,

  -- EECC / Legalización
  -- VTO Balance = fecha_cierre + 135 días (calculado en app)
  estado_eecc        text        NOT NULL DEFAULT 'pendiente'
                                 CHECK (estado_eecc IN ('pendiente','en_proceso','legalizado','presentado_arca')),

  -- Formularios
  -- 855/F899 VTO = VTO Balance + 25 días (calculado en app)
  f855_estado        text        NOT NULL DEFAULT 'pendiente'
                                 CHECK (f855_estado IN ('pendiente','presentado')),
  f899_estado        text        NOT NULL DEFAULT 'pendiente'
                                 CHECK (f899_estado IN ('pendiente','presentado')),
  f713_estado        text        NOT NULL DEFAULT 'pendiente'
                                 CHECK (f713_estado IN ('pendiente','presentado')),
  f657_estado        text        NOT NULL DEFAULT 'pendiente'
                                 CHECK (f657_estado IN ('pendiente','presentado','no_corresponde')),
  igj_presentacion   text        NOT NULL DEFAULT 'pendiente'
                                 CHECK (igj_presentacion IN ('pendiente','presentado','no_corresponde')),
  igj_tasa           text        NOT NULL DEFAULT 'pendiente'
                                 CHECK (igj_tasa IN ('pendiente','enviada','no_corresponde')),

  observaciones      text,
  updated_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (cliente_id, anio_fiscal)
);
