-- Script opcional.
-- Reemplazar <<BCRYPT_HASH>> por hash real de una contrasena fuerte.
-- Ejemplo de login: superadmin

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'empresas'
  ) THEN
    INSERT INTO public.empresas (
      emp_nombre,
      emp_ruc,
      emp_email,
      emp_telefono,
      emp_direccion,
      emp_activo
    ) VALUES (
      'Empresa Superadmin',
      NULL,
      'empresa-superadmin@qoncilia.local',
      '+595000000001',
      'Sin direccion',
      TRUE
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

DO $$
DECLARE
  has_emp_id BOOLEAN;
  company_id INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuarios'
      AND column_name = 'emp_id'
  ) INTO has_emp_id;

  IF has_emp_id THEN
    SELECT emp_id
    INTO company_id
    FROM public.empresas
    ORDER BY emp_id ASC
    LIMIT 1;

    IF company_id IS NULL THEN
      RAISE EXCEPTION 'No existe ninguna empresa para asociar al superadmin.';
    END IF;

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
      usr_is_super_admin,
      emp_id
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
      TRUE,
      company_id
    )
    ON CONFLICT (usr_login) DO NOTHING;
  ELSE
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
  END IF;
END;
$$;
