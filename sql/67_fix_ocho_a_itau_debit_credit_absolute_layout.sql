-- =============================================================================
-- Correccion Itaú EXCLUSIVA de OCHO_A para BankPages SAP B1.
--
-- Itaú expone Débitos (columna D) con signo negativo y Créditos (E) positivo.
-- El modo debit_credit_abs conserva la columna de origen y solo elimina el
-- signo: D=-6.600,00 -> DebitAmount=6600; E=35.599,33 -> CreditAmount=35599.33.
--
-- Alcance: una unica plantilla activa del banco Itaú de empresa 6 / OCHO_A.
-- No cambia Continental, Sudameris, otros bancos, otras plantillas, cuentas,
-- extractos ni ninguna otra empresa.
--
-- EJECUCION MANUAL: desplegar primero el backend que soporta
-- plantilla_monto_modo = 'debit_credit_abs' y luego ejecutar este SQL.
-- Es idempotente: se puede reejecutar sin duplicar registros.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  expected_database CONSTANT TEXT := 'QONCILIA_BACK';
  target_company_count INTEGER;
  target_bank_count INTEGER;
  target_layout_count INTEGER;
BEGIN
  IF current_database() <> expected_database THEN
    RAISE EXCEPTION
      'Base incorrecta. Esperada %, actual %.',
      expected_database,
      current_database();
  END IF;

  SELECT COUNT(*)
  INTO target_company_count
  FROM public.empresas company
  WHERE company.emp_id = 6
    AND LOWER(BTRIM(company.emp_id_fiscal)) = 'ocho_a';

  IF target_company_count <> 1 THEN
    RAISE EXCEPTION
      'No coincide la empresa objetivo OCHO_A (emp_id=6). Encontradas: %.',
      target_company_count;
  END IF;

  SELECT COUNT(*)
  INTO target_bank_count
  FROM public.bancos bank
  WHERE bank.empresa_id = 6
    AND bank.banco_activo = TRUE
    AND bank.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(bank.banco_nombre), '[^a-z0-9]+', '', 'g')
      LIKE '%itau%';

  IF target_bank_count <> 1 THEN
    RAISE EXCEPTION
      'Se esperaba exactamente un banco Itaú activo y propio de OCHO_A; encontrados: %.',
      target_bank_count;
  END IF;

  SELECT COUNT(*)
  INTO target_layout_count
  FROM public.plantillas_conciliacion layout
  JOIN public.bancos bank ON bank.banco_id = layout.banco_id
  WHERE bank.empresa_id = 6
    AND bank.banco_activo = TRUE
    AND bank.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(bank.banco_nombre), '[^a-z0-9]+', '', 'g')
      LIKE '%itau%'
    AND layout.plantilla_activa = TRUE;

  IF target_layout_count <> 1 THEN
    RAISE EXCEPTION
      'Se esperaba exactamente una plantilla activa de Itaú para OCHO_A; encontradas: %.',
      target_layout_count;
  END IF;
END;
$$;

-- Solo modifica la plantilla activa Itaú de OCHO_A validada arriba.
UPDATE public.plantillas_conciliacion layout
SET
  plantilla_monto_modo = 'debit_credit_abs',
  plantilla_actualizada_en = NOW()
FROM public.bancos bank
WHERE layout.banco_id = bank.banco_id
  AND bank.empresa_id = 6
  AND bank.banco_activo = TRUE
  AND bank.banco_origen_id IS NULL
  AND REGEXP_REPLACE(LOWER(bank.banco_nombre), '[^a-z0-9]+', '', 'g')
    LIKE '%itau%'
  AND layout.plantilla_activa = TRUE;

-- Verificacion posterior (solo lectura). Debe devolver una unica plantilla
-- OCHO_A / Itaú con modo debit_credit_abs y mapeos Debito=D, Credito=E.
SELECT
  company.emp_id_fiscal AS empresa,
  bank.banco_id,
  bank.banco_nombre AS banco,
  layout.plantilla_id,
  layout.plantilla_nombre AS plantilla,
  layout.plantilla_monto_modo AS modo_importe,
  mapping.mapeo_clave_campo AS campo,
  mapping.banco_columna AS columna_banco,
  mapping.mapeo_activo AS activo
FROM public.plantillas_conciliacion layout
JOIN public.bancos bank ON bank.banco_id = layout.banco_id
JOIN public.empresas company ON company.emp_id = bank.empresa_id
LEFT JOIN public.plantillas_conciliacion_mapeos mapping
  ON mapping.plantilla_id = layout.plantilla_id
WHERE company.emp_id = 6
  AND LOWER(BTRIM(company.emp_id_fiscal)) = 'ocho_a'
  AND bank.banco_activo = TRUE
  AND bank.banco_origen_id IS NULL
  AND REGEXP_REPLACE(LOWER(bank.banco_nombre), '[^a-z0-9]+', '', 'g')
    LIKE '%itau%'
  AND layout.plantilla_activa = TRUE
  AND LOWER(BTRIM(mapping.mapeo_clave_campo)) IN ('monto', 'debito', 'credito')
ORDER BY mapping.mapeo_orden, mapping.mapeo_id;

COMMIT;
