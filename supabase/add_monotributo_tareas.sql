-- BOS · Módulo Monotributo — tabla de seguimiento mensual
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS monotributo_tareas (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id         uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  anio               int         NOT NULL,
  mes                int         NOT NULL CHECK (mes BETWEEN 1 AND 12),

  -- Cuota mensual
  cuota_estado       text        NOT NULL DEFAULT 'pendiente'
                                 CHECK (cuota_estado IN ('pendiente', 'pagado')),
  cuota_fecha        date,

  -- Recategorización cuatrimestral (ene, may, sep)
  recategorizacion   text        NOT NULL DEFAULT 'no_corresponde'
                                 CHECK (recategorizacion IN ('no_corresponde', 'pendiente', 'realizada')),

  -- Categoría vigente del monotributista
  categoria          text        CHECK (categoria IN ('A','B','C','D','E','F','G','H','I','J','K')),

  observaciones      text,
  updated_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (cliente_id, anio, mes)
);
