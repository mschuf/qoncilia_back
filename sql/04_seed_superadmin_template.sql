-- Script opcional.
-- Reemplazar <<BCRYPT_HASH>> por hash real de una contrasena fuerte.
-- Ejemplo de login: superadmin.
-- Si luego ejecutas 05_rbac_empresas_roles_modulos.sql, este usuario se migrara a rol
-- is_super_admin cuando el login sea 'superadmin'.

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
  'Super',
  'Admin',
  'superadmin@qoncilia.local',
  '+595000000000',
  'superadmin',
  'ROOT-0001',
  '<<BCRYPT_HASH>>',
  TRUE
)
ON CONFLICT (usr_login) DO NOTHING;
