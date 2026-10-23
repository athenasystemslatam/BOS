-- Ítem 91: reglas de vencimiento de Contable en 3 niveles. El nivel 1
-- (regla general) vive en objetivos_area.config.reglas_vto, sin SQL.

-- Nivel 2: prórroga por período — "[tipo] de cierres entre X e Y vence el Z".
create table if not exists contable_vto_prorrogas (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('balance', 'ganancias', 'f855', 'f899', 'f657')),
  cierre_desde  date not null,
  cierre_hasta  date not null,
  fecha         date not null,
  motivo        text not null check (length(trim(motivo)) > 0),
  creado_en     timestamptz not null default now(),
  creado_por    uuid references liquidadoras(id),
  check (cierre_desde <= cierre_hasta)
);
alter table contable_vto_prorrogas enable row level security;

-- Nivel 3: fecha manual de un balance, con motivo obligatorio.
create table if not exists contable_vto_manual (
  id          uuid primary key default gen_random_uuid(),
  balance_id  uuid not null references balances(id) on delete cascade,
  tipo        text not null check (tipo in ('balance', 'ganancias', 'f855', 'f899', 'f657')),
  fecha       date not null,
  motivo      text not null check (length(trim(motivo)) > 0),
  creado_en   timestamptz not null default now(),
  creado_por  uuid references liquidadoras(id),
  unique (balance_id, tipo)
);
alter table contable_vto_manual enable row level security;

-- balances.vto_ganancias (add_balances_vto_ganancias.sql, 23-oct) queda sin
-- uso: lo que se haya cargado ahí pasa a fecha manual y se vacía la columna.
insert into contable_vto_manual (balance_id, tipo, fecha, motivo)
select id, 'ganancias', vto_ganancias, 'Cargado antes del cambio (23-oct)'
from balances
where vto_ganancias is not null
on conflict (balance_id, tipo) do nothing;

update balances set vto_ganancias = null where vto_ganancias is not null;
