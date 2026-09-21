-- BOS · Contable — columnas "Pedido de información" / "Recepción de
-- información" con fecha automática al tildar.
--
-- "Pedido" usa las columnas que ya existían (envio1 / envio1_fecha).
-- "Recepción" usa info_recibida, que no tenía fecha: se suma la columna.
-- Los envíos 2 y 3 (envio2/envio3) dejan de mostrarse en la tabla pero sus
-- datos siguen en la base, sin tocar. Ejecutar en Supabase SQL Editor ANTES
-- de usar la casilla de Recepción (si no, no puede guardar la fecha).

alter table balances add column if not exists info_recibida_fecha date;
