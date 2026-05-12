BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'empresas_erp_configuraciones'
      AND column_name = 'epc_cmp_name'
  ) THEN
    ALTER TABLE public.empresas_erp_configuraciones DROP COLUMN epc_cmp_name;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'erp_configuraciones_plantillas'
      AND column_name = 'ept_cmp_name'
  ) THEN
    ALTER TABLE public.erp_configuraciones_plantillas DROP COLUMN ept_cmp_name;
  END IF;
END $$;

COMMIT;
