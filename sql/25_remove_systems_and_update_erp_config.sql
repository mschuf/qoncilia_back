BEGIN;

-- ERP config: quitar campos legacy y dejar las nuevas credenciales de sistema.
-- Importante: epc_user_pass debe ser escrito por la app para guardar AES-256-GCM,
-- no cargar passwords en texto plano desde SQL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'empresas_erp_configuraciones'
      AND column_name = 'epc_sap_username'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'empresas_erp_configuraciones'
      AND column_name = 'epc_user_system'
  ) THEN
    ALTER TABLE public.empresas_erp_configuraciones
      RENAME COLUMN epc_sap_username TO epc_user_system;
  END IF;
END;
$$;

ALTER TABLE public.empresas_erp_configuraciones
  ADD COLUMN IF NOT EXISTS epc_user_system VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS epc_user_pass TEXT NULL,
  DROP COLUMN IF EXISTS epc_sap_username,
  DROP COLUMN IF EXISTS epc_descripcion,
  DROP COLUMN IF EXISTS epc_tipo;

-- Plantillas: eliminar dependencia con sistemas.
DROP INDEX IF EXISTS public.idx_plantillas_base_sistema_id;
DROP INDEX IF EXISTS public.idx_plantillas_conciliacion_sistema_id;

ALTER TABLE public.plantillas_base
  DROP CONSTRAINT IF EXISTS fk_plantillas_base_sistemas,
  DROP COLUMN IF EXISTS sistema_id;

ALTER TABLE public.plantillas_conciliacion
  DROP CONSTRAINT IF EXISTS fk_plantillas_conciliacion_sistemas,
  DROP COLUMN IF EXISTS sistema_id;

DO $$
BEGIN
  IF to_regclass('public.sistemas') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_sistemas_touch_actualizado_en ON public.sistemas;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.fn_touch_sistemas_actualizado_en();
DROP TABLE IF EXISTS public.sistemas CASCADE;

COMMIT;
