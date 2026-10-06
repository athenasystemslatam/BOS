-- Registra cuándo se dio de baja un servicio (distinto de una transferencia
-- de responsable, que no toca `estado`) — ver darDeBajaServicio en
-- panel-general/actions.ts y el mail de baja en src/lib/email.ts.
ALTER TABLE servicios_cliente ADD COLUMN IF NOT EXISTS fecha_baja TIMESTAMPTZ;
