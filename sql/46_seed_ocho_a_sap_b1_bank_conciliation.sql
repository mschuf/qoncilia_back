-- =============================================================================
-- Configuracion ERP SAP_B1 para Conciliacion de Banco de OCHO A.
--
-- El modulo "Conciliacion de Banco" requiere una ERP ACTIVA cuyo codigo sea
-- exactamente SAP_B1. La configuracion SAP_TARJETAS sirve exclusivamente para
-- Pago de Tarjeta y no cumple ese requisito.
--
-- Este script:
--   * Lee (sin modificar) la conexion SAP ya activa de FG_TARJETA con codigo
--     SAP_TARJETAS.
--   * Crea en OCHO A la configuracion activa SAP_B1 con esas credenciales ya
--     cifradas y con los queries estandar de conciliacion bancaria.
--   * Si SAP_B1 ya existe pero esta inactiva en OCHO A, la actualiza. Si ya esta
--     activa, no la modifica.
--
-- No modifica registros, ERPs, usuarios ni permisos de FG_TARJETA ni de otra
-- empresa. La unica empresa destino de INSERT/UPDATE es OCHO_A.
-- Ejecutar manualmente. Script idempotente.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  source_count INTEGER;
  source_missing_fields TEXT;
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

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('FG_TARJETA')
      AND emp_activa = TRUE
  ) THEN
    RAISE EXCEPTION 'No existe la empresa activa FG_TARJETA para usarla como fuente de conexion.';
  END IF;

  SELECT COUNT(*)
  INTO source_count
  FROM public.empresas_erp_configuraciones cfg
  JOIN public.empresas e ON e.emp_id = cfg.emp_id
  WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('FG_TARJETA')
    AND cfg.epc_activo = TRUE
    AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_TARJETAS');

  IF source_count <> 1 THEN
    RAISE EXCEPTION
      'Se esperaba exactamente una configuracion activa SAP_TARJETAS en FG_TARJETA y se encontraron %.',
      source_count;
  END IF;

  SELECT STRING_AGG(field_name, ', ' ORDER BY field_name)
  INTO source_missing_fields
  FROM (
    SELECT 'epc_user_system' AS field_name
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.empresas_erp_configuraciones cfg
      JOIN public.empresas e ON e.emp_id = cfg.emp_id
      WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('FG_TARJETA')
        AND cfg.epc_activo = TRUE
        AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_TARJETAS')
        AND NULLIF(BTRIM(cfg.epc_user_system), '') IS NOT NULL
    )
    UNION ALL
    SELECT 'epc_user_pass'
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.empresas_erp_configuraciones cfg
      JOIN public.empresas e ON e.emp_id = cfg.emp_id
      WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('FG_TARJETA')
        AND cfg.epc_activo = TRUE
        AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_TARJETAS')
        AND NULLIF(BTRIM(cfg.epc_user_pass), '') IS NOT NULL
    )
    UNION ALL
    SELECT 'epc_db_name'
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.empresas_erp_configuraciones cfg
      JOIN public.empresas e ON e.emp_id = cfg.emp_id
      WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('FG_TARJETA')
        AND cfg.epc_activo = TRUE
        AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_TARJETAS')
        AND NULLIF(BTRIM(cfg.epc_db_name), '') IS NOT NULL
    )
    UNION ALL
    SELECT 'epc_service_layer_url'
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.empresas_erp_configuraciones cfg
      JOIN public.empresas e ON e.emp_id = cfg.emp_id
      WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('FG_TARJETA')
        AND cfg.epc_activo = TRUE
        AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_TARJETAS')
        AND NULLIF(BTRIM(cfg.epc_service_layer_url), '') IS NOT NULL
    )
    UNION ALL
    SELECT 'epc_tls_version'
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.empresas_erp_configuraciones cfg
      JOIN public.empresas e ON e.emp_id = cfg.emp_id
      WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('FG_TARJETA')
        AND cfg.epc_activo = TRUE
        AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_TARJETAS')
        AND NULLIF(BTRIM(cfg.epc_tls_version), '') IS NOT NULL
    )
  ) required;

  IF source_missing_fields IS NOT NULL THEN
    RAISE EXCEPTION
      'La configuracion SAP_TARJETAS de FG_TARJETA no tiene los campos requeridos: %. Completala primero desde Integraciones ERP.',
      source_missing_fields;
  END IF;
END;
$$;

-- Deja disponible una plantilla SAP_B1 global si existe; puede ser NULL si la
-- base aun no tiene esa plantilla. La operacion de conciliacion no depende de
-- esta referencia, sino de la configuracion de empresa creada mas abajo.
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
),
sap_b1_template AS (
  SELECT ept_id
  FROM public.erp_configuraciones_plantillas
  WHERE LOWER(TRIM(ept_codigo)) = LOWER('SAP_B1')
  ORDER BY ept_activo DESC, ept_updated_at DESC, ept_id ASC
  LIMIT 1
)
UPDATE public.empresas_erp_configuraciones target
SET
  ept_id = template.ept_id,
  epc_nombre = 'SAP Business One - Conciliacion Bancaria',
  epc_activo = TRUE,
  epc_es_predeterminado = FALSE,
  epc_user_system = source.epc_user_system,
  epc_user_pass = source.epc_user_pass,
  epc_db_name = source.epc_db_name,
  epc_server_node = source.epc_server_node,
  query_banco = $BANCO$
SELECT
    T0."Ref"                                AS "Referencia",
    TO_VARCHAR(T0."DueDate", 'YYYY-MM-DD') AS "Fecha",
    TO_VARCHAR(TO_BIGINT(T0."DebAmount"))  AS "Debito",
    TO_VARCHAR(TO_BIGINT(T0."CredAmnt"))   AS "Credito",
    T0."Sequence"                           AS "Sequence"
FROM "${CompanyDB}".OBNK T0
WHERE T0."AcctCode" = $1
  AND T0."BankMatch" = 0
  AND T0."DueDate" BETWEEN $2 AND $3
ORDER BY T0."DueDate" DESC
$BANCO$,
  query_sistema = $SISTEMA$
SELECT
    T0."Ref3Line"                           AS "Referencia",
    T1."Ref2"                               AS "Referencia2",
    TO_VARCHAR(T0."RefDate", 'YYYY-MM-DD') AS "Fecha",
    TO_VARCHAR(TO_BIGINT(T0."Debit"))       AS "Debito",
    TO_VARCHAR(TO_BIGINT(T0."Credit"))      AS "Credito",
    T0."TransId"                            AS "TransactionNumber",
    T0."Line_ID"                            AS "LineNumber"
FROM "${CompanyDB}".JDT1 T0
INNER JOIN "${CompanyDB}".OJDT T1
  ON T0."TransId" = T1."TransId"
WHERE T0."Account" = $1
  AND T0."ExtrMatch" = 0
  AND T0."RefDate" BETWEEN $2 AND $3
ORDER BY T0."RefDate" DESC
$SISTEMA$,
  epc_db_user = source.epc_db_user,
  epc_db_password_enc = source.epc_db_password_enc,
  epc_service_layer_url = source.epc_service_layer_url,
  epc_tls_version = source.epc_tls_version,
  epc_allow_self_signed = source.epc_allow_self_signed,
  epc_settings = source.epc_settings,
  epc_updated_at = NOW()
FROM target_company company
JOIN source_config source ON TRUE
LEFT JOIN sap_b1_template template ON TRUE
WHERE target.emp_id = company.emp_id
  AND LOWER(TRIM(target.epc_codigo)) = LOWER('SAP_B1')
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
),
sap_b1_template AS (
  SELECT ept_id
  FROM public.erp_configuraciones_plantillas
  WHERE LOWER(TRIM(ept_codigo)) = LOWER('SAP_B1')
  ORDER BY ept_activo DESC, ept_updated_at DESC, ept_id ASC
  LIMIT 1
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
  template.ept_id,
  company.emp_id,
  'SAP_B1',
  'SAP Business One - Conciliacion Bancaria',
  TRUE,
  FALSE,
  source.epc_user_system,
  source.epc_user_pass,
  source.epc_db_name,
  source.epc_server_node,
  $BANCO$
SELECT
    T0."Ref"                                AS "Referencia",
    TO_VARCHAR(T0."DueDate", 'YYYY-MM-DD') AS "Fecha",
    TO_VARCHAR(TO_BIGINT(T0."DebAmount"))  AS "Debito",
    TO_VARCHAR(TO_BIGINT(T0."CredAmnt"))   AS "Credito",
    T0."Sequence"                           AS "Sequence"
FROM "${CompanyDB}".OBNK T0
WHERE T0."AcctCode" = $1
  AND T0."BankMatch" = 0
  AND T0."DueDate" BETWEEN $2 AND $3
ORDER BY T0."DueDate" DESC
$BANCO$,
  $SISTEMA$
SELECT
    T0."Ref3Line"                           AS "Referencia",
    T1."Ref2"                               AS "Referencia2",
    TO_VARCHAR(T0."RefDate", 'YYYY-MM-DD') AS "Fecha",
    TO_VARCHAR(TO_BIGINT(T0."Debit"))       AS "Debito",
    TO_VARCHAR(TO_BIGINT(T0."Credit"))      AS "Credito",
    T0."TransId"                            AS "TransactionNumber",
    T0."Line_ID"                            AS "LineNumber"
FROM "${CompanyDB}".JDT1 T0
INNER JOIN "${CompanyDB}".OJDT T1
  ON T0."TransId" = T1."TransId"
WHERE T0."Account" = $1
  AND T0."ExtrMatch" = 0
  AND T0."RefDate" BETWEEN $2 AND $3
ORDER BY T0."RefDate" DESC
$SISTEMA$,
  source.epc_db_user,
  source.epc_db_password_enc,
  source.epc_service_layer_url,
  source.epc_tls_version,
  source.epc_allow_self_signed,
  source.epc_settings
FROM target_company company
JOIN source_config source ON TRUE
LEFT JOIN sap_b1_template template ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.empresas_erp_configuraciones target
  WHERE target.emp_id = company.emp_id
    AND LOWER(TRIM(target.epc_codigo)) = LOWER('SAP_B1')
);

-- Verificacion posterior (solo lectura).
SELECT
  e.emp_id_fiscal AS empresa_codigo,
  cfg.epc_codigo AS erp_codigo,
  cfg.epc_nombre AS erp_nombre,
  cfg.epc_activo AS erp_activa,
  cfg.epc_es_predeterminado AS erp_predeterminada,
  NULLIF(BTRIM(cfg.epc_db_name), '') IS NOT NULL AS tiene_base_datos,
  NULLIF(BTRIM(cfg.epc_service_layer_url), '') IS NOT NULL AS tiene_service_layer,
  NULLIF(BTRIM(cfg.epc_user_system), '') IS NOT NULL AS tiene_usuario_sap,
  NULLIF(BTRIM(cfg.epc_user_pass), '') IS NOT NULL AS tiene_password_sap,
  NULLIF(BTRIM(cfg.query_banco), '') IS NOT NULL AS tiene_query_banco,
  NULLIF(BTRIM(cfg.query_sistema), '') IS NOT NULL AS tiene_query_sistema
FROM public.empresas_erp_configuraciones cfg
JOIN public.empresas e ON e.emp_id = cfg.emp_id
WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('OCHO_A')
  AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_B1');

COMMIT;
