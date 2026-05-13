BEGIN;

ALTER TABLE public.empresas_erp_configuraciones
  ALTER COLUMN epc_server_node TYPE VARCHAR(100),
  ADD COLUMN IF NOT EXISTS query_banco TEXT NULL,
  ADD COLUMN IF NOT EXISTS query_sistema TEXT NULL;

ALTER TABLE public.erp_configuraciones_plantillas
  ALTER COLUMN ept_server_node TYPE VARCHAR(100);

COMMIT;
