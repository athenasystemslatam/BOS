-- Función para que el "Backup completo del sistema" (/api/backup/completo)
-- pueda enumerar todas las tablas reales de la base en el momento, en vez de
-- depender de una lista fija en el código que se puede desactualizar si se
-- renombra o borra una tabla (ya pasó una vez con "equipo" → "liquidadoras").
--
-- Ejecutar en: Supabase Dashboard → SQL Editor.

create or replace function public.listar_tablas_backup()
returns table (tablename text)
language sql
stable
security definer
set search_path = public
as $$
  select t.tablename::text
  from pg_tables t
  where t.schemaname = 'public'
  order by t.tablename;
$$;
