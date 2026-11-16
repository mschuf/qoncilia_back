-- =============================================================================
-- UENO para OCHO_A: plantilla de extracto (conciliacion bancaria) +
-- verificacion de la pestana "Tarjeta UENO" de Pagos Tarjetas.
--
-- EJECUCION MANUAL. El agente no ejecuta este archivo.
-- La plantilla de extracto (punto 1) funciona con el backend actual: se puede
-- ejecutar ya. La pestana Tarjeta UENO (punto 2) requiere desplegar backend y
-- frontend nuevos.
--
-- Alcance EXCLUSIVO:
--   * empresa OCHO_A
--   * banco UENO al que pertenece la cuenta 6192000372 (guardada como
--     "6192000372 GS CA", nombre PAGOS - EXTRACTOS, PYG, cuenta mayor 1112801010)
-- No modifica plantillas_base, plantillas existentes, bancos, cuentas,
-- configuraciones ERP, modulos ni datos de otras empresas.
--
-- 1) Conciliacion bancaria - plantilla "OCHO_A UENO vs SAP B1"
--    Archivo de ejemplo: (conciliacion bancaria)UENO EXTRACTO MARZO.xlsx
--    Hoja "Reporte 1", encabezado en fila 1, datos desde fila 2:
--      A Fecha de Confirmacion   -> fecha (DueDate)
--      C Nro. de Comprobante     -> referencia (Reference) [compara]
--      E|D Concepto/Descripcion  -> descripcion (Memo)
--      F Importe Debito          -> debito (DebitAmount)  [compara]
--      G Importe Credito         -> credito (CreditAmount) [compara]
--      F|G                       -> monto (primer importe distinto de cero)
--      H Saldos                  -> saldo (solo visual)
--    Modo de importe debit_credit (como las demas plantillas de OCHO_A).
--    El pie del extracto (textos legales desde la fila ~46) no es un
--    movimiento: quitar esas filas en la vista previa de Cargar Extractos.
--
-- 2) Pago de tarjeta - Tarjeta UENO (/pago-tarjeta-8a/ueno)
--    No requiere datos nuevos: reutiliza el modulo card_payment_ocho_a, la ERP
--    SAP_TARJETAS activa de OCHO_A (query OCRH) y su cuenta de comision de
--    empresas_erp_tarjetas_comisiones. Este script solo VERIFICA esos
--    requisitos (avisos NOTICE y SELECT finales). La Cuenta Deposito sale de la
--    Cuenta Mayor de la cuenta 6192000372.
--
-- Idempotente: si la plantilla ya existe con ese nombre en el banco UENO, no
-- se vuelve a crear ni se modifica. Si una corrida quedo abortada: ROLLBACK; y
-- reintentar.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _ocho_a_ueno_meta (
  company_tax_id TEXT NOT NULL,
  account_number TEXT NOT NULL,
  major_account TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  layout_name TEXT NOT NULL,
  layout_description TEXT NOT NULL,
  bank_sheet TEXT NOT NULL,
  bank_start_row INTEGER NOT NULL,
  bank_end_row INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO _ocho_a_ueno_meta VALUES (
  'OCHO_A',
  -- Solo digitos de cuenta_bancaria_numero ("6192000372 GS CA").
  '6192000372',
  '1112801010',
  'PYG',
  'OCHO_A UENO vs SAP B1',
  'Plantilla UENO exclusiva de OCHO_A (extracto Reporte 1). Compara Nro. de Comprobante e Importe Debito/Credito.',
  'Reporte 1',
  2,
  5000
);

-- Validaciones previas: base, empresa, cuenta 6192000372 y su banco UENO.
DO $$
DECLARE
  expected_database CONSTANT TEXT := 'QONCILIA_BACK';
  meta _ocho_a_ueno_meta%ROWTYPE;
  company_count INTEGER;
  account_count INTEGER;
  target RECORD;
  active_layout_name TEXT;
BEGIN
  IF current_database() <> expected_database THEN
    RAISE EXCEPTION 'Base incorrecta. Esperada %, actual %.', expected_database, current_database();
  END IF;

  SELECT * INTO STRICT meta FROM _ocho_a_ueno_meta;

  SELECT COUNT(*)
  INTO company_count
  FROM public.empresas company
  WHERE LOWER(BTRIM(company.emp_id_fiscal)) = LOWER(meta.company_tax_id)
    AND company.emp_activa = TRUE;

  IF company_count <> 1 THEN
    RAISE EXCEPTION 'Debe existir exactamente una empresa activa OCHO_A. Encontradas: %.', company_count;
  END IF;

  SELECT COUNT(*)
  INTO account_count
  FROM public.cuentas_bancarias account
  JOIN public.empresas company ON company.emp_id = account.empresa_id
  WHERE LOWER(BTRIM(company.emp_id_fiscal)) = LOWER(meta.company_tax_id)
    AND account.cuenta_bancaria_origen_id IS NULL
    AND REGEXP_REPLACE(account.cuenta_bancaria_numero, '[^0-9]', '', 'g') = meta.account_number;

  IF account_count <> 1 THEN
    RAISE EXCEPTION
      'Se esperaba exactamente una cuenta % (origen) en OCHO_A; encontradas: %. Revisa Cuentas Bancarias.',
      meta.account_number,
      account_count;
  END IF;

  SELECT
    account.cuenta_bancaria_id,
    account.cuenta_bancaria_activa,
    BTRIM(account.cuenta_bancaria_numero_mayor) AS major_account,
    UPPER(BTRIM(account.moneda_codigo)) AS currency_code,
    bank.banco_id,
    bank.banco_nombre,
    bank.banco_activo,
    bank.banco_origen_id
  INTO STRICT target
  FROM public.cuentas_bancarias account
  JOIN public.empresas company ON company.emp_id = account.empresa_id
  JOIN public.bancos bank ON bank.banco_id = account.banco_id
  WHERE LOWER(BTRIM(company.emp_id_fiscal)) = LOWER(meta.company_tax_id)
    AND account.cuenta_bancaria_origen_id IS NULL
    AND REGEXP_REPLACE(account.cuenta_bancaria_numero, '[^0-9]', '', 'g') = meta.account_number;

  IF target.cuenta_bancaria_activa IS NOT TRUE THEN
    RAISE EXCEPTION 'La cuenta % de OCHO_A esta inactiva.', meta.account_number;
  END IF;

  IF target.major_account IS DISTINCT FROM meta.major_account THEN
    RAISE EXCEPTION
      'La cuenta % tiene Cuenta Mayor %, se esperaba %. Es la Cuenta Deposito de Tarjeta UENO: corrigela en Cuentas Bancarias o ajusta major_account en este script.',
      meta.account_number,
      COALESCE(target.major_account, '(vacia)'),
      meta.major_account;
  END IF;

  IF target.currency_code IS DISTINCT FROM meta.currency_code THEN
    RAISE EXCEPTION 'La cuenta % no esta en %. Moneda actual: %.',
      meta.account_number, meta.currency_code, COALESCE(target.currency_code, '(vacia)');
  END IF;

  IF target.banco_activo IS NOT TRUE OR target.banco_origen_id IS NOT NULL THEN
    RAISE EXCEPTION 'El banco "%" de la cuenta % debe ser un banco origen activo.',
      target.banco_nombre, meta.account_number;
  END IF;

  IF POSITION('ueno' IN REGEXP_REPLACE(LOWER(target.banco_nombre), '[^a-z0-9]+', '', 'g')) = 0 THEN
    RAISE EXCEPTION 'La cuenta % pertenece al banco "%", no a UENO. No se aplican cambios.',
      meta.account_number, target.banco_nombre;
  END IF;

  -- Una sola plantilla activa por banco (uq_plantillas_conciliacion_activa).
  -- Este script no desactiva plantillas existentes.
  SELECT layout.plantilla_nombre
  INTO active_layout_name
  FROM public.plantillas_conciliacion layout
  WHERE layout.banco_id = target.banco_id
    AND layout.plantilla_activa = TRUE
    AND LOWER(BTRIM(layout.plantilla_nombre)) <> LOWER(meta.layout_name)
  LIMIT 1;

  IF active_layout_name IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.plantillas_conciliacion layout
    WHERE layout.banco_id = target.banco_id
      AND LOWER(BTRIM(layout.plantilla_nombre)) = LOWER(meta.layout_name)
  ) THEN
    RAISE EXCEPTION
      'El banco "%" ya tiene la plantilla activa "%". Este script no la desactiva: decide si se reemplaza antes de ejecutarlo.',
      target.banco_nombre,
      active_layout_name;
  END IF;

  -- Bloquea solo el banco objetivo contra una creacion concurrente.
  PERFORM bank.banco_id FROM public.bancos bank WHERE bank.banco_id = target.banco_id FOR UPDATE;
END;
$$;

CREATE TEMP TABLE _ocho_a_ueno_target ON COMMIT DROP AS
SELECT
  bank.banco_id,
  bank.banco_nombre,
  account.cuenta_bancaria_id
FROM _ocho_a_ueno_meta meta
JOIN public.empresas company
  ON LOWER(BTRIM(company.emp_id_fiscal)) = LOWER(meta.company_tax_id)
JOIN public.cuentas_bancarias account
  ON account.empresa_id = company.emp_id
 AND account.cuenta_bancaria_origen_id IS NULL
 AND REGEXP_REPLACE(account.cuenta_bancaria_numero, '[^0-9]', '', 'g') = meta.account_number
JOIN public.bancos bank ON bank.banco_id = account.banco_id;

-- Foto de las plantillas fuera del banco UENO para comprobar al final que no
-- se toco ninguna.
CREATE TEMP TABLE _ocho_a_ueno_snapshot ON COMMIT DROP AS
SELECT
  (
    SELECT COUNT(*)
    FROM public.plantillas_conciliacion layout
    WHERE layout.banco_id NOT IN (SELECT banco_id FROM _ocho_a_ueno_target)
  ) AS other_layouts,
  (
    SELECT COUNT(*)
    FROM public.plantillas_conciliacion_mapeos mapping
    JOIN public.plantillas_conciliacion layout ON layout.plantilla_id = mapping.plantilla_id
    WHERE layout.banco_id NOT IN (SELECT banco_id FROM _ocho_a_ueno_target)
  ) AS other_mappings,
  (
    SELECT MAX(layout.plantilla_actualizada_en)
    FROM public.plantillas_conciliacion layout
    WHERE layout.banco_id NOT IN (SELECT banco_id FROM _ocho_a_ueno_target)
  ) AS other_layouts_updated_at,
  (
    SELECT COUNT(*)
    FROM public.plantillas_conciliacion layout
    JOIN _ocho_a_ueno_target target ON target.banco_id = layout.banco_id
  ) AS ueno_layouts_before;

CREATE TEMP TABLE _ocho_a_ueno_created_layout (
  plantilla_id INTEGER PRIMARY KEY,
  banco_id INTEGER NOT NULL
) ON COMMIT DROP;

-- Plantilla local del banco UENO (no crea ni edita plantillas_base).
WITH inserted_layout AS (
  INSERT INTO public.plantillas_conciliacion (
    banco_id,
    plantilla_base_id,
    plantilla_nombre,
    plantilla_descripcion,
    plantilla_etiqueta_sistema,
    plantilla_etiqueta_banco,
    plantilla_umbral_auto_match,
    plantilla_monto_modo,
    plantilla_activa
  )
  SELECT
    target.banco_id,
    NULL,
    meta.layout_name,
    meta.layout_description,
    'SAP B1',
    target.banco_nombre,
    0.75,
    'debit_credit',
    TRUE
  FROM _ocho_a_ueno_target target
  CROSS JOIN _ocho_a_ueno_meta meta
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.plantillas_conciliacion layout
    WHERE layout.banco_id = target.banco_id
      AND LOWER(BTRIM(layout.plantilla_nombre)) = LOWER(meta.layout_name)
  )
  RETURNING plantilla_id, banco_id
)
INSERT INTO _ocho_a_ueno_created_layout (plantilla_id, banco_id)
SELECT plantilla_id, banco_id FROM inserted_layout;

-- Mapeos solo para la plantilla creada en esta corrida. El lado sistema replica
-- el de las demas plantillas de OCHO_A (sql/55).
INSERT INTO public.plantillas_conciliacion_mapeos (
  plantilla_id,
  mapeo_clave_campo,
  mapeo_etiqueta,
  mapeo_orden,
  mapeo_activo,
  mapeo_requerido,
  mapeo_operador_comparacion,
  mapeo_peso,
  mapeo_tolerancia,
  sistema_hoja,
  sistema_columna,
  sistema_fila_inicio,
  sistema_fila_fin,
  sistema_tipo_dato,
  banco_hoja,
  banco_columna,
  banco_fila_inicio,
  banco_fila_fin,
  banco_tipo_dato
)
SELECT
  created.plantilla_id,
  mapping.field_key,
  mapping.label,
  mapping.sort_order,
  TRUE,
  mapping.required,
  mapping.comparison_operator,
  mapping.weight,
  mapping.tolerance,
  mapping.system_sheet,
  mapping.system_column,
  mapping.system_start_row,
  mapping.system_end_row,
  mapping.system_data_type,
  meta.bank_sheet,
  mapping.bank_column,
  meta.bank_start_row,
  meta.bank_end_row,
  mapping.bank_data_type
FROM _ocho_a_ueno_created_layout created
CROSS JOIN _ocho_a_ueno_meta meta
CROSS JOIN (
  VALUES
    ('fecha',       'Fecha',       1,  TRUE,  'date_equals',    2, NULL::NUMERIC, 'SAP', 'B',  2,    5000, 'date',   'A',   'date'),
    ('descripcion', 'Descripcion', 2,  FALSE, 'contains',       2, NULL::NUMERIC, 'SAP', 'H',  2,    5000, 'text',   'E|D', 'text'),
    ('monto',       'Monto',       3,  TRUE,  'numeric_equals', 4, 0::NUMERIC,    'SAP', 'G',  2,    5000, 'amount', 'F|G', 'amount'),
    ('referencia',  'Referencia',  4,  FALSE, 'contains',       2, NULL::NUMERIC, 'SAP', 'F',  2,    5000, 'text',   'C',   'text'),
    ('debito',      'Debito',      91, FALSE, 'numeric_equals', 1, 0::NUMERIC,    NULL,  NULL, NULL, NULL, 'amount', 'F',   'amount'),
    ('credito',     'Credito',     92, FALSE, 'numeric_equals', 1, 0::NUMERIC,    NULL,  NULL, NULL, NULL, 'amount', 'G',   'amount'),
    ('saldo',       'Saldo',       95, FALSE, 'numeric_equals', 0, 0::NUMERIC,    NULL,  NULL, NULL, NULL, 'amount', 'H',   'amount')
) AS mapping(
  field_key,
  label,
  sort_order,
  required,
  comparison_operator,
  weight,
  tolerance,
  system_sheet,
  system_column,
  system_start_row,
  system_end_row,
  system_data_type,
  bank_column,
  bank_data_type
);

-- Verificaciones posteriores. Si alguna falla, se revierte todo.
DO $$
DECLARE
  snap _ocho_a_ueno_snapshot%ROWTYPE;
  created_count INTEGER;
  mapping_count INTEGER;
  ueno_layouts_after INTEGER;
BEGIN
  SELECT * INTO STRICT snap FROM _ocho_a_ueno_snapshot;
  SELECT COUNT(*) INTO created_count FROM _ocho_a_ueno_created_layout;

  SELECT COUNT(*)
  INTO ueno_layouts_after
  FROM public.plantillas_conciliacion layout
  JOIN _ocho_a_ueno_target target ON target.banco_id = layout.banco_id;

  IF ueno_layouts_after <> snap.ueno_layouts_before + created_count THEN
    RAISE EXCEPTION 'Cambio inesperado en las plantillas del banco UENO. Abortado.';
  END IF;

  IF created_count = 1 THEN
    SELECT COUNT(*)
    INTO mapping_count
    FROM public.plantillas_conciliacion_mapeos mapping
    JOIN _ocho_a_ueno_created_layout created ON created.plantilla_id = mapping.plantilla_id
    WHERE LOWER(BTRIM(mapping.mapeo_clave_campo)) IN (
      'fecha', 'descripcion', 'monto', 'referencia', 'debito', 'credito', 'saldo'
    );

    IF mapping_count <> 7 THEN
      RAISE EXCEPTION 'La plantilla UENO quedo con % de 7 mapeos. Abortado.', mapping_count;
    END IF;
  ELSIF created_count <> 0 THEN
    RAISE EXCEPTION 'Se esperaba crear como maximo una plantilla UENO; se crearon %. Abortado.', created_count;
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.plantillas_conciliacion layout
    WHERE layout.banco_id NOT IN (SELECT banco_id FROM _ocho_a_ueno_target)
  ) <> snap.other_layouts
  OR (
    SELECT COUNT(*)
    FROM public.plantillas_conciliacion_mapeos mapping
    JOIN public.plantillas_conciliacion layout ON layout.plantilla_id = mapping.plantilla_id
    WHERE layout.banco_id NOT IN (SELECT banco_id FROM _ocho_a_ueno_target)
  ) <> snap.other_mappings
  OR (
    SELECT MAX(layout.plantilla_actualizada_en)
    FROM public.plantillas_conciliacion layout
    WHERE layout.banco_id NOT IN (SELECT banco_id FROM _ocho_a_ueno_target)
  ) IS DISTINCT FROM snap.other_layouts_updated_at THEN
    RAISE EXCEPTION 'Se modificaron plantillas de otros bancos o empresas. Abortado.';
  END IF;
END;
$$;

-- Requisitos de la pestana Tarjeta UENO (solo lectura, no bloquean la plantilla).
DO $$
DECLARE
  sap_tarjetas_count INTEGER;
  commission_account TEXT;
  enabled_roles INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO sap_tarjetas_count
  FROM public.empresas_erp_configuraciones config
  JOIN public.empresas company ON company.emp_id = config.emp_id
  WHERE LOWER(BTRIM(company.emp_id_fiscal)) = 'ocho_a'
    AND LOWER(BTRIM(config.epc_codigo)) = 'sap_tarjetas'
    AND config.epc_activo = TRUE
    AND NULLIF(BTRIM(config.query_sistema), '') IS NOT NULL;

  IF sap_tarjetas_count <> 1 THEN
    RAISE NOTICE 'Tarjeta UENO: OCHO_A debe tener exactamente una ERP SAP_TARJETAS activa con query_sistema. Encontradas: %.', sap_tarjetas_count;
  END IF;

  IF to_regclass('public.empresas_erp_tarjetas_comisiones') IS NULL THEN
    RAISE NOTICE 'Tarjeta UENO: falta la tabla empresas_erp_tarjetas_comisiones (sql/64 y sql/65).';
  ELSE
    EXECUTE $q$
      SELECT MAX(commission.etc_cuenta_comision_credito)
      FROM public.empresas_erp_tarjetas_comisiones commission
      JOIN public.empresas_erp_configuraciones config ON config.epc_id = commission.epc_id
      JOIN public.empresas company ON company.emp_id = config.emp_id
      WHERE LOWER(BTRIM(company.emp_id_fiscal)) = 'ocho_a'
        AND LOWER(BTRIM(config.epc_codigo)) = 'sap_tarjetas'
        AND config.epc_activo = TRUE
        AND commission.etc_activa = TRUE
    $q$
    INTO commission_account;

    IF commission_account IS NULL THEN
      RAISE NOTICE 'Tarjeta UENO: OCHO_A no tiene cuenta de comision activa (sql/65). Los lotes con comision no se podran depositar.';
    END IF;
  END IF;

  SELECT COUNT(*)
  INTO enabled_roles
  FROM public.empresas_roles_modulos erm
  JOIN public.empresas company ON company.emp_id = erm.emp_id
  JOIN public.modulos module ON module.mod_id = erm.mod_id
  WHERE LOWER(BTRIM(company.emp_id_fiscal)) = 'ocho_a'
    AND LOWER(BTRIM(module.mod_codigo)) = 'card_payment_ocho_a'
    AND module.mod_activo = TRUE
    AND erm.erm_habilitado = TRUE;

  IF enabled_roles = 0 THEN
    RAISE NOTICE 'Tarjeta UENO: card_payment_ocho_a no esta habilitado para ningun rol de OCHO_A (sql/48).';
  END IF;
END;
$$;

-- Resultado: plantilla UENO y sus mapeos.
SELECT
  bank.banco_nombre AS banco,
  layout.plantilla_id,
  layout.plantilla_nombre,
  layout.plantilla_activa,
  layout.plantilla_monto_modo,
  CASE
    WHEN created.plantilla_id IS NOT NULL THEN 'CREADA POR ESTE SCRIPT'
    ELSE 'YA EXISTIA (SIN CAMBIOS)'
  END AS resultado
FROM _ocho_a_ueno_target target
JOIN public.bancos bank ON bank.banco_id = target.banco_id
JOIN public.plantillas_conciliacion layout ON layout.banco_id = target.banco_id
LEFT JOIN _ocho_a_ueno_created_layout created ON created.plantilla_id = layout.plantilla_id
ORDER BY layout.plantilla_activa DESC, layout.plantilla_id;

SELECT
  mapping.mapeo_clave_campo AS campo,
  mapping.banco_hoja AS hoja_banco,
  mapping.banco_columna AS columna_banco,
  mapping.banco_fila_inicio AS fila_inicio,
  mapping.banco_tipo_dato AS tipo,
  mapping.mapeo_requerido AS requerido
FROM _ocho_a_ueno_target target
CROSS JOIN _ocho_a_ueno_meta meta
JOIN public.plantillas_conciliacion layout
  ON layout.banco_id = target.banco_id
 AND LOWER(BTRIM(layout.plantilla_nombre)) = LOWER(meta.layout_name)
JOIN public.plantillas_conciliacion_mapeos mapping ON mapping.plantilla_id = layout.plantilla_id
ORDER BY mapping.mapeo_orden, mapping.mapeo_id;

-- Cuenta UENO que se vincula a la plantilla y que usa Tarjeta UENO como
-- Cuenta Deposito (Cuenta Mayor). Cuenta Pago ERP vacia = el deposito no envia
-- BankAccountNum (igual que hoy en las cuentas sin ese dato).
SELECT
  bank.banco_nombre AS banco,
  bank.banco_descripcion AS cabecera_bank,
  account.cuenta_bancaria_nombre AS cuenta,
  account.cuenta_bancaria_numero AS numero,
  account.moneda_codigo AS moneda,
  account.cuenta_bancaria_numero_mayor AS cuenta_mayor_deposito,
  account.cuenta_bancaria_numero_pago AS cuenta_pago_erp,
  account.cuenta_bancaria_sucursal AS sucursal,
  account.cuenta_bancaria_activa AS activa
FROM _ocho_a_ueno_target target
JOIN public.cuentas_bancarias account ON account.cuenta_bancaria_id = target.cuenta_bancaria_id
JOIN public.bancos bank ON bank.banco_id = target.banco_id;

-- Requisitos de Tarjeta UENO.
SELECT
  company.emp_id_fiscal AS empresa,
  config.epc_id,
  config.epc_codigo,
  config.epc_activo,
  (NULLIF(BTRIM(config.query_sistema), '') IS NOT NULL) AS tiene_query_ocrh
FROM public.empresas_erp_configuraciones config
JOIN public.empresas company ON company.emp_id = config.emp_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) = 'ocho_a'
  AND LOWER(BTRIM(config.epc_codigo)) = 'sap_tarjetas';

SELECT
  r.rol_codigo,
  m.mod_codigo,
  erm.erm_habilitado
FROM public.empresas_roles_modulos erm
JOIN public.empresas company ON company.emp_id = erm.emp_id
JOIN public.roles r ON r.rol_id = erm.rol_id
JOIN public.modulos m ON m.mod_id = erm.mod_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) = 'ocho_a'
  AND LOWER(BTRIM(m.mod_codigo)) = 'card_payment_ocho_a'
ORDER BY r.rol_codigo;

COMMIT;

-- -----------------------------------------------------------------------------
-- OPCIONAL (no se ejecuta: esta comentado). Solo si quieren que los depositos
-- de Tarjeta UENO envien BankAccountNum = 6192000372 en la cabecera SAP:
--
-- UPDATE public.cuentas_bancarias account
-- SET cuenta_bancaria_numero_pago = '6192000372',
--     cuenta_bancaria_actualizado_en = NOW()
-- FROM public.empresas company
-- WHERE company.emp_id = account.empresa_id
--   AND LOWER(BTRIM(company.emp_id_fiscal)) = 'ocho_a'
--   AND account.cuenta_bancaria_origen_id IS NULL
--   AND REGEXP_REPLACE(account.cuenta_bancaria_numero, '[^0-9]', '', 'g') = '6192000372'
--   AND NULLIF(BTRIM(account.cuenta_bancaria_numero_pago), '') IS NULL;
-- -----------------------------------------------------------------------------
