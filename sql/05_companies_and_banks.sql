BEGIN;

CREATE TABLE IF NOT EXISTS public.empresas (
  emp_id SERIAL PRIMARY KEY,
  emp_nombre VARCHAR(160) NOT NULL,
  emp_ruc VARCHAR(30) NULL,
  emp_email VARCHAR(160) NULL,
  emp_telefono VARCHAR(40) NULL,
  emp_direccion VARCHAR(255) NULL,
  emp_activo BOOLEAN NOT NULL DEFAULT TRUE,
  emp_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  emp_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_empresas_nombre_not_blank CHECK (length(trim(emp_nombre)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_nombre_lower
  ON public.empresas ((LOWER(emp_nombre)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_ruc
  ON public.empresas (emp_ruc)
  WHERE emp_ruc IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.empresas_bancos (
  eba_id SERIAL PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  eba_banco_nombre VARCHAR(120) NOT NULL,
  eba_tipo_cuenta VARCHAR(40) NOT NULL,
  eba_moneda VARCHAR(10) NOT NULL,
  eba_numero_cuenta VARCHAR(80) NOT NULL,
  eba_titular VARCHAR(160) NULL,
  eba_sucursal VARCHAR(120) NULL,
  eba_activo BOOLEAN NOT NULL DEFAULT TRUE,
  eba_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  eba_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_empresas_bancos_empresas
    FOREIGN KEY (emp_id) REFERENCES public.empresas (emp_id) ON DELETE CASCADE,
  CONSTRAINT uq_empresas_bancos_numero_moneda UNIQUE (emp_id, eba_numero_cuenta, eba_moneda),
  CONSTRAINT chk_empresas_bancos_banco_not_blank CHECK (length(trim(eba_banco_nombre)) > 0),
  CONSTRAINT chk_empresas_bancos_tipo_not_blank CHECK (length(trim(eba_tipo_cuenta)) > 0),
  CONSTRAINT chk_empresas_bancos_moneda_not_blank CHECK (length(trim(eba_moneda)) > 0),
  CONSTRAINT chk_empresas_bancos_numero_not_blank CHECK (length(trim(eba_numero_cuenta)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_empresas_bancos_emp_id
  ON public.empresas_bancos (emp_id);

INSERT INTO public.empresas (
  emp_nombre,
  emp_ruc,
  emp_email,
  emp_telefono,
  emp_direccion,
  emp_activo
) VALUES (
  'Empresa por Defecto',
  NULL,
  NULL,
  NULL,
  NULL,
  TRUE
)
ON CONFLICT DO NOTHING;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS emp_id INTEGER;

UPDATE public.usuarios u
SET emp_id = seed.emp_id
FROM (
  SELECT emp_id
  FROM public.empresas
  ORDER BY emp_id ASC
  LIMIT 1
) AS seed
WHERE u.emp_id IS NULL;

ALTER TABLE public.usuarios
  ALTER COLUMN emp_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_usuarios_empresas'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT fk_usuarios_empresas
      FOREIGN KEY (emp_id) REFERENCES public.empresas (emp_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_usuarios_emp_id
  ON public.usuarios (emp_id);

CREATE OR REPLACE FUNCTION public.fn_set_emp_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.emp_updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_empresas_set_updated_at ON public.empresas;

CREATE TRIGGER trg_empresas_set_updated_at
BEFORE UPDATE ON public.empresas
FOR EACH ROW
EXECUTE FUNCTION public.fn_set_emp_updated_at();

CREATE OR REPLACE FUNCTION public.fn_set_eba_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.eba_updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_empresas_bancos_set_updated_at ON public.empresas_bancos;

CREATE TRIGGER trg_empresas_bancos_set_updated_at
BEFORE UPDATE ON public.empresas_bancos
FOR EACH ROW
EXECUTE FUNCTION public.fn_set_eba_updated_at();

COMMIT;
