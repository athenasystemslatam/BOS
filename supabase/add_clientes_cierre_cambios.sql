-- Ítem 109: cambiar la fecha de cierre fija de un cliente es una excepción.
-- Cada cambio queda registrado con motivo (lo valida Panel General → Editar).
create table if not exists clientes_cierre_cambios (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references clientes(id) on delete cascade,
  mes_anterior  int,
  dia_anterior  int,
  mes_nuevo     int,
  dia_nuevo     int,
  motivo        text not null check (length(trim(motivo)) > 0),
  creado_en     timestamptz not null default now(),
  creado_por    uuid references liquidadoras(id)
);
create index if not exists idx_clientes_cierre_cambios on clientes_cierre_cambios(cliente_id, creado_en desc);
alter table clientes_cierre_cambios enable row level security;
