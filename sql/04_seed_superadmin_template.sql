-- Script opcional.
-- Reemplazar <<BCRYPT_HASH>> por hash real de una contrasena fuerte.
-- Ejemplo de login: superadmin

INSERT INTO public.usuarios (
  usr_nombre,
  usr_apellido,
  usr_email,
  usr_celular,
  usr_login,
  usr_legajo,
  usr_password_hash,
  usr_activo,
  usr_is_admin,
  usr_is_super_admin
) VALUES (
  'Super',
  'Admin',
  'superadmin@qoncilia.local',
  '+595000000000',
  'superadmin',
  'ROOT-0001',
  '<<BCRYPT_HASH>>',
  TRUE,
  TRUE,
  TRUE
)
ON CONFLICT (usr_login) DO NOTHING;
