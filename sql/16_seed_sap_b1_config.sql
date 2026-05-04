BEGIN;

-- Cambiar este valor por el emp_id real de la empresa que va a usar SAP.
WITH target_company AS (
  SELECT e.emp_id
  FROM public.empresas e
  WHERE e.emp_id = 1
)
UPDATE public.empresas_erp_configuraciones cfg
SET
  epc_es_predeterminado = FALSE,
  epc_updated_at = NOW()
FROM target_company tc
WHERE cfg.emp_id = tc.emp_id
  AND LOWER(cfg.epc_codigo) <> LOWER('SAP_B1_PROD');

WITH target_company AS (
  SELECT e.emp_id
  FROM public.empresas e
  WHERE e.emp_id = 1
)
INSERT INTO public.empresas_erp_configuraciones (
  emp_id,
  epc_codigo,
  epc_nombre,
  epc_tipo,
  epc_descripcion,
  epc_activo,
  epc_es_predeterminado,
  epc_sap_username,
  epc_db_name,
  epc_cmp_name,
  epc_server_node,
  epc_db_user,
  epc_db_password_enc,
  epc_service_layer_url,
  epc_tls_version,
  epc_allow_self_signed,
  epc_settings
)
SELECT
  tc.emp_id,
  'SAP_B1_PROD',
  'SAP Business One Produccion',
  'sap_b1',
  'SAP B1 Service Layer para conciliacion de depositos.',
  TRUE,
  TRUE,
  NULL,
  'IT_FG_DESARROLLO',
  NULL,
  NULL,
  NULL,
  NULL,
  'https://172.19.0.88:50000/b1s/v2',
  '1.2',
  TRUE,
  jsonb_build_object(
    'depositEndpoint', 'Deposits',
    'sessionCheckPath', 'Deposits?$top=1',
    'creditCardsAsCreditLines', TRUE
  )
FROM target_company tc
ON CONFLICT (emp_id, LOWER(epc_codigo)) DO UPDATE
SET
  epc_nombre = EXCLUDED.epc_nombre,
  epc_tipo = EXCLUDED.epc_tipo,
  epc_descripcion = EXCLUDED.epc_descripcion,
  epc_activo = EXCLUDED.epc_activo,
  epc_es_predeterminado = EXCLUDED.epc_es_predeterminado,
  epc_sap_username = EXCLUDED.epc_sap_username,
  epc_db_name = EXCLUDED.epc_db_name,
  epc_cmp_name = EXCLUDED.epc_cmp_name,
  epc_server_node = EXCLUDED.epc_server_node,
  epc_db_user = EXCLUDED.epc_db_user,
  epc_db_password_enc = EXCLUDED.epc_db_password_enc,
  epc_service_layer_url = EXCLUDED.epc_service_layer_url,
  epc_tls_version = EXCLUDED.epc_tls_version,
  epc_allow_self_signed = EXCLUDED.epc_allow_self_signed,
  epc_settings = EXCLUDED.epc_settings,
  epc_updated_at = NOW();

COMMIT;
