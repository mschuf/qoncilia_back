-- =============================================================================
-- Actualizacion de accesos para OCHO A.
--
-- Habilita, para el rol admin de la empresa OCHO A:
--   * Banco: Gestion Bancos y Cuentas Bancarias.
--   * Configuracion: Usuarios y Plantillas.
--
-- Ambos menus dependen de `layout_management`; `users` agrega el item Usuarios
-- dentro de Configuracion. No cambia usuarios, contrasenas ni otros permisos.
--
-- Ejecutar DESPUES de 41_seed_ocho_a_company_users_and_access.sql.
-- Script idempotente y de ejecucion manual.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  missing_modules TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('OCHO_A')
      AND LOWER(TRIM(emp_nombre)) = LOWER('OCHO A')
  ) THEN
    RAISE EXCEPTION
      'No existe la empresa OCHO A (OCHO_A). Ejecuta primero sql/41_seed_ocho_a_company_users_and_access.sql.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.roles
    WHERE LOWER(rol_codigo) = 'admin'
      AND rol_activo = TRUE
  ) THEN
    RAISE EXCEPTION 'No existe el rol activo admin.';
  END IF;

  SELECT STRING_AGG(required.mod_codigo, ', ' ORDER BY required.mod_codigo)
  INTO missing_modules
  FROM (
    VALUES
      ('users'),
      ('layout_management')
  ) AS required(mod_codigo)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.modulos m
    WHERE LOWER(m.mod_codigo) = required.mod_codigo
      AND m.mod_activo = TRUE
  );

  IF missing_modules IS NOT NULL THEN
    RAISE EXCEPTION
      'Faltan modulos activos requeridos: %. Revisa el esquema/seed de modulos antes de continuar.',
      missing_modules;
  END IF;
END;
$$;

-- `layout_management` habilita Gestion Bancos, Cuentas Bancarias y Plantillas;
-- `users` agrega Usuarios dentro del menu Configuracion.
INSERT INTO public.empresas_roles_modulos (
  emp_id,
  rol_id,
  mod_id,
  erm_habilitado
)
SELECT
  e.emp_id,
  r.rol_id,
  m.mod_id,
  TRUE
FROM public.empresas e
JOIN public.roles r
  ON LOWER(r.rol_codigo) = 'admin'
 AND r.rol_activo = TRUE
JOIN public.modulos m
  ON LOWER(m.mod_codigo) IN ('users', 'layout_management')
 AND m.mod_activo = TRUE
WHERE LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
  AND LOWER(e.emp_nombre) = LOWER('OCHO A')
ON CONFLICT (emp_id, rol_id, mod_id) DO UPDATE
SET
  erm_habilitado = TRUE,
  erm_updated_at = NOW();

-- Verificacion posterior (solo lectura).
SELECT
  e.emp_id_fiscal AS empresa_codigo,
  e.emp_nombre AS empresa_nombre,
  r.rol_codigo AS rol,
  ARRAY_AGG(m.mod_codigo ORDER BY m.mod_codigo)
    FILTER (WHERE erm.erm_habilitado AND m.mod_id IS NOT NULL) AS modulos_agregados
FROM public.empresas e
JOIN public.roles r
  ON LOWER(r.rol_codigo) = 'admin'
LEFT JOIN public.empresas_roles_modulos erm
  ON erm.emp_id = e.emp_id
 AND erm.rol_id = r.rol_id
LEFT JOIN public.modulos m
  ON m.mod_id = erm.mod_id
 AND LOWER(m.mod_codigo) IN ('users', 'layout_management')
WHERE LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
  AND LOWER(e.emp_nombre) = LOWER('OCHO A')
GROUP BY e.emp_id_fiscal, e.emp_nombre, r.rol_codigo;

COMMIT;
