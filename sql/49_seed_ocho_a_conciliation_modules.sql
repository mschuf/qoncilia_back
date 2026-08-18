-- =============================================================================
-- Modulos de conciliacion exclusivos de OCHO_A.
--
-- Crea copias separadas para Carga de Extractos y Conciliacion de banco,
-- replica los roles de OCHO_A que hoy tienen los modulos estandar y deshabilita
-- estos ultimos solo para esa empresa. No afecta a las demas empresas.
--
-- EJECUCION MANUAL: revisar y ejecutar en la base correspondiente, luego de
-- desplegar el backend y frontend que incluyen estas rutas y codigos.
-- =============================================================================

BEGIN;

INSERT INTO public.modulos (
  mod_codigo,
  mod_nombre,
  mod_ruta,
  mod_descripcion,
  mod_activo
) VALUES
  (
    'conciliation_ocho_a',
    'Carga de Extractos',
    '/ocho-a/cargar-extractos',
    'Modulo independiente de carga de extractos para OCHO_A.',
    TRUE
  ),
  (
    'bank_conciliation_ocho_a',
    'Conciliacion de banco',
    '/ocho-a/conciliacion-banco',
    'Modulo independiente de conciliacion bancaria para OCHO_A.',
    TRUE
  )
ON CONFLICT (mod_codigo) DO UPDATE
SET
  mod_nombre = EXCLUDED.mod_nombre,
  mod_ruta = EXCLUDED.mod_ruta,
  mod_descripcion = EXCLUDED.mod_descripcion,
  mod_activo = EXCLUDED.mod_activo;

-- Conserva los roles habilitados de los modulos estandar y tambien respeta los
-- roles ya habilitados de los modulos exclusivos en ejecuciones posteriores.
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('OCHO_A')
), module_pairs (source_code, target_code) AS (
  VALUES
    ('conciliation', 'conciliation_ocho_a'),
    ('conciliation_ocho_a', 'conciliation_ocho_a'),
    ('bank_conciliation', 'bank_conciliation_ocho_a'),
    ('bank_conciliation_ocho_a', 'bank_conciliation_ocho_a')
)
INSERT INTO public.empresas_roles_modulos (
  emp_id,
  rol_id,
  mod_id,
  erm_habilitado
)
SELECT DISTINCT
  company.emp_id,
  assignment.rol_id,
  target_module.mod_id,
  TRUE
FROM public.empresas_roles_modulos assignment
JOIN target_company company
  ON company.emp_id = assignment.emp_id
JOIN public.modulos source_module
  ON source_module.mod_id = assignment.mod_id
JOIN module_pairs pair
  ON pair.source_code = source_module.mod_codigo
JOIN public.modulos target_module
  ON target_module.mod_codigo = pair.target_code
WHERE assignment.erm_habilitado = TRUE
ON CONFLICT (emp_id, rol_id, mod_id) DO UPDATE
SET
  erm_habilitado = TRUE,
  erm_updated_at = NOW();

-- OCHO_A deja de ver y usar las rutas estandar; las demas empresas conservan
-- conciliacion y conciliacion bancaria sin cambios.
UPDATE public.empresas_roles_modulos assignment
SET
  erm_habilitado = FALSE,
  erm_updated_at = NOW()
FROM public.empresas company
JOIN public.modulos module
  ON module.mod_codigo IN ('conciliation', 'bank_conciliation')
WHERE assignment.emp_id = company.emp_id
  AND assignment.mod_id = module.mod_id
  AND LOWER(TRIM(company.emp_id_fiscal)) = LOWER('OCHO_A');

-- Verificacion posterior (solo lectura).
SELECT
  company.emp_id_fiscal AS empresa_codigo,
  role.rol_codigo AS rol,
  module.mod_codigo AS modulo,
  assignment.erm_habilitado AS habilitado
FROM public.empresas_roles_modulos assignment
JOIN public.empresas company
  ON company.emp_id = assignment.emp_id
JOIN public.roles role
  ON role.rol_id = assignment.rol_id
JOIN public.modulos module
  ON module.mod_id = assignment.mod_id
WHERE LOWER(TRIM(company.emp_id_fiscal)) = LOWER('OCHO_A')
  AND module.mod_codigo IN (
    'conciliation',
    'bank_conciliation',
    'conciliation_ocho_a',
    'bank_conciliation_ocho_a'
  )
ORDER BY role.rol_codigo, module.mod_codigo;

COMMIT;
