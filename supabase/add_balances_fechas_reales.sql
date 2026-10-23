-- Ítem 124: add_balances_fechas_automaticas.sql (20-oct-2026) cargó como
-- presentado_fecha / f855_fecha de lo ya presentado la última modificación
-- del registro (no había otra). Esas fechas no sirven para medir "en término":
-- esta marca separa las reales (registradas por BOS o cargadas a mano) de
-- las aproximadas. Solo se marcan como reales las registradas desde el 21-oct.
alter table balances add column if not exists presentado_fecha_real boolean not null default false;
alter table balances add column if not exists f855_fecha_real boolean not null default false;

update balances set presentado_fecha_real = true
where presentado_fecha >= '2026-10-21' and presentado_fecha_real = false;

update balances set f855_fecha_real = true
where f855_fecha >= '2026-10-21' and f855_fecha_real = false;
