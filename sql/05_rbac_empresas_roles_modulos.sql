BEGIN;

DROP TRIGGER IF EXISTS trg_erm_set_updated_at ON public.empresas_roles_modulos;
DROP TRIGGER IF EXISTS trg_modulos_set_updated_at ON public.modulos;
DROP TRIGGER IF EXISTS trg_empresas_set_updated_at ON public.empresas;
DROP TRIGGER IF EXISTS trg_roles_set_updated_at ON public.roles;

DROP TABLE IF EXISTS public.empresas_roles_modulos CASCADE;
DROP TABLE IF EXISTS public.modulos CASCADE;
DROP TABLE IF EXISTS public.empresas CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;

CREATE TABLE IF NOT EXISTS public.roles (
  rol_id SERIAL PRIMARY KEY,
  rol_codigo VARCHAR(50) NOT NULL,
  rol_nombre VARCHAR(120) NOT NULL,
  rol_descripcion VARCHAR(255) NULL,
  rol_activo BOOLEAN NOT NULL DEFAULT TRUE,
  rol_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rol_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_roles_codigo UNIQUE (rol_codigo),
  CONSTRAINT chk_roles_codigo_not_blank CHECK (length(trim(rol_codigo)) > 0),
  CONSTRAINT chk_roles_nombre_not_blank CHECK (length(trim(rol_nombre)) > 0)
);

ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS rol_codigo VARCHAR(50),
  ADD COLUMN IF NOT EXISTS rol_nombre VARCHAR(120),
  ADD COLUMN IF NOT EXISTS rol_descripcion VARCHAR(255),
  ADD COLUMN IF NOT EXISTS rol_activo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS rol_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS rol_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.roles
  DROP COLUMN IF EXISTS rol_es_admin;

CREATE UNIQUE INDEX IF NOT EXISTS uq_roles_codigo_lower
  ON public.roles ((LOWER(rol_codigo)));

CREATE TABLE IF NOT EXISTS public.empresas (
  emp_id SERIAL PRIMARY KEY,
  emp_id_fiscal VARCHAR(50) NOT NULL,
  emp_nombre VARCHAR(160) NOT NULL,
  emp_activa BOOLEAN NOT NULL DEFAULT TRUE,
  emp_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  emp_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_empresas_id_fiscal UNIQUE (emp_id_fiscal),
  CONSTRAINT chk_empresas_id_fiscal_not_blank CHECK (length(trim(emp_id_fiscal)) > 0),
  CONSTRAINT chk_empresas_nombre_not_blank CHECK (length(trim(emp_nombre)) > 0)
);

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS emp_id_fiscal VARCHAR(50),
  ADD COLUMN IF NOT EXISTS emp_nombre VARCHAR(160),
  ADD COLUMN IF NOT EXISTS emp_activa BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS emp_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS emp_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_id_fiscal_lower
  ON public.empresas ((LOWER(emp_id_fiscal)));

CREATE TABLE IF NOT EXISTS public.modulos (
  mod_id SERIAL PRIMARY KEY,
  mod_codigo VARCHAR(80) NOT NULL,
  mod_nombre VARCHAR(120) NOT NULL,
  mod_ruta VARCHAR(160) NOT NULL,
  mod_descripcion VARCHAR(255) NULL,
  mod_activo BOOLEAN NOT NULL DEFAULT TRUE,
  mod_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mod_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_modulos_codigo UNIQUE (mod_codigo),
  CONSTRAINT uq_modulos_ruta UNIQUE (mod_ruta),
  CONSTRAINT chk_modulos_codigo_not_blank CHECK (length(trim(mod_codigo)) > 0),
  CONSTRAINT chk_modulos_nombre_not_blank CHECK (length(trim(mod_nombre)) > 0),
  CONSTRAINT chk_modulos_ruta_not_blank CHECK (length(trim(mod_ruta)) > 0)
);

ALTER TABLE public.modulos
  ADD COLUMN IF NOT EXISTS mod_codigo VARCHAR(80),
  ADD COLUMN IF NOT EXISTS mod_nombre VARCHAR(120),
  ADD COLUMN IF NOT EXISTS mod_ruta VARCHAR(160),
  ADD COLUMN IF NOT EXISTS mod_descripcion VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mod_activo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS mod_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS mod_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_modulos_codigo_lower
  ON public.modulos ((LOWER(mod_codigo)));

CREATE TABLE IF NOT EXISTS public.empresas_roles_modulos (
  erm_id SERIAL PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  rol_id INTEGER NOT NULL,
  mod_id INTEGER NOT NULL,
  erm_habilitado BOOLEAN NOT NULL DEFAULT TRUE,
  erm_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  erm_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.empresas_roles_modulos
  ADD COLUMN IF NOT EXISTS emp_id INTEGER,
  ADD COLUMN IF NOT EXISTS rol_id INTEGER,
  ADD COLUMN IF NOT EXISTS mod_id INTEGER,
  ADD COLUMN IF NOT EXISTS erm_habilitado BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS erm_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS erm_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_erm_empresas'
  ) THEN
    ALTER TABLE public.empresas_roles_modulos
      ADD CONSTRAINT fk_erm_empresas
      FOREIGN KEY (emp_id) REFERENCES public.empresas (emp_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_erm_roles'
  ) THEN
    ALTER TABLE public.empresas_roles_modulos
      ADD CONSTRAINT fk_erm_roles
      FOREIGN KEY (rol_id) REFERENCES public.roles (rol_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_erm_modulos'
  ) THEN
    ALTER TABLE public.empresas_roles_modulos
      ADD CONSTRAINT fk_erm_modulos
      FOREIGN KEY (mod_id) REFERENCES public.modulos (mod_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_erm_empresa_rol_modulo'
  ) THEN
    ALTER TABLE public.empresas_roles_modulos
      ADD CONSTRAINT uq_erm_empresa_rol_modulo
      UNIQUE (emp_id, rol_id, mod_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_erm_emp_id
  ON public.empresas_roles_modulos (emp_id);

CREATE INDEX IF NOT EXISTS idx_erm_rol_id
  ON public.empresas_roles_modulos (rol_id);

CREATE INDEX IF NOT EXISTS idx_erm_mod_id
  ON public.empresas_roles_modulos (mod_id);

CREATE OR REPLACE FUNCTION public.fn_set_rol_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.rol_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_emp_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.emp_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_mod_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mod_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_erm_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.erm_updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roles_set_updated_at ON public.roles;
CREATE TRIGGER trg_roles_set_updated_at
BEFORE UPDATE ON public.roles
FOR EACH ROW
EXECUTE FUNCTION public.fn_set_rol_updated_at();

DROP TRIGGER IF EXISTS trg_empresas_set_updated_at ON public.empresas;
CREATE TRIGGER trg_empresas_set_updated_at
BEFORE UPDATE ON public.empresas
FOR EACH ROW
EXECUTE FUNCTION public.fn_set_emp_updated_at();

DROP TRIGGER IF EXISTS trg_modulos_set_updated_at ON public.modulos;
CREATE TRIGGER trg_modulos_set_updated_at
BEFORE UPDATE ON public.modulos
FOR EACH ROW
EXECUTE FUNCTION public.fn_set_mod_updated_at();

DROP TRIGGER IF EXISTS trg_erm_set_updated_at ON public.empresas_roles_modulos;
CREATE TRIGGER trg_erm_set_updated_at
BEFORE UPDATE ON public.empresas_roles_modulos
FOR EACH ROW
EXECUTE FUNCTION public.fn_set_erm_updated_at();

INSERT INTO public.roles (
  rol_codigo,
  rol_nombre,
  rol_descripcion,
  rol_activo
) VALUES
  ('is_super_admin', 'Super Admin', 'Acceso total al sistema.', TRUE),
  ('admin', 'Admin', 'Administra usuarios y operativa de conciliacion.', TRUE),
  ('gestor_cobranza', 'Gestor Cobranza', 'Gestion operativa orientada a cobranzas.', TRUE),
  ('gestor_pagos', 'Gestor Pagos', 'Gestion operativa orientada a pagos.', TRUE)
ON CONFLICT (rol_codigo) DO UPDATE
SET
  rol_nombre = EXCLUDED.rol_nombre,
  rol_descripcion = EXCLUDED.rol_descripcion,
  rol_activo = EXCLUDED.rol_activo;

INSERT INTO public.modulos (
  mod_codigo,
  mod_nombre,
  mod_ruta,
  mod_descripcion,
  mod_activo
) VALUES
  ('home', 'Inicio', '/', 'Pantalla principal.', TRUE),
  ('profile', 'Mis Datos', '/mis-datos', 'Perfil del usuario.', TRUE),
  ('conciliation', 'Conciliacion', '/conciliation', 'Mesa de conciliacion.', TRUE),
  ('users', 'Gestion de Usuarios', '/users', 'ABM de usuarios.', TRUE),
  ('layout_management', 'Gestion de Layouts', '/layout-management', 'Bancos y layouts.', TRUE),
  ('access_matrix', 'Modulos por Empresa y Rol', '/access-control', 'Control dinamico de modulos.', TRUE)
ON CONFLICT (mod_codigo) DO UPDATE
SET
  mod_nombre = EXCLUDED.mod_nombre,
  mod_ruta = EXCLUDED.mod_ruta,
  mod_descripcion = EXCLUDED.mod_descripcion,
  mod_activo = EXCLUDED.mod_activo;

INSERT INTO public.empresas (
  emp_id_fiscal,
  emp_nombre,
  emp_activa
) VALUES
  ('QONCILIA', 'Qoncilia', TRUE)
ON CONFLICT (emp_id_fiscal) DO UPDATE
SET
  emp_nombre = EXCLUDED.emp_nombre,
  emp_activa = EXCLUDED.emp_activa;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS emp_id INTEGER,
  ADD COLUMN IF NOT EXISTS rol_id INTEGER;

UPDATE public.usuarios
SET emp_id = (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('QONCILIA')
  LIMIT 1
)
WHERE emp_id IS NULL;

DO $$
DECLARE
  has_usr_is_super_admin BOOLEAN;
  has_usr_is_admin BOOLEAN;
  super_role_id INTEGER;
  admin_role_id INTEGER;
  gestor_role_id INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuarios'
      AND column_name = 'usr_is_super_admin'
  )
  INTO has_usr_is_super_admin;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'usuarios'
      AND column_name = 'usr_is_admin'
  )
  INTO has_usr_is_admin;

  SELECT rol_id INTO super_role_id FROM public.roles WHERE rol_codigo = 'is_super_admin' LIMIT 1;
  SELECT rol_id INTO admin_role_id FROM public.roles WHERE rol_codigo = 'admin' LIMIT 1;
  SELECT rol_id INTO gestor_role_id FROM public.roles WHERE rol_codigo = 'gestor_cobranza' LIMIT 1;

  IF has_usr_is_super_admin AND has_usr_is_admin THEN
    UPDATE public.usuarios
    SET rol_id = super_role_id
    WHERE rol_id IS NULL
      AND usr_is_super_admin = TRUE;

    UPDATE public.usuarios
    SET rol_id = admin_role_id
    WHERE rol_id IS NULL
      AND usr_is_admin = TRUE
      AND (usr_is_super_admin IS FALSE OR usr_is_super_admin IS NULL);

    UPDATE public.usuarios
    SET rol_id = gestor_role_id
    WHERE rol_id IS NULL;
  ELSE
    UPDATE public.usuarios
    SET rol_id = super_role_id
    WHERE rol_id IS NULL
      AND LOWER(usr_login) = 'superadmin';

    UPDATE public.usuarios
    SET rol_id = gestor_role_id
    WHERE rol_id IS NULL;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_usuarios_empresas'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT fk_usuarios_empresas
      FOREIGN KEY (emp_id) REFERENCES public.empresas (emp_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_usuarios_roles'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT fk_usuarios_roles
      FOREIGN KEY (rol_id) REFERENCES public.roles (rol_id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_usuarios_emp_id
  ON public.usuarios (emp_id);

CREATE INDEX IF NOT EXISTS idx_usuarios_rol_id
  ON public.usuarios (rol_id);

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS chk_superadmin_requires_admin;

ALTER TABLE public.usuarios
  DROP COLUMN IF EXISTS usr_is_super_admin,
  DROP COLUMN IF EXISTS usr_is_admin;

ALTER TABLE public.usuarios
  ALTER COLUMN emp_id SET NOT NULL,
  ALTER COLUMN rol_id SET NOT NULL;

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
  ON r.rol_codigo IN ('is_super_admin', 'admin', 'gestor_cobranza', 'gestor_pagos')
JOIN public.modulos m
  ON (
    (r.rol_codigo = 'is_super_admin' AND m.mod_codigo IN ('home', 'profile', 'conciliation', 'users', 'layout_management', 'access_matrix'))
    OR (r.rol_codigo = 'admin' AND m.mod_codigo IN ('home', 'profile', 'conciliation', 'users'))
    OR (r.rol_codigo IN ('gestor_cobranza', 'gestor_pagos') AND m.mod_codigo IN ('home', 'profile', 'conciliation'))
  )
ON CONFLICT (emp_id, rol_id, mod_id) DO UPDATE
SET
  erm_habilitado = EXCLUDED.erm_habilitado,
  erm_updated_at = NOW();

COMMIT;
