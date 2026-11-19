-- Historial de tamaño de cada backup generado (manual o automático), para
-- poder mostrarle al admin una barra de estado en Equipo y avisar por mail
-- si algún backup se está acercando al límite real del sistema: Vercel no
-- deja que una función devuelva más de 4.5 MB por respuesta (ver
-- BACKUP_LIMITE_BYTES en src/lib/backups.ts).
-- Ejecutar en: Supabase Dashboard → SQL Editor, todo junto de una.

create table if not exists backup_historial (
  id           bigserial primary key,
  tipo         text        not null check (tipo in ('manual', 'automatico')),
  modulo       text        not null,
  tamanio_bytes bigint     not null,
  creado_en    timestamptz not null default now()
);

create index if not exists backup_historial_modulo_fecha_idx
  on backup_historial (modulo, creado_en desc);

-- Solo lo toca el servidor con la clave de servicio (bypassea RLS igual) —
-- se activa sin políticas para que quede bloqueada para cualquier otro
-- acceso (igual que monitoreo_crecimiento).
alter table backup_historial enable row level security;
