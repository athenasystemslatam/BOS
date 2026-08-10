-- Lista de bloqueo por email para el modo "consulta" (usuarios sin fila en
-- liquidadoras, que entran solo por dominio @kmaconsultores.com.ar).
-- Se chequea en cada request (middleware.ts) además del chequeo de dominio.
-- No reemplaza a `liquidadoras.activa`: esa columna sigue siendo la baja de
-- liquidadoras/admins con fila propia.

create table if not exists accesos_bloqueados (
  email text primary key,
  motivo text,
  bloqueado_por text,
  bloqueado_en timestamptz not null default now()
);
