BEGIN;

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS emp_webservice_erp VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS emp_scheme_erp VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS emp_version_tls_erp VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS emp_id_tarjetas VARCHAR(120) NULL;

CREATE TABLE IF NOT EXISTS public.bancos (
  ban_id SERIAL PRIMARY KEY,
  ban_nombre VARCHAR(160) NOT NULL,
  ban_sucursal VARCHAR(120) NULL,
  ban_activo BOOLEAN NOT NULL DEFAULT TRUE,
  ban_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ban_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_bancos_nombre UNIQUE (ban_nombre),
  CONSTRAINT chk_bancos_nombre_not_blank CHECK (length(trim(ban_nombre)) > 0)
);

ALTER TABLE public.bancos
  ADD COLUMN IF NOT EXISTS ban_nombre VARCHAR(160),
  ADD COLUMN IF NOT EXISTS ban_sucursal VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS ban_activo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ban_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ban_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_bancos_nombre_lower
  ON public.bancos ((LOWER(ban_nombre)));

CREATE TABLE IF NOT EXISTS public.empresas_cuentas_bancarias (
  ecb_id SERIAL PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  ban_id INTEGER NOT NULL,
  ecb_nombre VARCHAR(160) NOT NULL,
  ecb_numero_cuenta VARCHAR(80) NOT NULL,
  ecb_id_banco_erp VARCHAR(80) NOT NULL,
  ecb_numero_cuenta_mayor VARCHAR(80) NOT NULL,
  ecb_numero_cuenta_pago VARCHAR(80) NULL,
  ecb_activo BOOLEAN NOT NULL DEFAULT TRUE,
  ecb_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ecb_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ecb_nombre_not_blank CHECK (length(trim(ecb_nombre)) > 0),
  CONSTRAINT chk_ecb_numero_cuenta_not_blank CHECK (length(trim(ecb_numero_cuenta)) > 0),
  CONSTRAINT chk_ecb_id_banco_erp_not_blank CHECK (length(trim(ecb_id_banco_erp)) > 0),
  CONSTRAINT chk_ecb_numero_cuenta_mayor_not_blank CHECK (length(trim(ecb_numero_cuenta_mayor)) > 0)
);

ALTER TABLE public.empresas_cuentas_bancarias
  ADD COLUMN IF NOT EXISTS emp_id INTEGER,
  ADD COLUMN IF NOT EXISTS ban_id INTEGER,
  ADD COLUMN IF NOT EXISTS ecb_nombre VARCHAR(160),
  ADD COLUMN IF NOT EXISTS ecb_numero_cuenta VARCHAR(80),
  ADD COLUMN IF NOT EXISTS ecb_id_banco_erp VARCHAR(80),
  ADD COLUMN IF NOT EXISTS ecb_numero_cuenta_mayor VARCHAR(80),
  ADD COLUMN IF NOT EXISTS ecb_numero_cuenta_pago VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS ecb_activo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ecb_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ecb_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_ecb_empresas'
  ) THEN
    ALTER TABLE public.empresas_cuentas_bancarias
      ADD CONSTRAINT fk_ecb_empresas
      FOREIGN KEY (emp_id) REFERENCES public.empresas (emp_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_ecb_bancos'
  ) THEN
    ALTER TABLE public.empresas_cuentas_bancarias
      ADD CONSTRAINT fk_ecb_bancos
      FOREIGN KEY (ban_id) REFERENCES public.bancos (ban_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_empresas_cuentas_bancarias_empresa_banco_cuenta'
  ) THEN
    ALTER TABLE public.empresas_cuentas_bancarias
      ADD CONSTRAINT uq_empresas_cuentas_bancarias_empresa_banco_cuenta
      UNIQUE (emp_id, ban_id, ecb_numero_cuenta);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_ecb_emp_id
  ON public.empresas_cuentas_bancarias (emp_id);

CREATE INDEX IF NOT EXISTS idx_ecb_ban_id
  ON public.empresas_cuentas_bancarias (ban_id);

CREATE INDEX IF NOT EXISTS idx_ecb_activo
  ON public.empresas_cuentas_bancarias (ecb_activo);

CREATE OR REPLACE FUNCTION public.fn_touch_bancos_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.ban_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_touch_ecb_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.ecb_updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bancos_touch_updated_at ON public.bancos;
CREATE TRIGGER trg_bancos_touch_updated_at
BEFORE UPDATE ON public.bancos
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_bancos_updated_at();

DROP TRIGGER IF EXISTS trg_empresas_cuentas_bancarias_touch_updated_at ON public.empresas_cuentas_bancarias;
CREATE TRIGGER trg_empresas_cuentas_bancarias_touch_updated_at
BEFORE UPDATE ON public.empresas_cuentas_bancarias
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_ecb_updated_at();

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
  ON r.rol_codigo = 'admin'
JOIN public.modulos m
  ON m.mod_codigo = 'layout_management'
ON CONFLICT (emp_id, rol_id, mod_id) DO UPDATE
SET
  erm_habilitado = EXCLUDED.erm_habilitado,
  erm_updated_at = NOW();

COMMIT;
