-- =============================================================================
-- VERIFICACION SOLO LECTURA del aislamiento FG QA.
-- Ejecutar despues de 57, 58, 59 y 60. No modifica datos.
-- =============================================================================

-- Debe devolver dos filas con un admin activo cada una.
SELECT
  company.emp_id_fiscal AS empresa,
  COUNT(*) FILTER (
    WHERE user_account.usr_activo = TRUE
      AND LOWER(BTRIM(role.rol_codigo)) = 'admin'
  ) AS admins_activos,
  COUNT(*) AS usuarios_totales
FROM public.empresas company
LEFT JOIN public.usuarios user_account ON user_account.emp_id = company.emp_id
LEFT JOIN public.roles role ON role.rol_id = user_account.rol_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN ('5629621_qa', 'fg_tarjeta_qa')
GROUP BY company.emp_id_fiscal
ORDER BY company.emp_id_fiscal;

-- Debe devolver exactamente las tres combinaciones OK.
WITH expected (company_code, module_code) AS (
  VALUES
    ('5629621_QA', 'conciliation_fg'),
    ('5629621_QA', 'bank_conciliation_fg'),
    ('FG_TARJETA_QA', 'card_payment_fg')
)
SELECT
  expected.company_code AS empresa,
  expected.module_code AS modulo,
  CASE WHEN EXISTS (
    SELECT 1
    FROM public.empresas company
    JOIN public.roles role
      ON LOWER(BTRIM(role.rol_codigo)) = 'admin'
     AND role.rol_activo = TRUE
    JOIN public.modulos module
      ON module.mod_codigo = expected.module_code
     AND module.mod_activo = TRUE
    JOIN public.empresas_roles_modulos assignment
      ON assignment.emp_id = company.emp_id
     AND assignment.rol_id = role.rol_id
     AND assignment.mod_id = module.mod_id
     AND assignment.erm_habilitado = TRUE
    WHERE LOWER(BTRIM(company.emp_id_fiscal)) = LOWER(expected.company_code)
  ) THEN 'OK' ELSE 'ERROR: falta asignacion' END AS resultado
FROM expected
ORDER BY expected.company_code, expected.module_code;

-- Debe devolver cero filas: ningun modulo FG puede estar asignado fuera de QA.
SELECT
  company.emp_id_fiscal AS empresa_no_permitida,
  role.rol_codigo AS rol,
  module.mod_codigo AS modulo,
  assignment.erm_habilitado
FROM public.empresas_roles_modulos assignment
JOIN public.empresas company ON company.emp_id = assignment.emp_id
JOIN public.roles role ON role.rol_id = assignment.rol_id
JOIN public.modulos module ON module.mod_id = assignment.mod_id
WHERE module.mod_codigo IN ('conciliation_fg', 'bank_conciliation_fg', 'card_payment_fg')
  AND LOWER(BTRIM(company.emp_id_fiscal)) NOT IN ('5629621_qa', 'fg_tarjeta_qa');

-- Debe devolver cero filas: las empresas QA no usan los modulos operativos
-- estandar ni los de OCHO_A.
SELECT
  company.emp_id_fiscal AS empresa,
  role.rol_codigo AS rol,
  module.mod_codigo AS modulo_que_debe_quedar_deshabilitado
FROM public.empresas_roles_modulos assignment
JOIN public.empresas company ON company.emp_id = assignment.emp_id
JOIN public.roles role ON role.rol_id = assignment.rol_id
JOIN public.modulos module ON module.mod_id = assignment.mod_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN ('5629621_qa', 'fg_tarjeta_qa')
  AND assignment.erm_habilitado = TRUE
  AND module.mod_codigo IN (
    'conciliation',
    'bank_conciliation',
    'conciliation_ocho_a',
    'bank_conciliation_ocho_a',
    'card_payment',
    'card_payment_ocho_a'
  );

-- Debe devolver cero filas: bancos, cuentas y layouts nunca pueden cruzar de
-- una copia QA a otra empresa.
SELECT 'banco' AS tipo, bank.banco_id AS registro_id, company.emp_id_fiscal AS empresa
FROM public.bancos bank
JOIN public.empresas company ON company.emp_id = bank.empresa_id
JOIN public.usuarios owner ON owner.usr_id = bank.usuario_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN ('5629621_qa', 'fg_tarjeta_qa')
  AND owner.emp_id <> company.emp_id
UNION ALL
SELECT 'cuenta', account.cuenta_bancaria_id, company.emp_id_fiscal
FROM public.cuentas_bancarias account
JOIN public.empresas company ON company.emp_id = account.empresa_id
JOIN public.bancos bank ON bank.banco_id = account.banco_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN ('5629621_qa', 'fg_tarjeta_qa')
  AND bank.empresa_id <> company.emp_id
UNION ALL
SELECT 'plantilla', layout.plantilla_id, company.emp_id_fiscal
FROM public.plantillas_conciliacion layout
JOIN public.bancos bank ON bank.banco_id = layout.banco_id
JOIN public.empresas company ON company.emp_id = bank.empresa_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN ('5629621_qa', 'fg_tarjeta_qa')
  AND bank.empresa_id <> company.emp_id;

-- Inventario operativo. Inmediatamente despues de clonar, extractos y sesiones
-- ERP deben ser cero. La conciliacion bancaria actual es temporal: la tabla
-- public.conciliaciones no existe en el esquema operativo y por eso no se la
-- consulta aqui. Luego de probar, estos contadores pueden crecer solamente en
-- QA.
SELECT
  company.emp_id_fiscal AS empresa,
  (SELECT COUNT(*)
   FROM public.extractos_bancarios statement
   JOIN public.usuarios owner ON owner.usr_id = statement.usuario_id
   WHERE owner.emp_id = company.emp_id) AS extractos,
  (SELECT COUNT(*)
   FROM public.usuarios_erp_sesiones session
   JOIN public.usuarios owner ON owner.usr_id = session.usuario_id
   WHERE owner.emp_id = company.emp_id) AS sesiones_erp
FROM public.empresas company
WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN ('5629621_qa', 'fg_tarjeta_qa')
ORDER BY company.emp_id_fiscal;

-- Repeticion compacta de la paridad ERP. Debe devolver dos filas OK.
WITH pairs (source_code, qa_code) AS (
  VALUES ('5629621', '5629621_QA'), ('FG_TARJETA', 'FG_TARJETA_QA')
), companies AS (
  SELECT pair.*, source.emp_id AS source_id, qa.emp_id AS qa_id
  FROM pairs pair
  LEFT JOIN public.empresas source
    ON LOWER(BTRIM(source.emp_id_fiscal)) = LOWER(pair.source_code)
  LEFT JOIN public.empresas qa
    ON LOWER(BTRIM(qa.emp_id_fiscal)) = LOWER(pair.qa_code)
)
SELECT
  company.qa_code AS empresa,
  CASE WHEN
    company.source_id IS NOT NULL
    AND company.qa_id IS NOT NULL
    AND NOT EXISTS (
      SELECT TO_JSONB(config) - 'epc_id' - 'emp_id' - 'epc_created_at' - 'epc_updated_at'
      FROM public.empresas_erp_configuraciones config WHERE config.emp_id = company.source_id
      EXCEPT
      SELECT TO_JSONB(config) - 'epc_id' - 'emp_id' - 'epc_created_at' - 'epc_updated_at'
      FROM public.empresas_erp_configuraciones config WHERE config.emp_id = company.qa_id
    )
    AND NOT EXISTS (
      SELECT TO_JSONB(config) - 'epc_id' - 'emp_id' - 'epc_created_at' - 'epc_updated_at'
      FROM public.empresas_erp_configuraciones config WHERE config.emp_id = company.qa_id
      EXCEPT
      SELECT TO_JSONB(config) - 'epc_id' - 'emp_id' - 'epc_created_at' - 'epc_updated_at'
      FROM public.empresas_erp_configuraciones config WHERE config.emp_id = company.source_id
    )
  THEN 'OK' ELSE 'ERROR' END AS erp_config_identica
FROM companies company
ORDER BY company.qa_code;
