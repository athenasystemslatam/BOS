-- Ítems 34/47/50/70 del módulo Contable.
--
-- 1) Nuevas fechas que se autocompletan solas (igual que envio1_fecha /
--    info_recibida_fecha ya existentes), para poder medir productividad y
--    cumplimiento de vencimientos sin que nadie cargue nada a mano:
--    - legalizado_fecha: primera vez que estado_eecc llega a 'legalizado'.
--    - presentado_fecha: primera vez que estado_eecc llega a
--      'presentado_arca' (= "En ARCA" = terminado).
--    - frenado_desde: cuándo pasó a estado 'frenado' (se borra al reanudar).
--    - f855_fecha: primera vez que f855_estado pasa a 'presentado'.
alter table balances
  add column if not exists legalizado_fecha timestamptz,
  add column if not exists presentado_fecha timestamptz,
  add column if not exists frenado_desde timestamptz,
  add column if not exists f855_fecha timestamptz;

-- 2) Ítem 34: el Estado deja de cargarse a mano y se deriva de estado_eecc
--    (Legalizado / En ARCA = Finalizado) y de si tiene responsable
--    (Asignado / Sin asignar). Frenado se respeta tal cual está, no se
--    toca. Corrige casos como Terrazas del Talar (EECC En ARCA con Estado
--    todavía en Asignado).
update balances
set estado = case
  when estado_eecc = 'presentado_arca' then 'finalizado'
  when estado_eecc = 'legalizado' then 'legalizado'
  when responsable_id is not null or responsable2_id is not null then 'asignado'
  else 'sin_asignar'
end
where estado <> 'frenado';

-- 3) Backfill de las fechas nuevas para balances que YA están en ese
--    estado hoy, usando updated_at como mejor aproximación disponible (no
--    hay forma de saber el momento exacto retroactivamente). De acá en
--    adelante las carga el propio código la primera vez que corresponde.
update balances
set presentado_fecha = updated_at
where estado_eecc = 'presentado_arca' and presentado_fecha is null;

update balances
set legalizado_fecha = updated_at
where estado_eecc in ('legalizado', 'presentado_arca') and legalizado_fecha is null;

update balances
set frenado_desde = updated_at
where estado = 'frenado' and frenado_desde is null;

update balances
set f855_fecha = updated_at
where f855_estado = 'presentado' and f855_fecha is null;
