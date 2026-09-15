-- BOS · Backfill: repetir legajos_cantidad hacia adelante en el histórico
-- Antes, el "copiar legajos del mes anterior" solo miraba el mes
-- inmediatamente previo y solo corría al cambiar de mes dentro de
-- Seguimiento — si un mes se saltaba, la cadena se cortaba y quedaba en 0
-- de ahí en más. Esto completa, para cada cliente y cada período donde
-- legajos_cantidad esté vacío/0, el último valor > 0 que ese cliente tuvo
-- en un período anterior (sin importar cuántos meses de por medio) — el
-- mismo criterio "last observation carried forward" que ahora aplica el
-- código en cada período nuevo (ver copiarLegajosDelHistorial en
-- seguimiento/actions.ts). No inventa filas: solo completa tareas que ya
-- existen. Nunca pisa un valor > 0 ya cargado. Ejecutar en Supabase SQL
-- Editor.

with numerado as (
  select
    t.id,
    t.cliente_id,
    p.anio,
    p.mes,
    t.legajos_cantidad,
    count(case when t.legajos_cantidad > 0 then 1 end) over (
      partition by t.cliente_id order by p.anio, p.mes
    ) as grupo
  from tareas t
  join periodos p on p.id = t.periodo_id
),
completado as (
  select
    id,
    max(legajos_cantidad) over (partition by cliente_id, grupo) as legajos_heredado
  from numerado
  where grupo > 0  -- antes del primer valor > 0 de ese cliente no hay nada que heredar
)
update tareas t
set legajos_cantidad = c.legajos_heredado
from completado c
where t.id = c.id
  and (t.legajos_cantidad is null or t.legajos_cantidad = 0)
  and c.legajos_heredado is not null;

-- Verificación sugerida (cuántas filas quedaron completadas por cliente,
-- útil para chequear que no se disparó ningún número raro):
-- select c.nombre, t.legajos_cantidad, p.nombre_mes
-- from tareas t
-- join clientes c on c.id = t.cliente_id
-- join periodos p on p.id = t.periodo_id
-- where t.legajos_cantidad > 0
-- order by c.nombre, p.anio, p.mes;
