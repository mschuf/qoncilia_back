BEGIN;

ALTER TABLE public.bancos
  DROP COLUMN IF EXISTS banco_alias;

COMMIT;
