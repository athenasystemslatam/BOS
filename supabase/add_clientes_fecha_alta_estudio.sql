-- Ítem 110: fecha de alta del cliente en el estudio (distinta de
-- fecha_alta, que es cuándo se cargó la fila en BOS). Sirve para avisar
-- cuando el primer ejercicio contable quizás no corresponde (el cliente
-- entró con el ejercicio ya iniciado) — la decisión la sigue tomando el
-- contador a mano, acá solo se guarda el dato.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_alta_estudio DATE;
