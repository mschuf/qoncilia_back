-- =============================================================================
-- Modulos FG EXCLUSIVOS para las empresas QA clonadas.
--
-- 5629621_QA    -> carga de extractos y conciliacion bancaria FG
-- FG_TARJETA_QA -> pagos de tarjetas FG
--
-- No asigna estos modulos a empresas productivas ni a OCHO_A. Deshabilita los
-- modulos operativos estandar/OCHO_A solamente dentro de las dos copias QA.
-- EJECUCION MANUAL despues de desplegar backend y frontend FG.
-- =============================================================================

BEGIN;

-- Esta instancia fue confirmada como la base de produccion. La asignacion se
-- limita a las copias QA y aborta si se ejecuta contra otra base.
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
  qa_company_count INTEGER;
  admin_role_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO qa_company_count
  FROM public.empresas
  WHERE LOWER(BTRIM(emp_id_fiscal)) IN ('5629621_qa', 'fg_tarjeta_qa')
    AND emp_activa = TRUE;

  IF qa_company_count <> 2 THEN
    RAISE EXCEPTION
      'Deben existir y estar activas 5629621_QA y FG_TARJETA_QA. Encontradas: %.',
      qa_company_count;
  END IF;

  SELECT COUNT(*) INTO admin_role_count
  FROM public.roles
  WHERE LOWER(BTRIM(rol_codigo)) = 'admin'
    AND rol_activo = TRUE;

  IF admin_role_count <> 1 THEN
    RAISE EXCEPTION 'Debe existir exactamente un rol admin activo. Encontrados: %.', admin_role_count;
  END IF;
END;
$$;

INSERT INTO public.modulos (
  mod_codigo,
  mod_nombre,
  mod_ruta,
  mod_descripcion,
  mod_activo
) VALUES
  (
    'conciliation_fg',
    'Carga de Extractos FG',
    '/fg/cargar-extractos',
    'Modulo independiente de carga de extractos para FG.',
    TRUE
  ),
  (
    'bank_conciliation_fg',
    'Conciliacion de Banco FG',
    '/fg/conciliacion-banco',
    'Modulo independiente de conciliacion bancaria para FG.',
    TRUE
  ),
  (
    'card_payment_fg',
    'Pagos Tarjetas FG',
    '/pago-tarjeta-fg/debito',
    'Modulo independiente de pagos de tarjetas debito y credito para FG.',
    TRUE
  )
ON CONFLICT (mod_codigo) DO NOTHING;

-- Si un codigo ya existia con otra definicion, se aborta sin sobrescribirlo.
DO $$
DECLARE
  invalid_module_count INTEGER;
  foreign_assignment_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_module_count
  FROM public.modulos module
  JOIN (
    VALUES
      ('conciliation_fg', 'Carga de Extractos FG', '/fg/cargar-extractos'),
      ('bank_conciliation_fg', 'Conciliacion de Banco FG', '/fg/conciliacion-banco'),
      ('card_payment_fg', 'Pagos Tarjetas FG', '/pago-tarjeta-fg/debito')
  ) expected(code, name, route)
    ON expected.code = module.mod_codigo
  WHERE module.mod_nombre <> expected.name
     OR module.mod_ruta <> expected.route
     OR module.mod_activo IS NOT TRUE;

  IF invalid_module_count <> 0 THEN
    RAISE EXCEPTION 'Un modulo FG ya existe con nombre, ruta o estado diferente. No fue sobrescrito.';
  END IF;

  SELECT COUNT(*) INTO foreign_assignment_count
  FROM public.empresas_roles_modulos assignment
  JOIN public.empresas company ON company.emp_id = assignment.emp_id
  JOIN public.modulos module ON module.mod_id = assignment.mod_id
  WHERE module.mod_codigo IN ('conciliation_fg', 'bank_conciliation_fg', 'card_payment_fg')
    AND LOWER(BTRIM(company.emp_id_fiscal)) NOT IN ('5629621_qa', 'fg_tarjeta_qa');

  IF foreign_assignment_count <> 0 THEN
    RAISE EXCEPTION
      'Ya existen % asignaciones FG fuera de las empresas QA. Se cancela para proteger otros tenants.',
      foreign_assignment_count;
  END IF;
END;
$$;

WITH desired (company_code, module_code) AS (
  VALUES
    ('5629621_QA', 'conciliation_fg'),
    ('5629621_QA', 'bank_conciliation_fg'),
    ('FG_TARJETA_QA', 'card_payment_fg')
)
INSERT INTO public.empresas_roles_modulos (
  emp_id,
  rol_id,
  mod_id,
  erm_habilitado
)
SELECT
  company.emp_id,
  role.rol_id,
  module.mod_id,
  TRUE
FROM desired
JOIN public.empresas company
  ON LOWER(BTRIM(company.emp_id_fiscal)) = LOWER(desired.company_code)
JOIN public.roles role
  ON LOWER(BTRIM(role.rol_codigo)) = 'admin'
 AND role.rol_activo = TRUE
JOIN public.modulos module
  ON module.mod_codigo = desired.module_code
ON CONFLICT (emp_id, rol_id, mod_id) DO UPDATE
SET
  erm_habilitado = TRUE,
  erm_updated_at = NOW();

-- Quita de las copias QA las entradas operativas heredadas del origen. No toca
-- home, perfil, usuarios ni configuracion administrativa.
WITH allowed (company_code, module_code) AS (
  VALUES
    ('5629621_QA', 'conciliation_fg'),
    ('5629621_QA', 'bank_conciliation_fg'),
    ('FG_TARJETA_QA', 'card_payment_fg')
)
UPDATE public.empresas_roles_modulos assignment
SET
  erm_habilitado = FALSE,
  erm_updated_at = NOW()
FROM public.empresas company
JOIN public.modulos module
  ON module.mod_codigo IN (
    'conciliation',
    'bank_conciliation',
    'conciliation_ocho_a',
    'bank_conciliation_ocho_a',
    'card_payment',
    'card_payment_ocho_a',
    'conciliation_fg',
    'bank_conciliation_fg',
    'card_payment_fg'
  )
WHERE assignment.emp_id = company.emp_id
  AND assignment.mod_id = module.mod_id
  AND LOWER(BTRIM(company.emp_id_fiscal)) IN ('5629621_qa', 'fg_tarjeta_qa')
  AND NOT EXISTS (
    SELECT 1
    FROM allowed
    WHERE LOWER(allowed.company_code) = LOWER(BTRIM(company.emp_id_fiscal))
      AND allowed.module_code = module.mod_codigo
  );

-- Verificacion posterior. Debe mostrar exactamente tres filas habilitadas.
SELECT
  company.emp_id_fiscal AS empresa,
  role.rol_codigo AS rol,
  module.mod_codigo AS modulo,
  module.mod_ruta AS ruta,
  assignment.erm_habilitado AS habilitado
FROM public.empresas_roles_modulos assignment
JOIN public.empresas company ON company.emp_id = assignment.emp_id
JOIN public.roles role ON role.rol_id = assignment.rol_id
JOIN public.modulos module ON module.mod_id = assignment.mod_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) IN ('5629621_qa', 'fg_tarjeta_qa')
  AND module.mod_codigo IN ('conciliation_fg', 'bank_conciliation_fg', 'card_payment_fg')
ORDER BY company.emp_id_fiscal, role.rol_codigo, module.mod_codigo;

COMMIT;
