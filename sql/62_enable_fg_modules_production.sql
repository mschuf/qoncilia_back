-- =============================================================================
-- PROMOCION MANUAL POSTERIOR A PRODUCCION.
--
-- NO ejecutar durante QA. Ejecutar solamente despues de aprobar payloads SAP
-- y desplegar el backend FG que admite los codigos productivos.
-- Asigna modulos FG a los mismos roles que hoy tienen los modulos estandar y
-- deshabilita solamente esos modulos heredados en las dos empresas FG.
-- No cambia bancos, cuentas, layouts, ERP, usuarios ni datos operativos.
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

DO $$
DECLARE
  source_company_count INTEGER;
  fg_module_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO source_company_count
  FROM public.empresas
  WHERE LOWER(BTRIM(emp_id_fiscal)) IN ('5629621', 'fg_tarjeta')
    AND emp_activa = TRUE;

  IF source_company_count <> 2 THEN
    RAISE EXCEPTION 'No se encontraron las dos empresas FG productivas activas.';
  END IF;

  SELECT COUNT(*) INTO fg_module_count
  FROM public.modulos
  WHERE mod_codigo IN ('conciliation_fg', 'bank_conciliation_fg', 'card_payment_fg')
    AND mod_activo = TRUE;

  IF fg_module_count <> 3 THEN
    RAISE EXCEPTION 'Faltan modulos FG activos. Despliega codigo y crea los modulos antes de promover.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.empresas_roles_modulos assignment
    JOIN public.empresas company ON company.emp_id = assignment.emp_id
    JOIN public.modulos module ON module.mod_id = assignment.mod_id
    WHERE module.mod_codigo IN ('conciliation_fg', 'bank_conciliation_fg', 'card_payment_fg')
      AND LOWER(BTRIM(company.emp_id_fiscal)) NOT IN (
        '5629621', 'fg_tarjeta', '5629621_qa', 'fg_tarjeta_qa'
      )
  ) THEN
    RAISE EXCEPTION 'Hay asignaciones FG en empresas no autorizadas. Revisar antes de promover.';
  END IF;
END;
$$;

WITH module_pairs (company_code, source_module, target_module) AS (
  VALUES
    ('5629621', 'conciliation', 'conciliation_fg'),
    ('5629621', 'bank_conciliation', 'bank_conciliation_fg'),
    ('FG_TARJETA', 'card_payment', 'card_payment_fg')
)
INSERT INTO public.empresas_roles_modulos (
  emp_id,
  rol_id,
  mod_id,
  erm_habilitado
)
SELECT DISTINCT
  company.emp_id,
  source_assignment.rol_id,
  target_module.mod_id,
  TRUE
FROM module_pairs pair
JOIN public.empresas company
  ON LOWER(BTRIM(company.emp_id_fiscal)) = LOWER(pair.company_code)
JOIN public.modulos source_module
  ON source_module.mod_codigo = pair.source_module
JOIN public.empresas_roles_modulos source_assignment
  ON source_assignment.emp_id = company.emp_id
 AND source_assignment.mod_id = source_module.mod_id
 AND source_assignment.erm_habilitado = TRUE
JOIN public.modulos target_module
  ON target_module.mod_codigo = pair.target_module
 AND target_module.mod_activo = TRUE
ON CONFLICT (emp_id, rol_id, mod_id) DO UPDATE
SET
  erm_habilitado = TRUE,
  erm_updated_at = NOW();

-- La promocion reemplaza las rutas estandar exclusivamente para las dos
-- empresas FG. No deshabilita ni cambia modulos de OCHO_A u otros tenants.
WITH legacy_modules (company_code, module_code) AS (
  VALUES
    ('5629621', 'conciliation'),
    ('5629621', 'bank_conciliation'),
    ('FG_TARJETA', 'card_payment')
)
UPDATE public.empresas_roles_modulos assignment
SET
  erm_habilitado = FALSE,
  erm_updated_at = NOW()
FROM legacy_modules legacy
JOIN public.empresas company
  ON LOWER(BTRIM(company.emp_id_fiscal)) = LOWER(legacy.company_code)
JOIN public.modulos module
  ON module.mod_codigo = legacy.module_code
WHERE assignment.emp_id = company.emp_id
  AND assignment.mod_id = module.mod_id
  AND assignment.erm_habilitado = TRUE;

-- Solo lectura: revisar roles habilitados antes de COMMIT.
SELECT
  company.emp_id_fiscal AS empresa,
  role.rol_codigo AS rol,
  module.mod_codigo AS modulo,
  assignment.erm_habilitado AS habilitado
FROM public.empresas_roles_modulos assignment
JOIN public.empresas company ON company.emp_id = assignment.emp_id
JOIN public.roles role ON role.rol_id = assignment.rol_id
JOIN public.modulos module ON module.mod_id = assignment.mod_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN ('5629621', 'fg_tarjeta')
  AND module.mod_codigo IN ('conciliation_fg', 'bank_conciliation_fg', 'card_payment_fg')
ORDER BY company.emp_id_fiscal, role.rol_codigo, module.mod_codigo;

-- Debe devolver cero filas: los modulos heredados quedan deshabilitados solo
-- para los flujos que FG ya reemplazo.
WITH legacy_modules (company_code, module_code) AS (
  VALUES
    ('5629621', 'conciliation'),
    ('5629621', 'bank_conciliation'),
    ('FG_TARJETA', 'card_payment')
)
SELECT
  company.emp_id_fiscal AS empresa,
  role.rol_codigo AS rol,
  module.mod_codigo AS modulo_heredado_habilitado
FROM public.empresas_roles_modulos assignment
JOIN public.empresas company ON company.emp_id = assignment.emp_id
JOIN public.roles role ON role.rol_id = assignment.rol_id
JOIN public.modulos module ON module.mod_id = assignment.mod_id
JOIN legacy_modules legacy
  ON LOWER(BTRIM(company.emp_id_fiscal)) = LOWER(legacy.company_code)
 AND module.mod_codigo = legacy.module_code
WHERE assignment.erm_habilitado = TRUE
ORDER BY company.emp_id_fiscal, role.rol_codigo, module.mod_codigo;

COMMIT;
