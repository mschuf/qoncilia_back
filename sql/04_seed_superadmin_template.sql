-- Script opcional para crear el usuario raiz antes del modelo RBAC.
-- Si luego ejecutas 05_rbac_empresas_roles_modulos.sql, este usuario se enlaza
-- a la empresa Qoncilia y al rol is_super_admin.

INSERT INTO public.usuarios (
  usr_nombre,
  usr_apellido,
  usr_email,
  usr_celular,
  usr_login,
  usr_legajo,
  usr_password_hash,
  usr_activo
) VALUES (
  'morteira',
  'morteira',
  'morteira@gmail.com',
  '+595000000000',
  'morteira',
  'ROOT-0001',
  '$2a$12$SszeZLhMNMA0zB64ROhNh.sgfdtDmpUpliS951CQJPYtC/6EUf7JS',
  TRUE
)
ON CONFLICT (usr_login) DO NOTHING;
