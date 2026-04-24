-- Script opcional para entornos ya migrados con 09_rbac_empresas_roles_modulos.sql.
-- Reemplazar <<BCRYPT_HASH>> por hash real de una contrasena fuerte.
-- Ejemplo de login: superadmin

WITH ensured_company AS (
  INSERT INTO public.empresas (
    emp_id_fiscal,
    emp_nombre,
    emp_activa
  )
  VALUES ('QONCILIA', 'Qoncilia', TRUE)
  ON CONFLICT (emp_id_fiscal) DO UPDATE
  SET
    emp_nombre = EXCLUDED.emp_nombre,
    emp_activa = EXCLUDED.emp_activa
  RETURNING emp_id
),
target_company AS (
  SELECT emp_id FROM ensured_company
),
target_role AS (
  SELECT rol_id
  FROM public.roles
  WHERE rol_codigo = 'is_super_admin'
  LIMIT 1
)
INSERT INTO public.usuarios (
  usr_nombre,
  usr_apellido,
  usr_email,
  usr_celular,
  usr_login,
  usr_legajo,
  usr_password_hash,
  usr_activo,
  emp_id,
  rol_id
)
SELECT
  'Super',
  'Admin',
  'superadmin@qoncilia.local',
  '+595000000000',
  'superadmin',
  'ROOT-0001',
  '<<BCRYPT_HASH>>',
  TRUE,
  c.emp_id,
  r.rol_id
FROM target_company c
CROSS JOIN target_role r
ON CONFLICT (usr_login) DO NOTHING;
