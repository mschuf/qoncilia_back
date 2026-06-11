BEGIN;

ALTER TABLE public.cuentas_bancarias
  ALTER COLUMN cuenta_bancaria_id_banco_erp DROP NOT NULL;

ALTER TABLE public.cuentas_bancarias
  DROP CONSTRAINT IF EXISTS chk_cuentas_bancarias_id_banco_erp_not_blank;

COMMIT;
