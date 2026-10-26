-- Ítem 116: Nº correlativo IGJ como campo propio del balance, en vez de
-- anotarlo en Observaciones (así queda hoy en el ESTATUS 2025).
ALTER TABLE balances ADD COLUMN IF NOT EXISTS igj_numero TEXT;
