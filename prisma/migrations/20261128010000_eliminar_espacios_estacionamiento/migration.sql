ALTER TABLE "reservas"
DROP CONSTRAINT IF EXISTS "reservas_id_espacio_fkey";

ALTER TABLE "reservas"
DROP COLUMN IF EXISTS "id_espacio";

DROP TABLE IF EXISTS "espacios_estacionamiento";