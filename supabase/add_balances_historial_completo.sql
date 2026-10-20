-- Completa el registro de "fecha y hora de cada cambio de estado y etapa"
-- que pedía la nota del 2026-10-20 (bloqueante real del ítem 47, va de la
-- mano del ítem 34). add_balances_fechas_automaticas.sql ya había agregado
-- legalizado_fecha/presentado_fecha/frenado_desde/f855_fecha — esto agrega
-- lo que faltaba.

-- 1) Fechas que faltaban: Asignado, y las dos etapas intermedias del
--    avance (ítem 29) que todavía no tenían fecha propia.
alter table balances
  add column if not exists asignado_fecha timestamptz,
  add column if not exists en_proceso_fecha timestamptz,
  add column if not exists pendiente_pago_fecha timestamptz;

-- 2) Pedido y Recepción de información pasan de "fecha" a "fecha y hora",
--    igual que F.931/recibos en Sueldos. Los valores ya cargados quedan
--    con hora 00:00 — no hay forma de recuperar la hora real retroactiva.
alter table balances alter column envio1_fecha type timestamptz using envio1_fecha::timestamptz;
alter table balances alter column info_recibida_fecha type timestamptz using info_recibida_fecha::timestamptz;

-- 3) Historial real de Frenado/Destrabado. A diferencia de los demás
--    hitos (que pasan una sola vez), un balance se puede frenar y
--    destrabar varias veces — frenado_desde solo guarda el arranque del
--    freno actual, nunca quedaba registro de cuándo terminaba ni de
--    freno anteriores. "hasta" null = todavía frenado.
create table if not exists balance_frenados (
  id          uuid        primary key default gen_random_uuid(),
  balance_id  uuid        not null references balances(id) on delete cascade,
  desde       timestamptz not null,
  hasta       timestamptz,
  creado_en   timestamptz not null default now()
);
create index if not exists idx_balance_frenados_balance_id on balance_frenados(balance_id);
-- Sin políticas: la app solo la consulta con la clave de servicio (que
-- ignora RLS), así que esto deja afuera cualquier acceso directo con la
-- clave anónima/autenticada, sin costo para el funcionamiento normal.
alter table balance_frenados enable row level security;

-- 4) Backfill — balances que ya están frenados hoy: abrimos su ciclo en
--    el historial usando frenado_desde (o updated_at si no lo tiene).
insert into balance_frenados (balance_id, desde)
select b.id, coalesce(b.frenado_desde, b.updated_at)
from balances b
where b.estado = 'frenado'
  and not exists (
    select 1 from balance_frenados bf where bf.balance_id = b.id and bf.hasta is null
  );

-- 5) Backfill — fecha de Asignado para los que ya tienen responsable hoy
--    y todavía no tenían nada guardado (mejor aproximación disponible).
update balances
set asignado_fecha = updated_at
where (responsable_id is not null or responsable2_id is not null)
  and asignado_fecha is null;
