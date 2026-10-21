-- Ítem 97: Seguimiento Sueldos — "Preliquidado – esperando novedades" y
-- "Novedades recibidas", por cliente y período, con fecha y hora
-- automática (igual que f931_manual_en/recibos_manual_en). Sirve de base
-- para el ítem 69 (mueve el objetivo de Recibos, nunca el de F.931) y el
-- ítem 72 (métrica de cuántos recibos se resolvieron con esta marca).
alter table tareas
  add column if not exists preliquidado boolean not null default false,
  add column if not exists preliquidado_fecha timestamptz,
  add column if not exists novedades_recibidas boolean not null default false,
  add column if not exists novedades_recibidas_fecha timestamptz;
