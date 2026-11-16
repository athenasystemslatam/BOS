-- Historial de "cuántas filas tiene cada tabla" semana a semana, para que
-- el cron de chequeo-crecimiento pueda comparar y avisar si algo creció o
-- cayó de forma rara (ver src/app/api/cron/chequeo-crecimiento/route.ts).
-- Es solo un log que se va acumulando — nunca se actualiza ni se borra una
-- fila existente, cada corrida agrega una fila nueva por tabla.
create table if not exists monitoreo_crecimiento (
  id bigserial primary key,
  tabla text not null,
  filas integer not null,
  creado_en timestamptz not null default now()
);

create index if not exists monitoreo_crecimiento_tabla_fecha_idx
  on monitoreo_crecimiento (tabla, creado_en desc);

-- Solo la toca el cron con la clave de servicio (bypassea RLS igual) — se
-- activa sin políticas para que quede bloqueada para cualquier otro acceso.
alter table monitoreo_crecimiento enable row level security;
