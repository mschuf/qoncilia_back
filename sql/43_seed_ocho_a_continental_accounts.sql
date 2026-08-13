-- =============================================================================
-- Cuentas bancarias Continental para OCHO A.
--
-- Crea, si no existe, el banco Continental para OCHO A con Amalia Romberg como
-- usuario propietario (o Daysi Gonzalez como alternativa) y registra estas
-- cuentas activas en guaranies:
--
--   1) Extracto Bancario (conciliacion bancaria)
--      Cuenta mayor: 1112201001 | Cuenta: 0637169205
--
--   2) Cuenta Pago (pago de tarjetas)
--      Cuenta mayor: 1112201002 | Cuenta: 060047470007
--      Cuenta Pago ERP: 060047470007
--
-- La Cuenta Pago ERP se llena porque el flujo de tarjetas la envia a SAP como
-- BankAccountNum al crear el deposito.
--
-- Ejecutar DESPUES de 41_seed_ocho_a_company_users_and_access.sql.
-- Script idempotente y de ejecucion manual. No se ejecuta automaticamente.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE seed_ocho_a_cuentas_continental (
  nombre VARCHAR(160) NOT NULL,
  numero_cuenta VARCHAR(80) PRIMARY KEY,
  cuenta_mayor VARCHAR(80) NOT NULL,
  cuenta_pago_erp VARCHAR(80) NULL
) ON COMMIT DROP;

INSERT INTO seed_ocho_a_cuentas_continental (
  nombre,
  numero_cuenta,
  cuenta_mayor,
  cuenta_pago_erp
) VALUES
  ('Extracto Bancario', '0637169205',    '1112201001', NULL),
  ('Cuenta Pago',      '060047470007', '1112201002', '060047470007');

-- Validaciones previas. Si hubiese dos bancos Continental origen para OCHO A,
-- se detiene para no asociar las cuentas a uno de forma arbitraria.
DO $$
DECLARE
  continental_bank_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('OCHO_A')
      AND LOWER(TRIM(emp_nombre)) = LOWER('OCHO A')
  ) THEN
    RAISE EXCEPTION
      'No existe la empresa OCHO A (OCHO_A). Ejecuta primero sql/41_seed_ocho_a_company_users_and_access.sql.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.empresas e ON e.emp_id = u.emp_id
    WHERE LOWER(u.usr_login) IN (
      LOWER('amalia.romberg'),
      LOWER('daysi.gonzalez')
    )
      AND u.usr_activo = TRUE
      AND LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
  ) THEN
    RAISE EXCEPTION
      'No existe un usuario activo amalia.romberg o daysi.gonzalez para OCHO A.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.monedas
    WHERE UPPER(moneda_codigo) = 'PYG'
      AND moneda_activa = TRUE
  ) THEN
    RAISE EXCEPTION 'No existe la moneda PYG activa.';
  END IF;

  SELECT COUNT(*)
  INTO continental_bank_count
  FROM public.bancos b
  JOIN public.empresas e ON e.emp_id = b.empresa_id
  WHERE LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
    AND b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental');

  IF continental_bank_count > 1 THEN
    RAISE EXCEPTION
      'OCHO A tiene % bancos Continental origen. Unifica esos bancos antes de ejecutar este script.',
      continental_bank_count;
  END IF;
END;
$$;

-- Crea el banco solo cuando no exista uno equivalente para la empresa.
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('OCHO_A')
),
target_owner AS (
  SELECT u.usr_id
  FROM public.usuarios u
  JOIN target_company c ON c.emp_id = u.emp_id
  WHERE LOWER(u.usr_login) IN (
    LOWER('amalia.romberg'),
    LOWER('daysi.gonzalez')
  )
    AND u.usr_activo = TRUE
  ORDER BY CASE LOWER(u.usr_login)
    WHEN LOWER('amalia.romberg') THEN 1
    WHEN LOWER('daysi.gonzalez') THEN 2
    ELSE 3
  END
  LIMIT 1
)
INSERT INTO public.bancos (
  empresa_id,
  usuario_id,
  banco_nombre,
  banco_descripcion,
  banco_activo
)
SELECT
  c.emp_id,
  o.usr_id,
  'Banco Continental',
  'Banco Continental',
  TRUE
FROM target_company c
CROSS JOIN target_owner o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.bancos b
  WHERE b.empresa_id = c.emp_id
    AND b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental')
);

-- Garantiza que el banco existente quede activo y con descripcion utilizable
-- como cabecera Bank en los depositos de tarjetas, sin cambiar su propietario.
UPDATE public.bancos b
SET
  banco_descripcion = COALESCE(NULLIF(TRIM(b.banco_descripcion), ''), 'Banco Continental'),
  banco_activo = TRUE,
  banco_actualizado_en = NOW()
FROM public.empresas e
WHERE e.emp_id = b.empresa_id
  AND LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
  AND b.banco_origen_id IS NULL
  AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
    IN ('continental', 'bancocontinental');

-- Inserta o actualiza las dos cuentas indicadas. El identificador ERP del banco
-- y la sucursal no se cargan porque no fueron proporcionados.
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('OCHO_A')
),
target_bank AS (
  SELECT b.banco_id
  FROM public.bancos b
  JOIN target_company c ON c.emp_id = b.empresa_id
  WHERE b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental')
)
INSERT INTO public.cuentas_bancarias (
  empresa_id,
  banco_id,
  cuenta_bancaria_nombre,
  moneda_codigo,
  cuenta_bancaria_numero,
  cuenta_bancaria_id_banco_erp,
  cuenta_bancaria_numero_mayor,
  cuenta_bancaria_numero_pago,
  cuenta_bancaria_activa
)
SELECT
  c.emp_id,
  b.banco_id,
  i.nombre,
  'PYG',
  i.numero_cuenta,
  NULL,
  i.cuenta_mayor,
  i.cuenta_pago_erp,
  TRUE
FROM seed_ocho_a_cuentas_continental i
CROSS JOIN target_company c
CROSS JOIN target_bank b
ON CONFLICT ON CONSTRAINT uq_cuentas_bancarias_empresa_banco_numero DO UPDATE
SET
  cuenta_bancaria_nombre = EXCLUDED.cuenta_bancaria_nombre,
  moneda_codigo = EXCLUDED.moneda_codigo,
  cuenta_bancaria_numero_mayor = EXCLUDED.cuenta_bancaria_numero_mayor,
  cuenta_bancaria_numero_pago = EXCLUDED.cuenta_bancaria_numero_pago,
  cuenta_bancaria_activa = TRUE,
  cuenta_bancaria_actualizado_en = NOW();

-- Verificacion posterior (solo lectura).
SELECT
  e.emp_id_fiscal AS empresa_codigo,
  b.banco_nombre AS banco,
  c.cuenta_bancaria_nombre AS cuenta,
  c.moneda_codigo AS moneda,
  c.cuenta_bancaria_numero AS numero_cuenta,
  c.cuenta_bancaria_numero_mayor AS cuenta_mayor,
  c.cuenta_bancaria_numero_pago AS cuenta_pago_erp,
  c.cuenta_bancaria_activa AS activa
FROM public.cuentas_bancarias c
JOIN public.empresas e ON e.emp_id = c.empresa_id
JOIN public.bancos b ON b.banco_id = c.banco_id
WHERE LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
  AND c.cuenta_bancaria_numero IN ('0637169205', '060047470007')
ORDER BY c.cuenta_bancaria_numero_mayor;

COMMIT;
