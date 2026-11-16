-- BOS · Módulo Monotributo — etapa 1 (16-nov-2026)
-- Extiende monotributo_tareas (no se crea otra tabla por mes) y agrega:
--   monotributo_clientes   datos fijos del cliente (forma de pago, envío, contacto propio)
--   monotributo_revisiones cola "A revisar" (marcas rojo/amarillo, nada se borra)
--   monotributo_eventos    historial de cambios de estado del mes
-- Lo único no aditivo: se amplía el CHECK de cuota_estado (los valores
-- 'pendiente'/'pagado' ya cargados siguen siendo válidos, no se migran datos).
-- ANTES DE CORRER: Backup desde Monotributo → Dashboard.
-- Ejecutar en Supabase SQL Editor.

BEGIN;

-- ── 1. monotributo_tareas: estado del mes con la lista completa ─────────────
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'monotributo_tareas'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%cuota_estado%'
  LOOP
    EXECUTE format('ALTER TABLE monotributo_tareas DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE monotributo_tareas
  ADD CONSTRAINT monotributo_tareas_cuota_estado_check
  CHECK (cuota_estado IN ('pendiente', 'vep_generado', 'en_borrador', 'enviado', 'avisado', 'pagado', 'no_pago'));

ALTER TABLE monotributo_tareas
  ADD COLUMN IF NOT EXISTS estado_cambiado_en   timestamptz,
  ADD COLUMN IF NOT EXISTS estado_cambiado_por  uuid REFERENCES liquidadoras(id),
  ADD COLUMN IF NOT EXISTS canal                text CHECK (canal IN ('mail', 'whatsapp', 'otro')),
  ADD COLUMN IF NOT EXISTS origen               text NOT NULL DEFAULT 'manual'
                                                CHECK (origen IN ('manual', 'importado', 'automatico')),
  -- VEP / QR del mes (etapa 5: se leen del PDF del Drive)
  ADD COLUMN IF NOT EXISTS vep_drive_file_id    text,
  ADD COLUMN IF NOT EXISTS vep_importe          numeric,
  ADD COLUMN IF NOT EXISTS vep_vencimiento      date,
  -- Deuda (se suma a deuda_monto / deuda_aviso / deuda_aviso_fecha, que ya existían).
  -- 'sin_verificar' = la planilla no dice nada: NO es lo mismo que "no debe".
  ADD COLUMN IF NOT EXISTS deuda_estado         text NOT NULL DEFAULT 'sin_verificar'
                                                CHECK (deuda_estado IN ('sin_verificar', 'no', 'si')),
  ADD COLUMN IF NOT EXISTS deuda_periodos       text,
  ADD COLUMN IF NOT EXISTS deuda_texto_original text,
  ADD COLUMN IF NOT EXISTS deuda_resuelta       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deuda_resuelta_fecha date,
  -- Intimación
  ADD COLUMN IF NOT EXISTS intimacion_estado    text CHECK (intimacion_estado IN ('no', 'fijarse', 'avisado', 'si', 'pago')),
  ADD COLUMN IF NOT EXISTS intimacion_fecha     date;

-- ── 2. monotributo_clientes: datos fijos (no dependen del mes) ──────────────
-- El responsable NO va acá: sigue saliendo de servicios_cliente('monotributo').
-- El contacto es propio del módulo: no se toca clientes.emails_contacto.
CREATE TABLE IF NOT EXISTS monotributo_clientes (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id            uuid        NOT NULL UNIQUE REFERENCES clientes(id) ON DELETE CASCADE,
  forma_pago            text        CHECK (forma_pago IN (
                                      'qr', 'pmc', 'debito_automatico', 'tarjeta_credito',
                                      'paga_por_su_cuenta', 'red_link', 'interbanking', 'reafectar_saldo')),
  -- Paga desde la cuenta de otro (ej. Prieto Graciela desde la de Mario Sirolli)
  paga_desde_cliente_id uuid        REFERENCES clientes(id) ON DELETE SET NULL,
  paga_desde_texto      text,
  -- Avisar y enviar NO son excluyentes (QR/PMC con AVISAR: se avisa y se envía)
  avisa                 boolean     NOT NULL DEFAULT false,
  envia_vep             boolean     NOT NULL DEFAULT false,
  medio                 text        CHECK (medio IN ('mail', 'whatsapp')),
  destinatario          text,
  mails                 text[]      NOT NULL DEFAULT '{}',
  whatsapp              text,
  empresa_grupo         text,
  saldo_a_favor         numeric,
  -- Texto tal cual de la planilla (AVISADO / NO AVISAR / NO), sin lógica.
  resolucion_arba       text,
  alta_por_importacion  boolean     NOT NULL DEFAULT false,
  observaciones         text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_por           uuid        REFERENCES liquidadoras(id)
);
ALTER TABLE monotributo_clientes ENABLE ROW LEVEL SECURITY;

-- ── 3. monotributo_revisiones: cola "A revisar" ─────────────────────────────
CREATE TABLE IF NOT EXISTS monotributo_revisiones (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id       uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  -- Solo para marcas de un mes puntual (ej. "verificar pago"); null = del cliente.
  anio             int,
  mes              int         CHECK (mes BETWEEN 1 AND 12),
  campo            text        NOT NULL CHECK (campo IN (
                                 'responsable', 'forma_pago', 'medio_contacto', 'cuit',
                                 'estado', 'deuda', 'pago', 'alta')),
  motivo           text        NOT NULL,
  gravedad         text        NOT NULL CHECK (gravedad IN ('rojo', 'amarillo')),
  estado           text        NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'resuelta')),
  origen           text        NOT NULL CHECK (origen IN ('importacion', 'regla_automatica')),
  detectada_at     timestamptz NOT NULL DEFAULT now(),
  resuelta_por     uuid        REFERENCES liquidadoras(id),
  resuelta_at      timestamptz,
  resolucion       text        CHECK (resolucion IN ('corregido', 'confirmado')),
  nota             text,
  -- Con "Está bien así": el valor que se confirmó. La regla no vuelve a
  -- marcar ese cliente y campo mientras el valor siga siendo este.
  valor_confirmado text
);
ALTER TABLE monotributo_revisiones ENABLE ROW LEVEL SECURITY;

-- Una sola marca pendiente por cliente + campo (+ mes, si es de un mes)
CREATE UNIQUE INDEX IF NOT EXISTS monotributo_revisiones_pendiente_uq
  ON monotributo_revisiones (cliente_id, campo, coalesce(anio, 0), coalesce(mes, 0))
  WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS monotributo_revisiones_cliente_idx
  ON monotributo_revisiones (cliente_id);

-- ── 4. monotributo_eventos: historial de estados del mes ────────────────────
CREATE TABLE IF NOT EXISTS monotributo_eventos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      uuid        NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  anio            int         NOT NULL,
  mes             int         NOT NULL CHECK (mes BETWEEN 1 AND 12),
  estado_anterior text,
  estado_nuevo    text        NOT NULL,
  canal           text,
  origen          text        NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'importado', 'automatico')),
  nota            text,
  creado_por      uuid        REFERENCES liquidadoras(id),
  creado_en       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE monotributo_eventos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS monotributo_eventos_cliente_idx
  ON monotributo_eventos (cliente_id, anio, mes);

COMMIT;

-- Verificación sugerida:
-- SELECT cuota_estado, count(*) FROM monotributo_tareas GROUP BY 1;   -- mismos números que antes
-- SELECT count(*) FROM monotributo_clientes;                           -- 0
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'monotributo_tareas_cuota_estado_check';
