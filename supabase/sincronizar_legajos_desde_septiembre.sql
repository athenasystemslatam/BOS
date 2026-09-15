-- BOS · Sincronizar legajos con el valor de Septiembre 2026, en todos los
-- períodos de cada cliente (pasados y futuros) — corrida única.
--
-- Antes de esto, legajos_cantidad podía haber quedado distinto entre meses
-- (ediciones manuales sueltas, o el copiado automático que no siempre
-- alcanzó a todos). De ahora en más el código sincroniza todo solo al
-- editar (ver updateLegajos en seguimiento/actions.ts); esta corrida es
-- el punto de partida: toma Septiembre 2026 como el mes de referencia
-- "limpio" para parejar el resto, tal como se pidió, precisamente para no
-- mezclarlo con ediciones manuales que puedan haber quedado dispares en
-- otros meses.
--
-- Solo toca clientes que tienen un valor > 0 cargado en Septiembre 2026 —
-- a los que no lo tienen ahí, no les toca nada (no los vacía). Ejecutar en
-- Supabase SQL Editor.

with septiembre as (
  select t.cliente_id, t.legajos_cantidad
  from tareas t
  join periodos p on p.id = t.periodo_id
  where p.anio = 2026 and p.mes = 9
    and t.legajos_cantidad > 0
)
update tareas t
set legajos_cantidad = s.legajos_cantidad
from septiembre s
where t.cliente_id = s.cliente_id
  and t.legajos_cantidad is distinct from s.legajos_cantidad;

-- Verificación sugerida — debería dar 0 filas (todo período de un cliente
-- con legajos cargados tiene que coincidir con los demás):
-- select c.nombre, count(distinct t.legajos_cantidad) as valores_distintos
-- from tareas t
-- join clientes c on c.id = t.cliente_id
-- where t.legajos_cantidad > 0
-- group by c.nombre
-- having count(distinct t.legajos_cantidad) > 1;
