-- =============================================================================
-- Cuenta de comision de tarjetas de credito de OCHO_A.
--
-- Requiere ejecutar primero 64_seed_fg_credit_card_commission_accounts.sql,
-- que crea la tabla compartida de configuracion por ERP.
--
-- Alcance de datos: exclusivamente OCHO_A / SAP_TARJETAS. Inserta la misma
-- cuenta que el modulo utilizaba en codigo: 1111000104. No modifica bancos,
-- cuentas bancarias, layouts, ERP ni asignaciones de ningun tenant.
--
-- EJECUCION MANUAL: ejecutar antes de desplegar el backend que lee la cuenta
-- de OCHO_A desde esta tabla.
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

  IF to_regclass('public.empresas_erp_tarjetas_comisiones') IS NULL THEN
    RAISE EXCEPTION
      'Falta public.empresas_erp_tarjetas_comisiones. Ejecuta primero sql/64_seed_fg_credit_card_commission_accounts.sql.';
  END IF;

  SELECT COUNT(*)
  INTO target_company_count
  FROM public.empresas company
  WHERE LOWER(BTRIM(company.emp_id_fiscal)) = 'ocho_a';

  IF target_company_count <> 1 THEN
    RAISE EXCEPTION 'Debe existir exactamente la empresa OCHO_A. Encontradas: %.', target_company_count;
  END IF;

  SELECT COUNT(*)
  INTO target_erp_count
  FROM public.empresas_erp_configuraciones config
  JOIN public.empresas company ON company.emp_id = config.emp_id
  WHERE LOWER(BTRIM(company.emp_id_fiscal)) = 'ocho_a'
    AND LOWER(BTRIM(config.epc_codigo)) = 'sap_tarjetas'
    AND config.epc_activo = TRUE;

  IF target_erp_count <> 1 THEN
    RAISE EXCEPTION
      'OCHO_A debe tener exactamente una ERP SAP_TARJETAS activa. Configuraciones encontradas: %.',
      target_erp_count;
  END IF;
END;
$$;

-- Inserta la cuenta actual de OCHO_A. Una reejecucion no sobrescribe una
-- modificacion contable posterior hecha explicitamente por el operador.
WITH target AS (
  SELECT config.epc_id
  FROM public.empresas_erp_configuraciones config
  JOIN public.empresas company ON company.emp_id = config.emp_id
  WHERE LOWER(BTRIM(company.emp_id_fiscal)) = 'ocho_a'
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
  '1111000104',
  TRUE
FROM target
ON CONFLICT (epc_id) DO NOTHING;

-- Verificacion posterior (solo lectura). Debe devolver una sola fila para
-- OCHO_A, SAP_TARJETAS, cuenta 1111000104.
SELECT
  company.emp_id_fiscal AS empresa,
  config.epc_id AS erp_config_id,
  config.epc_codigo AS erp_codigo,
  commission.etc_cuenta_comision_credito AS cuenta_comision_credito,
  commission.etc_activa AS activa
FROM public.empresas_erp_tarjetas_comisiones commission
JOIN public.empresas_erp_configuraciones config ON config.epc_id = commission.epc_id
JOIN public.empresas company ON company.emp_id = config.emp_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) = 'ocho_a'
  AND LOWER(BTRIM(config.epc_codigo)) = 'sap_tarjetas';

COMMIT;
