-- Ítem 130: 14 clientes con balance 2026 que el ESTATUS ya tiene como
-- "Presentado en ARCA" / 100%, pero en BOS seguían en otro estado. Mismo
-- efecto que tildar "En ARCA" en la columna EECC desde la pantalla (deriva
-- Estado = Finalizado y Avance = 100 solos). Termogross e Ishyma quedan sin
-- responsable asignado a propósito (decisión de Matías, 29-oct).
update balances b
set
  estado_eecc = 'presentado_arca',
  avance = 100,
  estado = 'finalizado',
  legalizado_fecha = coalesce(b.legalizado_fecha, now()),
  presentado_fecha = coalesce(b.presentado_fecha, now()),
  presentado_fecha_real = true,
  updated_at = now()
from clientes c
where b.cliente_id = c.id
  and b.anio_fiscal = 2026
  and c.nombre in (
    'BIMARES', 'BRULEM S.R.L', 'ESTUDIO QUEIROLO', 'MAXIGAS S A', 'DANRA PLAIN',
    'TERMOGROSS S.R.L.', 'RIALTO CAFFE S.R.L.', 'ISHYMA', 'CISEC S.A.', 'SAMRAY SA',
    'FOUR DUCKS S.A.', 'MAYONESA SRL', 'ANYX', 'RODBALL'
  )
returning c.nombre, b.anio_fiscal, b.estado, b.estado_eecc, b.avance;
