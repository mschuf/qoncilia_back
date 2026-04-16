BEGIN;

CREATE TABLE IF NOT EXISTS public.usuarios_roles (
  ur_id SERIAL PRIMARY KEY,
  usr_id INTEGER NOT NULL,
  rol_id INTEGER NOT NULL,
  ur_es_principal BOOLEAN NOT NULL DEFAULT FALSE,
  ur_activo BOOLEAN NOT NULL DEFAULT TRUE,
  ur_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ur_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.usuarios_roles
  ADD COLUMN IF NOT EXISTS usr_id INTEGER,
  ADD COLUMN IF NOT EXISTS rol_id INTEGER,
  ADD COLUMN IF NOT EXISTS ur_es_principal BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ur_activo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ur_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ur_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_ur_usuarios'
  ) THEN
    ALTER TABLE public.usuarios_roles
      ADD CONSTRAINT fk_ur_usuarios
      FOREIGN KEY (usr_id) REFERENCES public.usuarios (usr_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_ur_roles'
  ) THEN
    ALTER TABLE public.usuarios_roles
      ADD CONSTRAINT fk_ur_roles
      FOREIGN KEY (rol_id) REFERENCES public.roles (rol_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_ur_usuario_rol'
  ) THEN
    ALTER TABLE public.usuarios_roles
      ADD CONSTRAINT uq_ur_usuario_rol
      UNIQUE (usr_id, rol_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_ur_usr_id
  ON public.usuarios_roles (usr_id);

CREATE INDEX IF NOT EXISTS idx_ur_rol_id
  ON public.usuarios_roles (rol_id);

CREATE INDEX IF NOT EXISTS idx_ur_activo
  ON public.usuarios_roles (ur_activo);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ur_usuario_principal
  ON public.usuarios_roles (usr_id)
  WHERE ur_es_principal = TRUE;

CREATE OR REPLACE FUNCTION public.fn_set_ur_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.ur_updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_roles_set_updated_at ON public.usuarios_roles;
CREATE TRIGGER trg_usuarios_roles_set_updated_at
BEFORE UPDATE ON public.usuarios_roles
FOR EACH ROW
EXECUTE FUNCTION public.fn_set_ur_updated_at();

CREATE OR REPLACE FUNCTION public.fn_sync_usuarios_roles_from_usuarios()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.rol_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.usuarios_roles
  SET
    ur_es_principal = FALSE,
    ur_updated_at = NOW()
  WHERE usr_id = NEW.usr_id
    AND ur_es_principal = TRUE
    AND rol_id <> NEW.rol_id;

  INSERT INTO public.usuarios_roles (
    usr_id,
    rol_id,
    ur_es_principal,
    ur_activo
  ) VALUES (
    NEW.usr_id,
    NEW.rol_id,
    TRUE,
    TRUE
  )
  ON CONFLICT (usr_id, rol_id) DO UPDATE
  SET
    ur_es_principal = TRUE,
    ur_activo = TRUE,
    ur_updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_usuarios_roles_from_usuarios ON public.usuarios;
CREATE TRIGGER trg_sync_usuarios_roles_from_usuarios
AFTER INSERT OR UPDATE OF rol_id ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_usuarios_roles_from_usuarios();

INSERT INTO public.usuarios_roles (
  usr_id,
  rol_id,
  ur_es_principal,
  ur_activo
)
SELECT
  u.usr_id,
  u.rol_id,
  TRUE,
  TRUE
FROM public.usuarios u
WHERE u.rol_id IS NOT NULL
ON CONFLICT (usr_id, rol_id) DO UPDATE
SET
  ur_es_principal = EXCLUDED.ur_es_principal,
  ur_activo = EXCLUDED.ur_activo,
  ur_updated_at = NOW();

COMMIT;
