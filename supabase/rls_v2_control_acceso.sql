-- ============================================================
-- RLS v2 — Control de acceso por rol / liquidadora
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- Reemplaza las políticas "todo autenticado" por políticas reales:
--   - admin (liquidadoras.rol = 'admin'): acceso total
--   - liquidadora: lectura total de clientes, pero solo puede
--     modificar el seguimiento (tareas) de las empresas que tiene
--     asignadas (clientes.liquidador_id)
-- Idempotente: se puede correr más de una vez sin problema.
-- ============================================================

-- 1. Funciones helper ------------------------------------------------------

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from liquidadoras
    where user_id = auth.uid() and rol = 'admin' and activa = true
  )
$$;

create or replace function current_liquidadora_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from liquidadoras where user_id = auth.uid() and activa = true
$$;

-- 2. Limpiar políticas viejas ------------------------------------------------

drop policy if exists "Acceso total para autenticados" on liquidadoras;
drop policy if exists "Acceso total para autenticados" on clientes;
drop policy if exists "Acceso total para autenticados" on periodos;
drop policy if exists "Acceso total para autenticados" on tareas;
drop policy if exists "Acceso total para autenticados" on historial_asignaciones;
drop policy if exists "Acceso total para autenticados" on drive_log;

drop policy if exists "liquidadoras_select" on liquidadoras;
drop policy if exists "liquidadoras_write_admin" on liquidadoras;
drop policy if exists "clientes_select" on clientes;
drop policy if exists "clientes_insert" on clientes;
drop policy if exists "clientes_update_admin" on clientes;
drop policy if exists "clientes_delete_admin" on clientes;
drop policy if exists "periodos_select" on periodos;
drop policy if exists "periodos_insert" on periodos;
drop policy if exists "periodos_update" on periodos;
drop policy if exists "tareas_select" on tareas;
drop policy if exists "tareas_insert" on tareas;
drop policy if exists "tareas_update" on tareas;
drop policy if exists "tareas_delete_admin" on tareas;
drop policy if exists "historial_admin" on historial_asignaciones;
drop policy if exists "drive_log_select" on drive_log;
drop policy if exists "drive_log_insert" on drive_log;

-- 3. liquidadoras ------------------------------------------------------------

create policy "liquidadoras_select" on liquidadoras
  for select to authenticated using (true);

create policy "liquidadoras_write_admin" on liquidadoras
  for insert to authenticated with check (is_admin());

create policy "liquidadoras_update_admin" on liquidadoras
  for update to authenticated using (is_admin()) with check (is_admin());

create policy "liquidadoras_delete_admin" on liquidadoras
  for delete to authenticated using (is_admin());

-- 4. clientes ------------------------------------------------------------

create policy "clientes_select" on clientes
  for select to authenticated using (true);

create policy "clientes_insert" on clientes
  for insert to authenticated with check (true);

create policy "clientes_update_admin" on clientes
  for update to authenticated using (is_admin()) with check (is_admin());

create policy "clientes_delete_admin" on clientes
  for delete to authenticated using (is_admin());

-- 5. periodos (no sensible, se auto-crean al navegar) ------------------------

create policy "periodos_select" on periodos
  for select to authenticated using (true);

create policy "periodos_insert" on periodos
  for insert to authenticated with check (true);

create policy "periodos_update" on periodos
  for update to authenticated using (true) with check (true);

-- 6. tareas — admin o dueño de la empresa -------------------------------------

create policy "tareas_select" on tareas
  for select to authenticated using (
    is_admin()
    or cliente_id in (select id from clientes where liquidador_id = current_liquidadora_id())
  );

create policy "tareas_insert" on tareas
  for insert to authenticated with check (
    is_admin()
    or cliente_id in (select id from clientes where liquidador_id = current_liquidadora_id())
  );

create policy "tareas_update" on tareas
  for update to authenticated using (
    is_admin()
    or cliente_id in (select id from clientes where liquidador_id = current_liquidadora_id())
  ) with check (
    is_admin()
    or cliente_id in (select id from clientes where liquidador_id = current_liquidadora_id())
  );

create policy "tareas_delete_admin" on tareas
  for delete to authenticated using (is_admin());

-- 7. historial_asignaciones — solo admin --------------------------------------

create policy "historial_admin" on historial_asignaciones
  for all to authenticated using (is_admin()) with check (is_admin());

-- 8. drive_log -----------------------------------------------------------------

create policy "drive_log_select" on drive_log
  for select to authenticated using (true);

create policy "drive_log_insert" on drive_log
  for insert to authenticated with check (true);

-- 9. Verificación rápida --------------------------------------------------------
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'liquidadoras','clientes','periodos',
    'tareas','historial_asignaciones','drive_log'
  )
order by tablename, policyname;
