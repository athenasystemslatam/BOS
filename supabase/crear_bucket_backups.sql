-- Bucket privado para guardar una copia de cada backup semanal automático
-- (además de mandarlo por mail). Solo lo lee/escribe el service role desde
-- el cron (src/app/api/cron/backup-semanal/route.ts), que ya bypassea RLS,
-- así que no hace falta ninguna policy en storage.objects.
insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;
