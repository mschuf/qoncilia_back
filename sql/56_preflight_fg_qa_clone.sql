-- =============================================================================
-- PREFLIGHT SOLO LECTURA para las copias FG de QA.
-- No inserta, actualiza ni elimina datos. Ejecutar antes de 57 y 58.
-- =============================================================================

-- Verifica que la conexion sea la base esperada por los scripts de escritura:
-- QONCILIA_BACK. No modifica datos.
SELECT current_database() AS base_actual_para_expected_database;

-- Debe devolver exactamente dos filas, ambas activas y con empresa_qa_id NULL.
WITH targets (source_code, qa_code, required_erp, required_module, admin_login) AS (
  VALUES
    ('5629621', '5629621_QA', 'SAP_B1', 'bank_conciliation', 'qa.conciliacion.admin'),
    ('FG_TARJETA', 'FG_TARJETA_QA', 'SAP_TARJETAS', 'card_payment', 'qa.tarjetas.admin')
)
SELECT
  target.source_code,
  source.emp_id AS empresa_origen_id,
  source.emp_nombre AS empresa_origen,
  source.emp_activa AS origen_activo,
  qa.emp_id AS empresa_qa_id,
  CASE
    WHEN source.emp_id IS NULL THEN 'ERROR: no existe origen'
    WHEN source.emp_activa IS NOT TRUE THEN 'ERROR: origen inactivo'
    WHEN qa.emp_id IS NOT NULL THEN 'ERROR: ya existe QA; no ejecutar clonacion'
    ELSE 'OK'
  END AS estado
FROM targets target
LEFT JOIN public.empresas source
  ON LOWER(BTRIM(source.emp_id_fiscal)) = LOWER(target.source_code)
LEFT JOIN public.empresas qa
  ON LOWER(BTRIM(qa.emp_id_fiscal)) = LOWER(target.qa_code)
ORDER BY target.source_code;

-- Debe devolver cuatro comprobaciones OK.
WITH targets (source_code, required_erp, required_module) AS (
  VALUES
    ('5629621', 'SAP_B1', 'bank_conciliation'),
    ('FG_TARJETA', 'SAP_TARJETAS', 'card_payment')
), source_companies AS (
  SELECT target.*, company.emp_id
  FROM targets target
  LEFT JOIN public.empresas company
    ON LOWER(BTRIM(company.emp_id_fiscal)) = LOWER(target.source_code)
)
SELECT
  source.source_code,
  'ERP activa ' || source.required_erp AS comprobacion,
  CASE WHEN EXISTS (
    SELECT 1
    FROM public.empresas_erp_configuraciones config
    WHERE config.emp_id = source.emp_id
      AND LOWER(BTRIM(config.epc_codigo)) = LOWER(source.required_erp)
      AND config.epc_activo = TRUE
  ) THEN 'OK' ELSE 'ERROR' END AS estado
FROM source_companies source
UNION ALL
SELECT
  source.source_code,
  'Modulo admin ' || source.required_module,
  CASE WHEN EXISTS (
    SELECT 1
    FROM public.empresas_roles_modulos assignment
    JOIN public.roles role ON role.rol_id = assignment.rol_id
    JOIN public.modulos module ON module.mod_id = assignment.mod_id
    WHERE assignment.emp_id = source.emp_id
      AND LOWER(BTRIM(role.rol_codigo)) = 'admin'
      AND LOWER(BTRIM(module.mod_codigo)) = LOWER(source.required_module)
      AND assignment.erm_habilitado = TRUE
  ) THEN 'OK' ELSE 'ERROR' END
FROM source_companies source
ORDER BY source_code, comprobacion;

-- Inventario origen que debe conservarse en las copias.
WITH sources AS (
  SELECT emp_id, emp_id_fiscal
  FROM public.empresas
  WHERE LOWER(BTRIM(emp_id_fiscal)) IN ('5629621', 'fg_tarjeta')
)
SELECT
  source.emp_id_fiscal AS empresa,
  (SELECT COUNT(*) FROM public.empresas_erp_configuraciones config
   WHERE config.emp_id = source.emp_id) AS erp_configuraciones,
  (SELECT COUNT(*) FROM public.bancos bank
   WHERE bank.empresa_id = source.emp_id AND bank.banco_origen_id IS NULL) AS bancos_raiz,
  (SELECT COUNT(*) FROM public.cuentas_bancarias account
   WHERE account.empresa_id = source.emp_id AND account.cuenta_bancaria_origen_id IS NULL) AS cuentas_raiz,
  (SELECT COUNT(*)
   FROM public.plantillas_conciliacion layout
   JOIN public.bancos bank ON bank.banco_id = layout.banco_id
   WHERE bank.empresa_id = source.emp_id AND bank.banco_origen_id IS NULL) AS plantillas,
  (SELECT COUNT(*)
   FROM public.plantillas_conciliacion_mapeos mapping
   JOIN public.plantillas_conciliacion layout ON layout.plantilla_id = mapping.plantilla_id
   JOIN public.bancos bank ON bank.banco_id = layout.banco_id
   WHERE bank.empresa_id = source.emp_id AND bank.banco_origen_id IS NULL) AS mappings
FROM sources source
ORDER BY source.emp_id_fiscal;

-- Debe devolver cero filas. Si devuelve algo, resolver la colision antes de
-- ejecutar la clonacion.
SELECT usr_id, usr_login, usr_legajo, emp_id
FROM public.usuarios
WHERE LOWER(BTRIM(usr_login)) IN ('qa.conciliacion.admin', 'qa.tarjetas.admin')
   OR LOWER(BTRIM(usr_legajo)) IN ('qa.conciliacion.admin', 'qa.tarjetas.admin');
