-- =============================================================================
-- Referencia 2 para la conciliacion bancaria exclusiva de OCHO_A.
--
-- Agrega OJDT.Ref2 como "Referencia2" al query del sistema SAP_B1. El backend
-- la usa solo cuando la Referencia principal no coincide con la del banco.
--
-- EJECUCION MANUAL: revisar y ejecutar en la base correspondiente luego de
-- desplegar backend y frontend. No afecta a otras empresas ni a SAP_TARJETAS.
-- =============================================================================

BEGIN;

UPDATE public.empresas_erp_configuraciones cfg
SET
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
  epc_updated_at = NOW()
FROM public.empresas company
WHERE cfg.emp_id = company.emp_id
  AND LOWER(TRIM(company.emp_id_fiscal)) = LOWER('OCHO_A')
  AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_B1')
  AND cfg.epc_activo = TRUE;

-- Verificacion posterior (solo lectura).
SELECT
  company.emp_id_fiscal AS empresa_codigo,
  cfg.epc_codigo AS erp_codigo,
  POSITION('T1."Ref2"' IN cfg.query_sistema) > 0
    AND POSITION('"Referencia2"' IN cfg.query_sistema) > 0
    AS tiene_referencia_2
FROM public.empresas_erp_configuraciones cfg
JOIN public.empresas company
  ON company.emp_id = cfg.emp_id
WHERE LOWER(TRIM(company.emp_id_fiscal)) = LOWER('OCHO_A')
  AND LOWER(TRIM(cfg.epc_codigo)) = LOWER('SAP_B1');

COMMIT;
