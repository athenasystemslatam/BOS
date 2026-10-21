-- Ítem 67: configuración de objetivos por área + excepción por cliente,
-- en vez de constantes fijas en el código (hoy DIAS_VTO_BALANCE=135 /
-- DIAS_VTO_F855=160 en src/app/(dashboard)/contable/semaforo.ts).
--
-- Sueldos NO usa la tabla de excepción por cliente — ahí la excepción es
-- la marca "Preliquidado – esperando novedades" por período (ítem 97), no
-- algo fijo en la ficha del cliente.

create table if not exists objetivos_area (
  area        text primary key,  -- 'sueldos' | 'contable'
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references liquidadoras(id)
);
alter table objetivos_area enable row level security;

create table if not exists objetivos_excepcion_cliente (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references clientes(id) on delete cascade,
  area        text not null,
  config      jsonb not null default '{}'::jsonb,
  creado_en   timestamptz not null default now(),
  creado_por  uuid references liquidadoras(id),
  unique (cliente_id, area)
);
create index if not exists idx_objetivos_excepcion_cliente on objetivos_excepcion_cliente(cliente_id, area);
alter table objetivos_excepcion_cliente enable row level security;

-- Ítem 70 — "para Mati: cargar en el ítem 67 el piso legal como objetivo
-- inicial de Contable". Es justo el piso que ya estaba hardcodeado.
-- Los objetivos internos (días para pedir info; días recepción->legalizado)
-- quedan en null a propósito: los define dirección después de medir el
-- ciclo de cierres al 31/12/2026 (vencimiento 15/05/2027).
insert into objetivos_area (area, config) values (
  'contable',
  '{
     "balance_dias_vto": 135,
     "f855_dias_vto_extra": 25,
     "dias_pedir_info_desde_cierre": null,
     "dias_recepcion_a_legalizado": null
   }'::jsonb
)
on conflict (area) do nothing;

-- Ítem 69 — objetivo general de Sueldos, definido por dirección el
-- 20/10/2026. Se guarda acá aunque todavía no haya pantalla que lo
-- consuma (eso es el siguiente paso), para no perder estos valores.
insert into objetivos_area (area, config) values (
  'sueldos',
  '{
     "f931_dias_habiles_antes_vencimiento": 3,
     "recibos_dias_antes_fin_mes": 2,
     "recibos_limite_dia_habil_mes_siguiente": 3
   }'::jsonb
)
on conflict (area) do nothing;
