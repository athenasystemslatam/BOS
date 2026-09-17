-- BOS · Contable — nueva secuencia de estados del balance:
-- Sin asignar → Asignado → Legalizado → Finalizado (= en ARCA) → Frenado
-- (Frenado puede ocurrir en cualquier punto).
--
-- El estado "en_proceso" pasa a llamarse "legalizado" en el código. Antes
-- de poder actualizar los balances existentes hay que ampliar el CHECK
-- constraint de la columna (balances_estado_check), que hoy solo permite
-- 'sin_asignar','asignado','en_proceso','finalizado','frenado' — sin
-- "legalizado" el UPDATE de abajo lo rechaza.
--
-- No toca la columna estado_eecc (esa es otra, la de la columna "EECC" de
-- la tabla, que ya tenía su propio "en_proceso"/"legalizado" independiente
-- y no se modifica). Ejecutar en Supabase SQL Editor.

alter table balances drop constraint balances_estado_check;
alter table balances add constraint balances_estado_check
  check (estado in ('sin_asignar','asignado','en_proceso','legalizado','finalizado','frenado'));

update balances
set estado = 'legalizado'
where estado = 'en_proceso';
