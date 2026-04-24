-- Ejecutar manualmente junto con el deploy de estos cambios.
-- 1) Renombra emp_codigo -> emp_id_fiscal.
-- 2) Mueve sucursal desde empresas_cuentas_bancarias hacia bancos.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'empresas'
      AND column_name = 'emp_codigo'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'empresas'
      AND column_name = 'emp_id_fiscal'
  ) THEN
    ALTER TABLE public.empresas
      RENAME COLUMN emp_codigo TO emp_id_fiscal;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_empresas_codigo'
  ) THEN
    ALTER TABLE public.empresas
      RENAME CONSTRAINT uq_empresas_codigo TO uq_empresas_id_fiscal;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_empresas_codigo_not_blank'
  ) THEN
    ALTER TABLE public.empresas
      RENAME CONSTRAINT chk_empresas_codigo_not_blank TO chk_empresas_id_fiscal_not_blank;
  END IF;
END;
$$;

ALTER INDEX IF EXISTS public.uq_empresas_codigo_lower
  RENAME TO uq_empresas_id_fiscal_lower;

ALTER TABLE public.bancos
  ADD COLUMN IF NOT EXISTS ban_sucursal VARCHAR(120) NULL;

-- Revisar antes de continuar: si devuelve filas, resolver manualmente
-- cual sucursal debe quedar en cada banco.
SELECT
  ban_id,
  COUNT(DISTINCT NULLIF(BTRIM(ecb_sucursal), '')) AS sucursales_distintas,
  STRING_AGG(DISTINCT NULLIF(BTRIM(ecb_sucursal), ''), ' | ') AS sucursales_detectadas
FROM public.empresas_cuentas_bancarias
WHERE NULLIF(BTRIM(ecb_sucursal), '') IS NOT NULL
GROUP BY ban_id
HAVING COUNT(DISTINCT NULLIF(BTRIM(ecb_sucursal), '')) > 1;

UPDATE public.bancos AS b
SET ban_sucursal = source.sucursal
FROM (
  SELECT
    ban_id,
    MIN(NULLIF(BTRIM(ecb_sucursal), '')) AS sucursal
  FROM public.empresas_cuentas_bancarias
  GROUP BY ban_id
) AS source
WHERE b.ban_id = source.ban_id
  AND source.sucursal IS NOT NULL
  AND (b.ban_sucursal IS NULL OR BTRIM(b.ban_sucursal) = '');

ALTER TABLE public.empresas_cuentas_bancarias
  DROP COLUMN IF EXISTS ecb_sucursal;

COMMIT;
