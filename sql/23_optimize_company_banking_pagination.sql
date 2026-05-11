BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_bancos_empresa_origen_nombre_id
  ON public.bancos (empresa_id, banco_origen_id, banco_nombre, banco_id);

CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_empresa_banco_origen_nombre_id
  ON public.cuentas_bancarias (
    empresa_id,
    banco_id,
    cuenta_bancaria_origen_id,
    cuenta_bancaria_nombre,
    cuenta_bancaria_id
  );

CREATE INDEX IF NOT EXISTS idx_bancos_nombre_trgm
  ON public.bancos USING GIN (LOWER(banco_nombre) gin_trgm_ops)
  WHERE banco_origen_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_bancos_sucursal_trgm
  ON public.bancos USING GIN (LOWER(COALESCE(banco_sucursal, '')) gin_trgm_ops)
  WHERE banco_origen_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_bancos_descripcion_trgm
  ON public.bancos USING GIN (LOWER(COALESCE(banco_descripcion, '')) gin_trgm_ops)
  WHERE banco_origen_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_nombre_trgm
  ON public.cuentas_bancarias USING GIN (LOWER(cuenta_bancaria_nombre) gin_trgm_ops)
  WHERE cuenta_bancaria_origen_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_numero_trgm
  ON public.cuentas_bancarias USING GIN (LOWER(cuenta_bancaria_numero) gin_trgm_ops)
  WHERE cuenta_bancaria_origen_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_erp_trgm
  ON public.cuentas_bancarias USING GIN (LOWER(cuenta_bancaria_id_banco_erp) gin_trgm_ops)
  WHERE cuenta_bancaria_origen_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_mayor_trgm
  ON public.cuentas_bancarias USING GIN (LOWER(cuenta_bancaria_numero_mayor) gin_trgm_ops)
  WHERE cuenta_bancaria_origen_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_cuentas_bancarias_pago_trgm
  ON public.cuentas_bancarias USING GIN (LOWER(COALESCE(cuenta_bancaria_numero_pago, '')) gin_trgm_ops)
  WHERE cuenta_bancaria_origen_id IS NULL;

COMMIT;
