-- Contable: estado "No corresponde" para balances que no hace el estudio
-- (lo cierra otro estudio, el cliente entró con el ejercicio ya iniciado,
-- baja del cliente). Manual como Frenado, con motivo obligatorio.
-- Hay que ampliar el CHECK antes de que la app intente guardar el valor nuevo.

alter table balances drop constraint balances_estado_check;
alter table balances add constraint balances_estado_check
  check (estado in ('sin_asignar','asignado','en_proceso','legalizado','finalizado','frenado','no_corresponde'));

alter table balances add column if not exists no_corresponde_motivo text;
alter table balances add column if not exists no_corresponde_desde timestamptz;
