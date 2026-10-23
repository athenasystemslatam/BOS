-- Vencimiento de Ganancias como fecha propia del balance.
-- NULL = regla general (mismo día que el VTO balance, cierre + 135 días).
-- Con fecha = prórroga (ARCA prorrogó Ganancias y no coincide con el balance).
alter table balances add column if not exists vto_ganancias date;
