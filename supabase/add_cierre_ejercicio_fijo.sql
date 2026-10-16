-- Fecha de cierre de ejercicio fija por cliente (Contable) — se usa para
-- autocompletar `fecha_cierre` al crear el balance de cada año nuevo, en
-- vez de tener que volver a tipearla a mano todos los años. Ver
-- NuevoBalanceModal.tsx / crearBalance en contable/actions.ts.
alter table clientes add column if not exists cierre_ejercicio_mes int check (cierre_ejercicio_mes between 1 and 12);
alter table clientes add column if not exists cierre_ejercicio_dia int check (cierre_ejercicio_dia between 1 and 31);

-- Backfill: para clientes que ya tienen balances cargados, toma el cierre
-- del balance más reciente de cada uno como su fecha fija.
with ultimo_balance as (
  select distinct on (cliente_id)
    cliente_id,
    extract(month from fecha_cierre)::int as mes,
    extract(day from fecha_cierre)::int as dia
  from balances
  order by cliente_id, anio_fiscal desc
)
update clientes c
set cierre_ejercicio_mes = ultimo_balance.mes,
    cierre_ejercicio_dia = ultimo_balance.dia
from ultimo_balance
where c.id = ultimo_balance.cliente_id
  and c.cierre_ejercicio_mes is null;
