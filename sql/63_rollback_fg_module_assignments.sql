-- =============================================================================
-- ROLLBACK RECUPERABLE FG.
-- Deshabilita asignaciones de modulos FG en QA y produccion, y desactiva las
-- ERP solamente de las copias QA. No borra empresas, usuarios, bancos,
-- cuentas, layouts, mappings, ERP ni historiales.
--
-- EJECUCION MANUAL: revisar el alcance antes de ejecutar.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  expected_database CONSTANT TEXT := 'QONCILIA_BACK';
BEGIN
  IF current_database() <> expected_database THEN
    RAISE EXCEPTION 'Base incorrecta. Esperada %, actual %.', expected_database, current_database();
  END IF;
END;
$$;

UPDATE public.empresas_roles_modulos assignment
SET
  erm_habilitado = FALSE,
  erm_updated_at = NOW()
FROM public.empresas company
JOIN public.modulos module
  ON module.mod_codigo IN ('conciliation_fg', 'bank_conciliation_fg', 'card_payment_fg')
WHERE assignment.emp_id = company.emp_id
  AND assignment.mod_id = module.mod_id
  AND LOWER(BTRIM(company.emp_id_fiscal)) IN (
    '5629621',
    'fg_tarjeta',
    '5629621_qa',
    'fg_tarjeta_qa'
  );

-- La configuracion ERP productiva no se modifica. Solo se impide que las
-- copias QA sigan iniciando nuevas operaciones ERP durante el rollback.
UPDATE public.empresas_erp_configuraciones config
SET
  epc_activo = FALSE,
  epc_updated_at = NOW()
FROM public.empresas company
WHERE config.emp_id = company.emp_id
  AND LOWER(BTRIM(company.emp_id_fiscal)) IN ('5629621_qa', 'fg_tarjeta_qa');

-- Verificacion posterior.
SELECT
  company.emp_id_fiscal AS empresa,
  module.mod_codigo AS modulo,
  assignment.erm_habilitado AS habilitado
FROM public.empresas_roles_modulos assignment
JOIN public.empresas company ON company.emp_id = assignment.emp_id
JOIN public.modulos module ON module.mod_id = assignment.mod_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN (
    '5629621', 'fg_tarjeta', '5629621_qa', 'fg_tarjeta_qa'
  )
  AND module.mod_codigo IN ('conciliation_fg', 'bank_conciliation_fg', 'card_payment_fg')
ORDER BY company.emp_id_fiscal, module.mod_codigo;

SELECT
  company.emp_id_fiscal AS empresa_qa,
  config.epc_codigo AS erp,
  config.epc_nombre AS nombre,
  config.epc_activo AS activa
FROM public.empresas_erp_configuraciones config
JOIN public.empresas company ON company.emp_id = config.emp_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN ('5629621_qa', 'fg_tarjeta_qa')
ORDER BY company.emp_id_fiscal, config.epc_codigo, config.epc_nombre;

COMMIT;
