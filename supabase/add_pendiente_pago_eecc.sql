-- BOS · Contable — semáforo de EECC: se suma el estado "Pendiente de pago"
-- (naranja) entre "En proceso" y "Legalizado". El CHECK constraint de
-- estado_eecc hoy solo permite 'pendiente','en_proceso','legalizado',
-- 'presentado_arca' — sin ampliarlo, elegir "Pendiente de pago" en la tabla
-- falla al guardar. Ejecutar en Supabase SQL Editor.

alter table balances drop constraint balances_estado_eecc_check;
alter table balances add constraint balances_estado_eecc_check
  check (estado_eecc in ('pendiente','en_proceso','pendiente_pago','legalizado','presentado_arca'));
