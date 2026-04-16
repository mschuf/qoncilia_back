CREATE TABLE IF NOT EXISTS public.usuarios (
  usr_id SERIAL PRIMARY KEY,
  usr_nombre VARCHAR(120) NULL,
  usr_apellido VARCHAR(120) NULL,
  usr_email VARCHAR(160) NULL,
  usr_celular VARCHAR(40) NULL,
  usr_login VARCHAR(80) NOT NULL,
  usr_legajo VARCHAR(50) NOT NULL,
  usr_password_hash VARCHAR(255) NOT NULL,
  usr_activo BOOLEAN NOT NULL DEFAULT FALSE,
  usr_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  usr_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_usuarios_login UNIQUE (usr_login),
  CONSTRAINT uq_usuarios_legajo UNIQUE (usr_legajo),
  CONSTRAINT uq_usuarios_email UNIQUE (usr_email),
  CONSTRAINT uq_usuarios_celular UNIQUE (usr_celular),
  CONSTRAINT chk_usuarios_login_not_blank CHECK (length(trim(usr_login)) > 0),
  CONSTRAINT chk_usuarios_legajo_not_blank CHECK (length(trim(usr_legajo)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_login_lower
  ON public.usuarios ((LOWER(usr_login)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_email_lower
  ON public.usuarios ((LOWER(usr_email)))
  WHERE usr_email IS NOT NULL;
