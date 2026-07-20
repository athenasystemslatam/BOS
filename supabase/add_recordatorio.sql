-- Agregar campo recordatorio a tareas
-- Permite anotar una nota en el mes M que aparece como alerta en el mes M+1
ALTER TABLE tareas ADD COLUMN IF NOT EXISTS recordatorio TEXT;
