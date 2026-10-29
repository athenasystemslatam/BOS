-- Ítem 130/131: 5 clientes con balance 2025 que el ESTATUS tiene como
-- Finalizado/Presentado en ARCA con los 4 formularios presentados, pero en
-- BOS seguían en asignado/pendiente. "Neo Kings SAS" en BOS es "NEOKING SAS"
-- en el ESTATUS -- confirmado por CUIT, no por nombre (ver ítem 131).
update balances b
set
  estado_eecc = 'presentado_arca',
  avance = 100,
  estado = 'finalizado',
  f855_estado = 'presentado',
  f899_estado = 'presentado',
  f713_estado = 'presentado',
  f657_estado = 'presentado',
  legalizado_fecha = coalesce(b.legalizado_fecha, now()),
  presentado_fecha = coalesce(b.presentado_fecha, now()),
  presentado_fecha_real = true,
  updated_at = now()
from clientes c
where b.cliente_id = c.id
  and b.anio_fiscal = 2025
  and c.nombre in ('APUS MART SRL', 'BLACK FISH SRL', 'DETECTAR USH SRL', 'LIPIANT', 'NEO KINGS SAS')
returning c.nombre, b.anio_fiscal, b.estado, b.estado_eecc, b.avance;

-- Lipiant: Tasa IGJ ya enviada con correlativo, según el ESTATUS.
update balances b
set
  igj_tasa = 'enviada',
  igj_numero = '1986512',
  updated_at = now()
from clientes c
where b.cliente_id = c.id
  and b.anio_fiscal = 2025
  and c.nombre = 'LIPIANT'
returning c.nombre, b.igj_tasa, b.igj_numero;

-- Neo Kings: el ESTATUS anota un correlativo pero IGJ y Tasa siguen
-- "Pendiente" ahí mismo -- se guarda solo el número, sin tocar el estado.
update balances b
set
  igj_numero = '1996991',
  updated_at = now()
from clientes c
where b.cliente_id = c.id
  and b.anio_fiscal = 2025
  and c.nombre = 'NEO KINGS SAS'
returning c.nombre, b.igj_numero;
