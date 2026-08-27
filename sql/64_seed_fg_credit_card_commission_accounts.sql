-- =============================================================================
-- Cuenta de comision de tarjetas de credito para FG, exclusiva por ERP.
--
-- Alcance de datos: solamente FG_TARJETA y FG_TARJETA_QA, ERP SAP_TARJETAS.
-- La cuenta se relaciona con epc_id para que el deposito siempre utilice la
-- configuracion SAP que eligio el usuario y nunca una cuenta de otra empresa.
--
-- El valor inicial PENDIENTE_CONFIGURAR_CUENTA_COMISION_FG es intencionalmente
-- invalido para SAP. El backend lo rechaza hasta que el operador lo sustituya
-- por una cuenta contable real en el bloque de actualizacion de este archivo.
--
-- EJECUCION MANUAL: ejecutar antes de desplegar el backend que consulta esta
-- tabla. No ejecutar este archivo desde la aplicacion.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  expected_database CONSTANT TEXT := 'QONCILIA_BACK';
  target_company_count INTEGER;
  target_erp_count INTEGER;
BEGIN
  IF current_database() <> expected_database THEN
    RAISE EXCEPTION 'Base incorrecta. Esperada %, actual %.', expected_database, current_database();
  END IF;

  SELECT COUNT(*)
  INTO target_company_count
  FROM public.empresas company
  WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN ('fg_tarjeta', 'fg_tarjeta_qa');

  IF target_company_count <> 2 THEN
    RAISE EXCEPTION
      'Deben existir exactamente FG_TARJETA y FG_TARJETA_QA antes de configurar comisiones. Encontradas: %.',
      target_company_count;
  END IF;

  SELECT COUNT(*)
  INTO target_erp_count
  FROM public.empresas_erp_configuraciones config
  JOIN public.empresas company ON company.emp_id = config.emp_id
  WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN ('fg_tarjeta', 'fg_tarjeta_qa')
    AND LOWER(BTRIM(config.epc_codigo)) = 'sap_tarjetas'
    AND config.epc_activo = TRUE;

  IF target_erp_count <> 2 THEN
    RAISE EXCEPTION
      'Cada empresa FG debe tener exactamente una ERP SAP_TARJETAS activa. Configuraciones encontradas: %.',
      target_erp_count;
  END IF;
END;
$$;

-- Tabla independiente: una configuracion de comision por ERP, con cascada al
-- borrar la ERP. No modifica empresas, bancos, cuentas bancarias, layouts ni
-- configuraciones ERP de ningun otro tenant.
CREATE TABLE IF NOT EXISTS public.empresas_erp_tarjetas_comisiones (
  etc_id SERIAL PRIMARY KEY,
  epc_id INTEGER NOT NULL,
  etc_cuenta_comision_credito VARCHAR(80) NOT NULL,
  etc_activa BOOLEAN NOT NULL DEFAULT TRUE,
  etc_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  etc_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_empresas_erp_tarjetas_comisiones_epc UNIQUE (epc_id),
  CONSTRAINT chk_empresas_erp_tarjetas_comisiones_cuenta_not_blank
    CHECK (length(BTRIM(etc_cuenta_comision_credito)) > 0),
  CONSTRAINT fk_empresas_erp_tarjetas_comisiones_erp
    FOREIGN KEY (epc_id)
    REFERENCES public.empresas_erp_configuraciones (epc_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_empresas_erp_tarjetas_comisiones_activa
  ON public.empresas_erp_tarjetas_comisiones (epc_id)
  WHERE etc_activa = TRUE;

CREATE OR REPLACE FUNCTION public.fn_touch_etc_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.etc_updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger trg
    JOIN pg_class relation ON relation.oid = trg.tgrelid
    JOIN pg_namespace schema ON schema.oid = relation.relnamespace
    WHERE trg.tgname = 'trg_empresas_erp_tarjetas_comisiones_touch_updated_at'
      AND schema.nspname = 'public'
      AND relation.relname = 'empresas_erp_tarjetas_comisiones'
      AND NOT trg.tgisinternal
  ) THEN
    EXECUTE $trigger$
      CREATE TRIGGER trg_empresas_erp_tarjetas_comisiones_touch_updated_at
      BEFORE UPDATE ON public.empresas_erp_tarjetas_comisiones
      FOR EACH ROW
      EXECUTE FUNCTION public.fn_touch_etc_updated_at()
    $trigger$;
  END IF;
END;
$$;

-- Inserta el placeholder solo para las dos ERP objetivo. En una reejecucion no
-- sobrescribe la cuenta real que el operador ya haya configurado.
WITH targets AS (
  SELECT config.epc_id
  FROM public.empresas_erp_configuraciones config
  JOIN public.empresas company ON company.emp_id = config.emp_id
  WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN ('fg_tarjeta', 'fg_tarjeta_qa')
    AND LOWER(BTRIM(config.epc_codigo)) = 'sap_tarjetas'
    AND config.epc_activo = TRUE
)
INSERT INTO public.empresas_erp_tarjetas_comisiones (
  epc_id,
  etc_cuenta_comision_credito,
  etc_activa
)
SELECT
  target.epc_id,
  'PENDIENTE_CONFIGURAR_CUENTA_COMISION_FG',
  TRUE
FROM targets target
ON CONFLICT (epc_id) DO NOTHING;

-- CONFIGURACION POSTERIOR: reemplazar ambos placeholders por las cuentas
-- contables reales. Se puede usar una cuenta distinta para produccion y QA.
-- Descomentar y reemplazar los dos valores antes de ejecutar este bloque.
--
-- WITH accounts (company_code, account_code) AS (
--   VALUES
--     ('FG_TARJETA', '__CUENTA_COMISION_FG_PRODUCCION__'),
--     ('FG_TARJETA_QA', '__CUENTA_COMISION_FG_QA__')
-- )
-- UPDATE public.empresas_erp_tarjetas_comisiones commission
-- SET etc_cuenta_comision_credito = account.account_code,
--     etc_activa = TRUE
-- FROM accounts account
-- JOIN public.empresas company
--   ON LOWER(BTRIM(company.emp_id_fiscal)) = LOWER(account.company_code)
-- JOIN public.empresas_erp_configuraciones config
--   ON config.emp_id = company.emp_id
--  AND LOWER(BTRIM(config.epc_codigo)) = 'sap_tarjetas'
--  AND config.epc_activo = TRUE
-- WHERE commission.epc_id = config.epc_id;

-- Verificacion posterior (solo lectura). Debe devolver exclusivamente las dos
-- empresas FG y su ERP SAP_TARJETAS.
SELECT
  company.emp_id_fiscal AS empresa,
  config.epc_id AS erp_config_id,
  config.epc_codigo AS erp_codigo,
  commission.etc_cuenta_comision_credito AS cuenta_comision_credito,
  commission.etc_activa AS activa
FROM public.empresas_erp_tarjetas_comisiones commission
JOIN public.empresas_erp_configuraciones config ON config.epc_id = commission.epc_id
JOIN public.empresas company ON company.emp_id = config.emp_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN ('fg_tarjeta', 'fg_tarjeta_qa')
ORDER BY company.emp_id_fiscal, config.epc_codigo;

COMMIT;
