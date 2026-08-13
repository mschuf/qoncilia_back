-- =============================================================================
-- Configuracion ERP SAP_TARJETAS para Pago de Tarjeta de OCHO A.
--
-- La pantalla "Pago de Tarjeta" exige una configuracion ERP ACTIVA cuyo codigo
-- sea exactamente SAP_TARJETAS. Este script copia esa configuracion desde
-- FG_TARJETA a OCHO A sin alterar el registro fuente.
--
-- Solo realiza INSERT/UPDATE sobre empresas_erp_configuraciones de OCHO_A.
-- No modifica FG_TARJETA ni ninguna otra empresa. Script idempotente y de
-- ejecucion manual.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  source_count INTEGER;
  missing_fields TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('OCHO_A')
      AND LOWER(TRIM(emp_nombre)) = LOWER('OCHO A')
      AND emp_activa = TRUE
  ) THEN
    RAISE EXCEPTION 'No existe la empresa activa OCHO A (OCHO_A).';
  END IF;

  SELECT COUNT(*)
  INTO source_count
  FROM public.empresas_erp_configuraciones cfg
  JOIN public.empresas e ON e.emp_id = cfg.emp_id
  WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('FG_TARJETA')
    AND e.emp_activa = TRUE
    AND cfg.epc_activo = TRUE
    AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_TARJETAS');

  IF source_count <> 1 THEN
    RAISE EXCEPTION
      'Se esperaba exactamente una configuracion activa SAP_TARJETAS en FG_TARJETA y se encontraron %.',
      source_count;
  END IF;

  SELECT STRING_AGG(required.field_name, ', ' ORDER BY required.field_name)
  INTO missing_fields
  FROM public.empresas_erp_configuraciones cfg
  JOIN public.empresas e ON e.emp_id = cfg.emp_id
  CROSS JOIN LATERAL (
    VALUES
      ('epc_user_system', NULLIF(BTRIM(cfg.epc_user_system), '')),
      ('epc_user_pass', NULLIF(BTRIM(cfg.epc_user_pass), '')),
      ('epc_db_name', NULLIF(BTRIM(cfg.epc_db_name), '')),
      ('epc_server_node', NULLIF(BTRIM(cfg.epc_server_node), '')),
      ('epc_db_user', NULLIF(BTRIM(cfg.epc_db_user), '')),
      ('epc_db_password_enc', NULLIF(BTRIM(cfg.epc_db_password_enc), '')),
      ('epc_service_layer_url', NULLIF(BTRIM(cfg.epc_service_layer_url), '')),
      ('epc_tls_version', NULLIF(BTRIM(cfg.epc_tls_version), '')),
      ('query_sistema', NULLIF(BTRIM(cfg.query_sistema), ''))
  ) AS required(field_name, field_value)
  WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('FG_TARJETA')
    AND cfg.epc_activo = TRUE
    AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_TARJETAS')
    AND required.field_value IS NULL;

  IF missing_fields IS NOT NULL THEN
    RAISE EXCEPTION
      'La configuracion SAP_TARJETAS de FG_TARJETA no esta completa. Faltan: %. Completala primero desde Integraciones ERP.',
      missing_fields;
  END IF;
END;
$$;

-- Si OCHO A tenia una SAP_TARJETAS inactiva, se actualiza y activa. Una que ya
-- este activa queda intacta, para no sobrescribir cambios realizados en OCHO A.
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('OCHO_A')
),
source_config AS (
  SELECT cfg.*
  FROM public.empresas_erp_configuraciones cfg
  JOIN public.empresas e ON e.emp_id = cfg.emp_id
  WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('FG_TARJETA')
    AND cfg.epc_activo = TRUE
    AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_TARJETAS')
)
UPDATE public.empresas_erp_configuraciones target
SET
  ept_id = source.ept_id,
  epc_nombre = source.epc_nombre,
  epc_activo = TRUE,
  epc_es_predeterminado = FALSE,
  epc_user_system = source.epc_user_system,
  epc_user_pass = source.epc_user_pass,
  epc_db_name = source.epc_db_name,
  epc_server_node = source.epc_server_node,
  query_banco = source.query_banco,
  query_sistema = source.query_sistema,
  epc_db_user = source.epc_db_user,
  epc_db_password_enc = source.epc_db_password_enc,
  epc_service_layer_url = source.epc_service_layer_url,
  epc_tls_version = source.epc_tls_version,
  epc_allow_self_signed = source.epc_allow_self_signed,
  epc_settings = source.epc_settings,
  epc_updated_at = NOW()
FROM target_company company
JOIN source_config source ON TRUE
WHERE target.emp_id = company.emp_id
  AND LOWER(TRIM(target.epc_codigo)) = LOWER('SAP_TARJETAS')
  AND target.epc_activo IS NOT TRUE;

WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('OCHO_A')
),
source_config AS (
  SELECT cfg.*
  FROM public.empresas_erp_configuraciones cfg
  JOIN public.empresas e ON e.emp_id = cfg.emp_id
  WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('FG_TARJETA')
    AND cfg.epc_activo = TRUE
    AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_TARJETAS')
)
INSERT INTO public.empresas_erp_configuraciones (
  ept_id,
  emp_id,
  epc_codigo,
  epc_nombre,
  epc_activo,
  epc_es_predeterminado,
  epc_user_system,
  epc_user_pass,
  epc_db_name,
  epc_server_node,
  query_banco,
  query_sistema,
  epc_db_user,
  epc_db_password_enc,
  epc_service_layer_url,
  epc_tls_version,
  epc_allow_self_signed,
  epc_settings
)
SELECT
  source.ept_id,
  company.emp_id,
  'SAP_TARJETAS',
  source.epc_nombre,
  TRUE,
  FALSE,
  source.epc_user_system,
  source.epc_user_pass,
  source.epc_db_name,
  source.epc_server_node,
  source.query_banco,
  source.query_sistema,
  source.epc_db_user,
  source.epc_db_password_enc,
  source.epc_service_layer_url,
  source.epc_tls_version,
  source.epc_allow_self_signed,
  source.epc_settings
FROM target_company company
JOIN source_config source ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.empresas_erp_configuraciones target
  WHERE target.emp_id = company.emp_id
    AND LOWER(TRIM(target.epc_codigo)) = LOWER('SAP_TARJETAS')
);

-- Verificacion posterior (solo lectura).
SELECT
  e.emp_id_fiscal AS empresa_codigo,
  cfg.epc_codigo AS erp_codigo,
  cfg.epc_nombre AS erp_nombre,
  cfg.epc_activo AS erp_activa,
  NULLIF(BTRIM(cfg.epc_db_name), '') IS NOT NULL AS tiene_base_datos,
  NULLIF(BTRIM(cfg.epc_service_layer_url), '') IS NOT NULL AS tiene_service_layer,
  NULLIF(BTRIM(cfg.epc_user_system), '') IS NOT NULL AS tiene_usuario_sap,
  NULLIF(BTRIM(cfg.epc_user_pass), '') IS NOT NULL AS tiene_password_sap,
  NULLIF(BTRIM(cfg.query_sistema), '') IS NOT NULL AS tiene_query_sistema
FROM public.empresas_erp_configuraciones cfg
JOIN public.empresas e ON e.emp_id = cfg.emp_id
WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('OCHO_A')
  AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_TARJETAS');

COMMIT;
