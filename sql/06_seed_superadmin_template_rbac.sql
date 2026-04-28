-- Script opcional para entornos ya migrados con 05_rbac_empresas_roles_modulos.sql.
-- Asegura el usuario raiz morteira como is_super_admin.

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
  'morteira',
  'morteira',
  'morteira@gmail.com',
  '+595000000000',
  'morteira',
  'ROOT-0001',
  '$2a$12$SszeZLhMNMA0zB64ROhNh.sgfdtDmpUpliS951CQJPYtC/6EUf7JS',
  TRUE,
  c.emp_id,
  r.rol_id
FROM target_company c
CROSS JOIN target_role r
ON CONFLICT (usr_login) DO UPDATE
SET
  usr_nombre = EXCLUDED.usr_nombre,
  usr_apellido = EXCLUDED.usr_apellido,
  usr_email = EXCLUDED.usr_email,
  usr_celular = EXCLUDED.usr_celular,
  usr_legajo = EXCLUDED.usr_legajo,
  usr_password_hash = EXCLUDED.usr_password_hash,
  usr_activo = EXCLUDED.usr_activo,
  emp_id = EXCLUDED.emp_id,
  rol_id = EXCLUDED.rol_id,
  usr_updated_at = NOW();
