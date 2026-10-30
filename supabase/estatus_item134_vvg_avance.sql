-- Ítem 134: VVG tenía info_recibida=true pero avance=0 -- según la fórmula
-- de BOS (calcularAvance) debería ser 25. No es un dato del ESTATUS, es un
-- desajuste propio de BOS (probablemente un import que tocó info_recibida
-- directo en la base sin pasar por la acción que recalcula el avance).
update balances
set avance = 25, updated_at = now()
where id in (
  select b.id from balances b
  join clientes c on c.id = b.cliente_id
  where c.cuit = '30718698290' and b.anio_fiscal = 2026
)
returning (select nombre from clientes where id = cliente_id), avance;
