-- =============================================================================
-- SAP_TARJETAS para la EMPRESA DE PRUEBA (emp_id = 4) — SOLO afecta a emp_id 4.
--
-- Crea/actualiza una configuracion ERP con codigo EXACTO 'SAP_TARJETAS' para la
-- empresa 4, copiando los datos de conexion HANA/Service Layer de la propia
-- configuracion SAP existente de la empresa 4 (asi la password queda cifrada con
-- el mismo secreto de la app, sin tener que reencriptar nada).
--
-- Requisito: la empresa 4 ya debe tener al menos una configuracion SAP con
-- credenciales HANA (epc_db_user + epc_db_password_enc + epc_server_node +
-- epc_db_name). Si NO la tiene, este script no inserta nada (source vacio): en
-- ese caso crea la config por la UI de ERP Management cargando las credenciales.
--
-- NO se marca como predeterminada para no desplazar otra config default de la 4.
-- =============================================================================

BEGIN;

WITH source_config AS (
  -- SOLO empresa 4. Toma su config SAP existente (default primero) como origen de
  -- credenciales. Si quisieras apuntar al SAP de desarrollo de la empresa 3,
  -- cambia el WHERE a `emp_id = 3` (eso lee la 3 pero NO la modifica).
  SELECT *
  FROM public.empresas_erp_configuraciones
  WHERE emp_id = 4
    AND epc_db_user IS NOT NULL
    AND epc_db_password_enc IS NOT NULL
  ORDER BY epc_es_predeterminado DESC, epc_id ASC
  LIMIT 1
)
INSERT INTO public.empresas_erp_configuraciones (
  emp_id, epc_codigo, epc_nombre, epc_activo, epc_es_predeterminado,
  epc_user_system, epc_user_pass, epc_db_name, epc_server_node,
  epc_db_user, epc_db_password_enc, epc_service_layer_url, epc_tls_version,
  epc_allow_self_signed, epc_settings, query_sistema
)
SELECT
  4,
  'SAP_TARJETAS',
  'SAP Tarjetas de Credito (prueba)',
  TRUE,
  FALSE,
  sc.epc_user_system, sc.epc_user_pass, sc.epc_db_name, sc.epc_server_node,
  sc.epc_db_user, sc.epc_db_password_enc, sc.epc_service_layer_url, sc.epc_tls_version,
  sc.epc_allow_self_signed, sc.epc_settings,
  -- ---------------------------------------------------------------------------
  -- Query OCRH (pagos/vouchers de tarjeta). Obligatorio:
  --   * un solo SELECT (sin ;)  * "${CompanyDB}" como esquema  * $2 = Fecha Desde, $3 = Fecha Hasta
  --   * incluir "AbsId" (el deposito del Service Layer usa CreditLines[].AbsId)
  -- Alias del matching: los renombra el backend (VoucherNum->Referencia,
  -- PayDate->Fecha, CreditSum->Importe en sap-tarjetas-system.util.ts).
  -- ---------------------------------------------------------------------------
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
  epc_db_name = EXCLUDED.epc_db_name,
  epc_server_node = EXCLUDED.epc_server_node,
  epc_db_user = EXCLUDED.epc_db_user,
  epc_db_password_enc = EXCLUDED.epc_db_password_enc,
  epc_service_layer_url = EXCLUDED.epc_service_layer_url,
  epc_tls_version = EXCLUDED.epc_tls_version,
  epc_allow_self_signed = EXCLUDED.epc_allow_self_signed,
  epc_settings = EXCLUDED.epc_settings,
  query_sistema = EXCLUDED.query_sistema,
  epc_updated_at = NOW();

-- Verificacion (solo empresa 4):
-- SELECT epc_id, epc_codigo, epc_activo, epc_db_user, (epc_db_password_enc IS NOT NULL) AS has_pass, query_sistema
-- FROM public.empresas_erp_configuraciones WHERE emp_id = 4 AND LOWER(epc_codigo) = 'sap_tarjetas';

COMMIT;
