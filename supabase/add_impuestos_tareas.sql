-- BOS · Módulo Impuestos — seguimiento mensual por subtipo
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS impuestos_tareas (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id         uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  subtipo            text        NOT NULL CHECK (subtipo IN ('iva', 'iibb', 'seh')),
  anio               int         NOT NULL,
  mes                int         NOT NULL CHECK (mes BETWEEN 1 AND 12),
  -- Declaración
  estado             text        NOT NULL DEFAULT 'pendiente'
                                 CHECK (estado IN ('pendiente', 'presentado')),
  fecha_presentacion date,
  -- Pago / VEP
  pago_estado        text        NOT NULL DEFAULT 'pendiente'
                                 CHECK (pago_estado IN ('pendiente','pago','saldo_a_favor','enviado','diferido','boleta')),
  observaciones      text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cliente_id, subtipo, anio, mes)
);
