-- =============================================================================
-- SAP_TARJETAS: configuracion ERP para la conciliacion de tarjetas de credito.
--
-- Crea (o actualiza) una configuracion por empresa con codigo EXACTO 'SAP_TARJETAS'.
-- El frontend activa el modo tarjetas cuando el code del ERP seleccionado es
-- 'SAP_TARJETAS' (igual que SAP_B1 activa su modo con code 'SAP_B1'). No toca la
-- configuracion SAP_B1 existente.
--
-- En este modo:
--   * lado "sistema" = query OCRH/depositos de tarjeta (columna query_sistema, abajo)
--   * lado "banco"   = CSV de la procesadora subido en pantalla (NO se guarda)
--   * la comparacion es en memoria y no persiste nada.
--
-- Datos de conexion (HANA / Service Layer): se copian de la configuracion SAP
-- existente de la empresa para reusar credenciales/servidor. Ajustar emp_id.
--
-- IMPORTANTE:
--   * NO se marca como predeterminada (epc_es_predeterminado = FALSE) para no
--     desplazar la default SAP_B1 (solo puede haber una default por empresa).
--   * El codigo NO empieza con 'sap_b1', asi el seed 30 (que pisa query_* con
--     WHERE LOWER(epc_codigo) LIKE 'sap_b1%') no lo sobreescribe.
-- =============================================================================

BEGIN;

WITH source_config AS (
  -- Toma la configuracion SAP existente de la empresa (default primero) para
  -- copiar datos de conexion. Cambiar emp_id por la empresa real.
  SELECT cfg.*
  FROM public.empresas_erp_configuraciones cfg
  WHERE cfg.emp_id = 3
  ORDER BY cfg.epc_es_predeterminado DESC, cfg.epc_id ASC
  LIMIT 1
)
INSERT INTO public.empresas_erp_configuraciones (
  emp_id,
  epc_codigo,
  epc_nombre,
  epc_activo,
  epc_es_predeterminado,
  epc_user_system,
  epc_user_pass,
  epc_db_name,
  epc_server_node,
  epc_db_user,
  epc_db_password_enc,
  epc_service_layer_url,
  epc_tls_version,
  epc_allow_self_signed,
  epc_settings,
  query_sistema
)
SELECT
  sc.emp_id,
  'SAP_TARJETAS',
  'SAP Tarjetas de Credito',
  TRUE,
  FALSE,
  sc.epc_user_system,
  sc.epc_user_pass,
  sc.epc_db_name,
  sc.epc_server_node,
  sc.epc_db_user,
  sc.epc_db_password_enc,
  sc.epc_service_layer_url,
  sc.epc_tls_version,
  sc.epc_allow_self_signed,
  sc.epc_settings,
  -- =========================================================================
  -- Query del sistema (OCRH: pagos/vouchers de tarjeta de credito).
  -- Reglas obligatorias del motor (validadas en runtime por
  -- prepareSapB1PreviewQuery):
  --   * una sola sentencia SELECT (sin ;)
  --   * usar "${CompanyDB}" como esquema y $2 = Fecha Desde, $3 = Fecha Hasta
  --   * (opcional) $1 = cuenta mayor; este query NO lo usa
  --   * incluir "AbsId": el deposito del Service Layer lo usa (CreditLines[].AbsId)
  -- Los alias del matching NO van en el SQL: el backend renombra en memoria
  -- VoucherNum->Referencia, PayDate->Fecha, CreditSum->Importe
  -- (sap-tarjetas-system.util.ts). Las demas columnas son informativas.
  -- =========================================================================
  $SIS$
SELECT
  T0."AbsId",
  T0."VoucherNum",
  T0."PayDate",
  T0."CreditSum",
  T0."CreditCurr"
FROM "${CompanyDB}"."OCRH" T0
WHERE T0."Canceled" = 'N'
  AND T0."PayDate" BETWEEN $2 AND $3
$SIS$
FROM source_config sc
ON CONFLICT (emp_id, LOWER(epc_codigo)) DO UPDATE
SET
  epc_nombre = EXCLUDED.epc_nombre,
  epc_activo = EXCLUDED.epc_activo,
  epc_service_layer_url = EXCLUDED.epc_service_layer_url,
  epc_tls_version = EXCLUDED.epc_tls_version,
  epc_allow_self_signed = EXCLUDED.epc_allow_self_signed,
  epc_settings = EXCLUDED.epc_settings,
  query_sistema = EXCLUDED.query_sistema,
  epc_updated_at = NOW();

COMMIT;
