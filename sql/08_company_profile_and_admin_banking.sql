BEGIN;

DROP TRIGGER IF EXISTS trg_cuentas_bancarias_touch_actualizado_en ON public.cuentas_bancarias;
DROP TRIGGER IF EXISTS trg_bancos_touch_actualizado_en ON public.bancos;
DROP TRIGGER IF EXISTS trg_monedas_touch_actualizado_en ON public.monedas;
DROP TRIGGER IF EXISTS trg_empresas_cuentas_bancarias_touch_updated_at ON public.empresas_cuentas_bancarias;
DROP TRIGGER IF EXISTS trg_bancos_touch_updated_at ON public.bancos;

DROP TABLE IF EXISTS public.empresas_cuentas_bancarias CASCADE;
DROP TABLE IF EXISTS public.cuentas_bancarias CASCADE;
DROP TABLE IF EXISTS public.bancos CASCADE;
DROP TABLE IF EXISTS public.monedas CASCADE;

ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS emp_webservice_erp VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS emp_scheme_erp VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS emp_version_tls_erp VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS emp_id_tarjetas VARCHAR(120) NULL;

CREATE TABLE public.monedas (
  moneda_id SERIAL PRIMARY KEY,
  moneda_codigo VARCHAR(10) NOT NULL,
  moneda_nombre VARCHAR(80) NOT NULL,
  moneda_simbolo VARCHAR(10) NULL,
  moneda_decimales INTEGER NOT NULL DEFAULT 0,
  moneda_activa BOOLEAN NOT NULL DEFAULT TRUE,
  moneda_creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moneda_actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_monedas_codigo UNIQUE (moneda_codigo),
  CONSTRAINT chk_monedas_codigo_not_blank CHECK (length(trim(moneda_codigo)) > 0),
  CONSTRAINT chk_monedas_nombre_not_blank CHECK (length(trim(moneda_nombre)) > 0),
  CONSTRAINT chk_monedas_decimales_non_negative CHECK (moneda_decimales >= 0)
);

CREATE UNIQUE INDEX uq_monedas_codigo_lower
  ON public.monedas ((LOWER(moneda_codigo)));

INSERT INTO public.monedas (
  moneda_codigo,
  moneda_nombre,
  moneda_simbolo,
  moneda_decimales,
  moneda_activa
) VALUES
  ('PYG', 'Guarani paraguayo', 'Gs', 0, TRUE),
  ('USD', 'Dolar estadounidense', 'USD', 2, TRUE),
  ('EUR', 'Euro', 'EUR', 2, TRUE),
  ('BRL', 'Real brasileno', 'BRL', 2, TRUE),
  ('ARS', 'Peso argentino', 'ARS', 2, TRUE)
ON CONFLICT (moneda_codigo) DO UPDATE
SET
  moneda_nombre = EXCLUDED.moneda_nombre,
  moneda_simbolo = EXCLUDED.moneda_simbolo,
  moneda_decimales = EXCLUDED.moneda_decimales,
  moneda_activa = EXCLUDED.moneda_activa,
  moneda_actualizado_en = NOW();

CREATE TABLE public.bancos (
  banco_id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  usuario_id INTEGER NOT NULL,
  banco_origen_id INTEGER NULL,
  banco_nombre VARCHAR(160) NOT NULL,
  banco_alias VARCHAR(120) NULL,
  banco_descripcion VARCHAR(255) NULL,
  banco_sucursal VARCHAR(120) NULL,
  banco_activo BOOLEAN NOT NULL DEFAULT TRUE,
  banco_creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  banco_actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_bancos_nombre_not_blank CHECK (length(trim(banco_nombre)) > 0),
  CONSTRAINT fk_bancos_empresas FOREIGN KEY (empresa_id) REFERENCES public.empresas (emp_id) ON DELETE CASCADE,
  CONSTRAINT fk_bancos_usuarios FOREIGN KEY (usuario_id) REFERENCES public.usuarios (usr_id) ON DELETE CASCADE,
  CONSTRAINT fk_bancos_banco_origen FOREIGN KEY (banco_origen_id)
    REFERENCES public.bancos (banco_id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_bancos_usuario_nombre_lower
  ON public.bancos (usuario_id, LOWER(banco_nombre));

CREATE UNIQUE INDEX uq_bancos_usuario_banco_origen
  ON public.bancos (usuario_id, banco_origen_id)
  WHERE banco_origen_id IS NOT NULL;

CREATE INDEX idx_bancos_empresa_id
  ON public.bancos (empresa_id);

CREATE INDEX idx_bancos_usuario_id
  ON public.bancos (usuario_id);

CREATE INDEX idx_bancos_banco_origen_id
  ON public.bancos (banco_origen_id);

CREATE TABLE public.cuentas_bancarias (
  cuenta_bancaria_id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL,
  banco_id INTEGER NOT NULL,
  cuenta_bancaria_origen_id INTEGER NULL,
  cuenta_bancaria_nombre VARCHAR(160) NOT NULL,
  moneda_codigo VARCHAR(10) NOT NULL DEFAULT 'PYG',
  cuenta_bancaria_numero VARCHAR(80) NOT NULL,
  cuenta_bancaria_id_banco_erp VARCHAR(80) NOT NULL,
  cuenta_bancaria_numero_mayor VARCHAR(80) NOT NULL,
  cuenta_bancaria_numero_pago VARCHAR(80) NULL,
  cuenta_bancaria_activa BOOLEAN NOT NULL DEFAULT TRUE,
  cuenta_bancaria_creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cuenta_bancaria_actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cuentas_bancarias_nombre_not_blank CHECK (length(trim(cuenta_bancaria_nombre)) > 0),
  CONSTRAINT chk_cuentas_bancarias_numero_not_blank CHECK (length(trim(cuenta_bancaria_numero)) > 0),
  CONSTRAINT chk_cuentas_bancarias_id_banco_erp_not_blank CHECK (length(trim(cuenta_bancaria_id_banco_erp)) > 0),
  CONSTRAINT chk_cuentas_bancarias_numero_mayor_not_blank CHECK (length(trim(cuenta_bancaria_numero_mayor)) > 0),
  CONSTRAINT fk_cuentas_bancarias_empresas FOREIGN KEY (empresa_id) REFERENCES public.empresas (emp_id) ON DELETE CASCADE,
  CONSTRAINT fk_cuentas_bancarias_bancos FOREIGN KEY (banco_id) REFERENCES public.bancos (banco_id) ON DELETE CASCADE,
  CONSTRAINT fk_cuentas_bancarias_monedas FOREIGN KEY (moneda_codigo) REFERENCES public.monedas (moneda_codigo) ON DELETE RESTRICT,
  CONSTRAINT fk_cuentas_bancarias_cuenta_origen FOREIGN KEY (cuenta_bancaria_origen_id)
    REFERENCES public.cuentas_bancarias (cuenta_bancaria_id) ON DELETE SET NULL,
  CONSTRAINT uq_cuentas_bancarias_empresa_banco_numero UNIQUE (empresa_id, banco_id, cuenta_bancaria_numero)
);

CREATE INDEX idx_cuentas_bancarias_empresa_id
  ON public.cuentas_bancarias (empresa_id);

CREATE INDEX idx_cuentas_bancarias_banco_id
  ON public.cuentas_bancarias (banco_id);

CREATE INDEX idx_cuentas_bancarias_moneda_codigo
  ON public.cuentas_bancarias (moneda_codigo);

CREATE INDEX idx_cuentas_bancarias_activa
  ON public.cuentas_bancarias (cuenta_bancaria_activa);

CREATE INDEX idx_cuentas_bancarias_origen_id
  ON public.cuentas_bancarias (cuenta_bancaria_origen_id);

CREATE UNIQUE INDEX uq_cuentas_bancarias_banco_origen
  ON public.cuentas_bancarias (banco_id, cuenta_bancaria_origen_id)
  WHERE cuenta_bancaria_origen_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fn_touch_monedas_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.moneda_actualizado_en = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_touch_bancos_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.banco_actualizado_en = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_touch_cuentas_bancarias_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.cuenta_bancaria_actualizado_en = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_monedas_touch_actualizado_en
BEFORE UPDATE ON public.monedas
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_monedas_actualizado_en();

CREATE TRIGGER trg_bancos_touch_actualizado_en
BEFORE UPDATE ON public.bancos
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_bancos_actualizado_en();

CREATE TRIGGER trg_cuentas_bancarias_touch_actualizado_en
BEFORE UPDATE ON public.cuentas_bancarias
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_cuentas_bancarias_actualizado_en();

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
