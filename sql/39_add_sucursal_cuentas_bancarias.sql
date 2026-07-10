-- =============================================================================
-- Sucursal por CUENTA BANCARIA (cuentas_bancarias.cuenta_bancaria_sucursal).
--
-- La usa el deposito de Pago de Tarjeta (SAP_TARJETAS): viaja como "BankBranch"
-- en la cabecera del POST /Deposits del Service Layer. OJO: es distinta de
-- bancos.banco_sucursal (sucursal del banco), que NO se usa para el deposito.
-- "Bank" (cabecera) sale de bancos.banco_descripcion.
--
-- Incremental e idempotente. Se carga por la UI de Cuentas Bancarias.
-- =============================================================================

BEGIN;

ALTER TABLE public.cuentas_bancarias
  ADD COLUMN IF NOT EXISTS cuenta_bancaria_sucursal VARCHAR(120);

COMMENT ON COLUMN public.cuentas_bancarias.cuenta_bancaria_sucursal IS
  'Sucursal de la cuenta: cabecera BankBranch del deposito SAP de tarjetas.';

COMMIT;
