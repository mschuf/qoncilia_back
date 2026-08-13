-- =============================================================================
-- Acceso a ERP Management para administradores de OCHO A.
--
-- Habilita el modulo `erp_management` para el rol admin de OCHO A. Este modulo
-- es el que muestra en el perfil el bloque "ERPs activas" y permite abrir la
-- pantalla para consultar y modificar las configuraciones ERP de su empresa.
--
-- No modifica usuarios ni configuraciones ERP. Tampoco toca permisos ni datos
-- de FG TARJETA ni de ninguna otra empresa.
--
-- Ejecutar manualmente despues de 41 y 44. Script idempotente.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('OCHO_A')
      AND LOWER(TRIM(emp_nombre)) = LOWER('OCHO A')
      AND emp_activa = TRUE
  ) THEN
    RAISE EXCEPTION
      'No existe la empresa activa OCHO A (OCHO_A). Ejecuta primero el script 41.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.roles
    WHERE LOWER(rol_codigo) = 'admin'
      AND rol_activo = TRUE
  ) THEN
    RAISE EXCEPTION 'No existe el rol activo admin.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.modulos
    WHERE LOWER(mod_codigo) = 'erp_management'
      AND mod_activo = TRUE
  ) THEN
    RAISE EXCEPTION
      'No existe el modulo activo erp_management. Ejecuta primero el script de creacion de ERP (14 o 17).';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.empresas e ON e.emp_id = u.emp_id
    JOIN public.roles r ON r.rol_id = u.rol_id
    WHERE LOWER(u.usr_login) = LOWER('amalia.romberg')
      AND u.usr_activo = TRUE
      AND LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
      AND LOWER(r.rol_codigo) = 'admin'
  ) THEN
    RAISE EXCEPTION
      'amalia.romberg debe estar activa, pertenecer a OCHO A y tener rol admin antes de habilitar ERP Management.';
  END IF;
END;
$$;

-- El permiso se asigna al rol admin dentro de OCHO A, que es el modelo de
-- autorizacion de la aplicacion. Amalia lo recibe por ser admin de esa empresa.
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
  ON LOWER(m.mod_codigo) = 'erp_management'
 AND m.mod_activo = TRUE
WHERE LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
  AND LOWER(e.emp_nombre) = LOWER('OCHO A')
ON CONFLICT (emp_id, rol_id, mod_id) DO UPDATE
SET
  erm_habilitado = TRUE,
  erm_updated_at = NOW();

-- Verificacion posterior (solo lectura).
SELECT
  u.usr_login AS usuario,
  e.emp_id_fiscal AS empresa_codigo,
  r.rol_codigo AS rol,
  m.mod_codigo AS modulo,
  erm.erm_habilitado AS modulo_habilitado
FROM public.usuarios u
JOIN public.empresas e ON e.emp_id = u.emp_id
JOIN public.roles r ON r.rol_id = u.rol_id
JOIN public.empresas_roles_modulos erm
  ON erm.emp_id = e.emp_id
 AND erm.rol_id = r.rol_id
JOIN public.modulos m ON m.mod_id = erm.mod_id
WHERE LOWER(u.usr_login) = LOWER('amalia.romberg')
  AND LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
  AND LOWER(m.mod_codigo) = 'erp_management';

COMMIT;
