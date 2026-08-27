-- =============================================================================
-- VERIFICACION SOLO LECTURA de las configuraciones ERP copiadas a QA.
-- Compara todos los campos funcionales, incluidas credenciales cifradas,
-- settings, queries, URLs y estados. No expone sus valores.
-- =============================================================================

WITH pairs (source_code, qa_code) AS (
  VALUES
    ('5629621', '5629621_QA'),
    ('FG_TARJETA', 'FG_TARJETA_QA')
), companies AS (
  SELECT
    pair.*,
    source.emp_id AS source_id,
    qa.emp_id AS qa_id
  FROM pairs pair
  LEFT JOIN public.empresas source
    ON LOWER(BTRIM(source.emp_id_fiscal)) = LOWER(pair.source_code)
  LEFT JOIN public.empresas qa
    ON LOWER(BTRIM(qa.emp_id_fiscal)) = LOWER(pair.qa_code)
), comparison AS (
  SELECT
    company.*,
    (SELECT COUNT(*) FROM public.empresas_erp_configuraciones config
     WHERE config.emp_id = company.source_id) AS source_count,
    (SELECT COUNT(*) FROM public.empresas_erp_configuraciones config
     WHERE config.emp_id = company.qa_id) AS qa_count,
    EXISTS (
      SELECT TO_JSONB(config)
        - 'epc_id' - 'emp_id' - 'epc_created_at' - 'epc_updated_at'
      FROM public.empresas_erp_configuraciones config
      WHERE config.emp_id = company.source_id
      EXCEPT
      SELECT TO_JSONB(config)
        - 'epc_id' - 'emp_id' - 'epc_created_at' - 'epc_updated_at'
      FROM public.empresas_erp_configuraciones config
      WHERE config.emp_id = company.qa_id
    ) AS missing_in_qa,
    EXISTS (
      SELECT TO_JSONB(config)
        - 'epc_id' - 'emp_id' - 'epc_created_at' - 'epc_updated_at'
      FROM public.empresas_erp_configuraciones config
      WHERE config.emp_id = company.qa_id
      EXCEPT
      SELECT TO_JSONB(config)
        - 'epc_id' - 'emp_id' - 'epc_created_at' - 'epc_updated_at'
      FROM public.empresas_erp_configuraciones config
      WHERE config.emp_id = company.source_id
    ) AS extra_in_qa
  FROM companies company
)
SELECT
  source_code AS empresa_origen,
  qa_code AS empresa_qa,
  source_count AS erp_origen,
  qa_count AS erp_qa,
  CASE
    WHEN source_id IS NULL THEN 'ERROR: no existe origen'
    WHEN qa_id IS NULL THEN 'ERROR: no existe QA'
    WHEN source_count <> qa_count THEN 'ERROR: cantidad distinta'
    WHEN missing_in_qa THEN 'ERROR: falta configuracion en QA'
    WHEN extra_in_qa THEN 'ERROR: QA tiene configuracion diferente'
    ELSE 'OK: copia ERP exacta'
  END AS resultado
FROM comparison
ORDER BY source_code;

-- Resumen no sensible por configuracion. Deben coincidir codigo, activo y
-- predeterminado entre cada par de empresas.
WITH pairs (source_code, qa_code) AS (
  VALUES
    ('5629621', '5629621_QA'),
    ('FG_TARJETA', 'FG_TARJETA_QA')
)
SELECT
  pair.source_code,
  pair.qa_code,
  source_config.epc_codigo,
  source_config.epc_nombre,
  source_config.epc_activo AS activo_origen,
  qa_config.epc_activo AS activo_qa,
  source_config.epc_es_predeterminado AS predeterminado_origen,
  qa_config.epc_es_predeterminado AS predeterminado_qa
FROM pairs pair
JOIN public.empresas source
  ON LOWER(BTRIM(source.emp_id_fiscal)) = LOWER(pair.source_code)
JOIN public.empresas qa
  ON LOWER(BTRIM(qa.emp_id_fiscal)) = LOWER(pair.qa_code)
JOIN public.empresas_erp_configuraciones source_config
  ON source_config.emp_id = source.emp_id
LEFT JOIN public.empresas_erp_configuraciones qa_config
  ON qa_config.emp_id = qa.emp_id
 AND qa_config.epc_codigo = source_config.epc_codigo
 AND qa_config.epc_nombre = source_config.epc_nombre
ORDER BY pair.source_code, source_config.epc_codigo, source_config.epc_nombre;
