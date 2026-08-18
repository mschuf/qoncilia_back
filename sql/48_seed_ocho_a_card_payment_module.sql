-- =============================================================================
-- Modulo de Pago de tarjeta exclusivo de OCHO A.
--
-- Crea card_payment_ocho_a (/pago-tarjeta-8a), replica los roles que hoy tienen
-- card_payment en OCHO_A y deshabilita el modulo estandar solo para esa empresa.
-- No afecta a FG_TARJETA ni a ninguna otra empresa.
--
-- EJECUCION MANUAL: revisar y ejecutar en la base correspondiente.
-- =============================================================================

BEGIN;

INSERT INTO public.modulos (
  mod_codigo,
  mod_nombre,
  mod_ruta,
  mod_descripcion,
  mod_activo
) VALUES (
  'card_payment_ocho_a',
  'Pagos Tarjetas',
  '/pago-tarjeta-8a/debito',
  'Modulo independiente de pagos de tarjetas debito y credito para OCHO A.',
  TRUE
)
ON CONFLICT (mod_codigo) DO UPDATE
SET
  mod_nombre = EXCLUDED.mod_nombre,
  mod_ruta = EXCLUDED.mod_ruta,
  mod_descripcion = EXCLUDED.mod_descripcion,
  mod_activo = EXCLUDED.mod_activo;

-- Conserva exactamente los roles que ya tenian acceso al modulo estandar.
-- En ejecuciones posteriores tambien respeta los roles ya habilitados en el
-- modulo 8A, para que el script sea idempotente.
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('OCHO_A')
), source_modules AS (
  SELECT mod_id
  FROM public.modulos
  WHERE mod_codigo IN ('card_payment', 'card_payment_ocho_a')
), target_module AS (
  SELECT mod_id
  FROM public.modulos
  WHERE mod_codigo = 'card_payment_ocho_a'
), source_roles AS (
  SELECT DISTINCT erm.rol_id
  FROM public.empresas_roles_modulos erm
  JOIN target_company company
    ON company.emp_id = erm.emp_id
  JOIN source_modules module
    ON module.mod_id = erm.mod_id
  WHERE erm.erm_habilitado = TRUE
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
FROM target_company company
CROSS JOIN source_roles role
CROSS JOIN target_module module
ON CONFLICT (emp_id, rol_id, mod_id) DO UPDATE
SET
  erm_habilitado = TRUE,
  erm_updated_at = NOW();

-- OCHO A deja de ver y usar /pago-tarjeta; las demas empresas conservan su
-- modulo card_payment sin cambios.
UPDATE public.empresas_roles_modulos assignment
SET
  erm_habilitado = FALSE,
  erm_updated_at = NOW()
FROM public.empresas company
JOIN public.modulos module
  ON module.mod_codigo = 'card_payment'
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
  AND module.mod_codigo IN ('card_payment', 'card_payment_ocho_a')
ORDER BY role.rol_codigo, module.mod_codigo;

COMMIT;
