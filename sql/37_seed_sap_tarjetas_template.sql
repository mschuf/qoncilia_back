-- =============================================================================
-- PLANTILLA ERP global "SAP_TARJETAS" con el query OCRH ya incluido.
--
-- Es una plantilla (erp_configuraciones_plantillas), NO una config por empresa.
-- Aparece en ERP Management; desde ahi se completa (credenciales HANA) y se copia
-- ("asignar") a la/las empresas que quieras. Al copiar, el query_sistema viaja a
-- la config de la empresa (cloneTemplateToCompanyConfig ya lo propaga).
--
-- Requiere antes: sql/36_add_template_erp_queries.sql (columnas query_* en plantillas).
--
-- Credenciales HANA (ept_db_user / password) van NULL: cargalas por la UI para que
-- la app las cifre. El codigo DEBE ser exactamente SAP_TARJETAS (lo exige el front
-- y el gate ensureSapTarjetasConfig del backend).
-- =============================================================================

BEGIN;

INSERT INTO public.erp_configuraciones_plantillas (
  ept_codigo,
  ept_nombre,
  ept_activo,
  ept_es_predeterminado,
  ept_db_name,
  ept_server_node,
  ept_db_user,
  ept_db_password_enc,
  ept_service_layer_url,
  ept_tls_version,
  ept_allow_self_signed,
  ept_settings,
  query_sistema
)
VALUES (
  'SAP_TARJETAS',
  'SAP Tarjetas de Credito',
  TRUE,
  FALSE,
  'FG_DESARROLLO',             -- CompanyDB (esquema HANA). AJUSTAR si cambia de servidor.
  NULL,                         -- AJUSTAR por UI: Server Node HANA (obligatorio para correr el query)
  NULL,                         -- AJUSTAR por UI: DB user HANA
  NULL,                         -- AJUSTAR por UI: DB password (se cifra al guardar)
  'https://172.19.0.88:50000/b1s/v2',
  '1.2',
  TRUE,
  jsonb_build_object(
    'sessionCheckPath', 'BankPages?$top=1'
  ),
  -- ---------------------------------------------------------------------------
  -- Query OCRH (pagos/vouchers de tarjeta de credito de SAP B1). Obligatorio:
  --   * un solo SELECT (sin ;)  * "${CompanyDB}" como esquema  * $2 = Fecha Desde, $3 = Fecha Hasta
  --   * incluir "AbsId": el deposito del Service Layer lo usa (CreditLines[].AbsId)
  -- Los alias del matching NO van en el SQL: el backend renombra en memoria
  -- VoucherNum->Referencia, PayDate->Fecha, CreditSum->Importe
  -- (sap-tarjetas-system.util.ts). Si el cod. de autorizacion va en ConfNum,
  -- ajusta ese mapeo, no este query.
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
)
ON CONFLICT (LOWER(ept_codigo)) DO UPDATE
SET
  ept_nombre = EXCLUDED.ept_nombre,
  ept_activo = EXCLUDED.ept_activo,
  ept_db_name = EXCLUDED.ept_db_name,
  ept_service_layer_url = EXCLUDED.ept_service_layer_url,
  ept_tls_version = EXCLUDED.ept_tls_version,
  ept_allow_self_signed = EXCLUDED.ept_allow_self_signed,
  ept_settings = EXCLUDED.ept_settings,
  query_sistema = EXCLUDED.query_sistema,
  ept_updated_at = NOW();

COMMIT;
