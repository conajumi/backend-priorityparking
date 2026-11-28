ALTER TABLE "estudiantes_habilitados"
DROP COLUMN IF EXISTS "es_apto_parking";

ALTER TABLE "estudiantes_habilitados"
ADD COLUMN "es_apto_parking" BOOLEAN
GENERATED ALWAYS AS ("esta_al_dia_pagos" = true) STORED;