BEGIN;

DROP TRIGGER IF EXISTS trg_empresas_cuentas_bancarias_touch_updated_at ON public.empresas_cuentas_bancarias;
DROP TRIGGER IF EXISTS trg_bancos_touch_updated_at ON public.bancos;

DROP TABLE IF EXISTS public.empresas_cuentas_bancarias CASCADE;
DROP TABLE IF EXISTS public.bancos CASCADE;

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS emp_webservice_erp VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS emp_scheme_erp VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS emp_version_tls_erp VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS emp_id_tarjetas VARCHAR(120) NULL;

CREATE TABLE public.bancos (
  ban_id SERIAL PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  usr_id INTEGER NOT NULL,
  ban_source_bank_id INTEGER NULL,
  ban_nombre VARCHAR(160) NOT NULL,
  ban_alias VARCHAR(120) NULL,
  ban_descripcion VARCHAR(255) NULL,
  ban_sucursal VARCHAR(120) NULL,
  ban_activo BOOLEAN NOT NULL DEFAULT TRUE,
  ban_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ban_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_bancos_nombre_not_blank CHECK (length(trim(ban_nombre)) > 0),
  CONSTRAINT fk_bancos_empresas FOREIGN KEY (emp_id) REFERENCES public.empresas (emp_id) ON DELETE CASCADE,
  CONSTRAINT fk_bancos_usuarios FOREIGN KEY (usr_id) REFERENCES public.usuarios (usr_id) ON DELETE CASCADE,
  CONSTRAINT fk_bancos_source_bank FOREIGN KEY (ban_source_bank_id)
    REFERENCES public.bancos (ban_id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_bancos_usuario_nombre_lower
  ON public.bancos (usr_id, LOWER(ban_nombre));

CREATE INDEX idx_bancos_emp_id
  ON public.bancos (emp_id);

CREATE INDEX idx_bancos_usr_id
  ON public.bancos (usr_id);

CREATE INDEX idx_bancos_source_bank_id
  ON public.bancos (ban_source_bank_id);

CREATE UNIQUE INDEX uq_bancos_usuario_source_bank
  ON public.bancos (usr_id, ban_source_bank_id)
  WHERE ban_source_bank_id IS NOT NULL;

CREATE TABLE public.empresas_cuentas_bancarias (
  ecb_id SERIAL PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  ban_id INTEGER NOT NULL,
  ecb_source_account_id INTEGER NULL,
  ecb_nombre VARCHAR(160) NOT NULL,
  ecb_moneda VARCHAR(20) NOT NULL DEFAULT 'GS',
  ecb_numero_cuenta VARCHAR(80) NOT NULL,
  ecb_id_banco_erp VARCHAR(80) NOT NULL,
  ecb_numero_cuenta_mayor VARCHAR(80) NOT NULL,
  ecb_numero_cuenta_pago VARCHAR(80) NULL,
  ecb_activo BOOLEAN NOT NULL DEFAULT TRUE,
  ecb_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ecb_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ecb_nombre_not_blank CHECK (length(trim(ecb_nombre)) > 0),
  CONSTRAINT chk_ecb_moneda_not_blank CHECK (length(trim(ecb_moneda)) > 0),
  CONSTRAINT chk_ecb_numero_cuenta_not_blank CHECK (length(trim(ecb_numero_cuenta)) > 0),
  CONSTRAINT chk_ecb_id_banco_erp_not_blank CHECK (length(trim(ecb_id_banco_erp)) > 0),
  CONSTRAINT chk_ecb_numero_cuenta_mayor_not_blank CHECK (length(trim(ecb_numero_cuenta_mayor)) > 0),
  CONSTRAINT fk_ecb_empresas FOREIGN KEY (emp_id) REFERENCES public.empresas (emp_id) ON DELETE CASCADE,
  CONSTRAINT fk_ecb_bancos FOREIGN KEY (ban_id) REFERENCES public.bancos (ban_id) ON DELETE CASCADE,
  CONSTRAINT fk_ecb_source_account FOREIGN KEY (ecb_source_account_id)
    REFERENCES public.empresas_cuentas_bancarias (ecb_id) ON DELETE SET NULL,
  CONSTRAINT uq_empresas_cuentas_bancarias_empresa_banco_cuenta UNIQUE (emp_id, ban_id, ecb_numero_cuenta)
);

CREATE INDEX idx_ecb_emp_id
  ON public.empresas_cuentas_bancarias (emp_id);

CREATE INDEX idx_ecb_ban_id
  ON public.empresas_cuentas_bancarias (ban_id);

CREATE INDEX idx_ecb_activo
  ON public.empresas_cuentas_bancarias (ecb_activo);

CREATE INDEX idx_ecb_source_account_id
  ON public.empresas_cuentas_bancarias (ecb_source_account_id);

CREATE UNIQUE INDEX uq_ecb_bank_source_account
  ON public.empresas_cuentas_bancarias (ban_id, ecb_source_account_id)
  WHERE ecb_source_account_id IS NOT NULL;

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

CREATE TRIGGER trg_bancos_touch_updated_at
BEFORE UPDATE ON public.bancos
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_bancos_updated_at();

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
