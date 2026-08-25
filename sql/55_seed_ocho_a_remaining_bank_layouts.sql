-- =============================================================================
-- Plantillas de extractos adicionales EXCLUSIVAS de OCHO_A (empresa_id = 6).
--
-- Archivos verificados en ../EXTRACTOS BANCOS:
--   * BASA EXTRACTO 01-01 AL 31-01.xlsx
--   * FAMILIAR EXTRACTO 01-01 AL 31-01.xls
--   * GNB EXTRACTO 01-01 AL 31-01.xlsx
--   * ITAU EXTRACTO 01-01 AL 31-01.xlsx
--
-- No incluye Sudameris (script 54) ni Continental (script 52): ambos ya tienen
-- un layout propio para OCHO_A. Tampoco modifica plantillas_base ni bancos de
-- otras empresas.
--
-- Comportamiento seguro e idempotente:
--   - valida que exista exactamente un banco activo de OCHO_A por cada formato;
--   - si el banco ya tiene cualquier plantilla, activa o inactiva, lo deja
--     completamente intacto;
--   - solo si el banco no tiene ninguna plantilla crea el layout local que se
--     identifica con el prefijo OCHO_A;
--   - una nueva ejecucion no duplica ni actualiza layouts existentes.
--
-- EJECUCION MANUAL: revisar el resultado de los SELECT finales y ejecutar en la
-- base correspondiente, luego de desplegar el backend que soporta
-- plantilla_monto_modo = 'debit_credit'.
-- =============================================================================

BEGIN;

-- Especificaciones tomadas directamente de los cuatro extractos de ejemplo.
-- La expresion E|F (o equivalente) toma la primera columna no-cero. Se usa
-- junto a los mapeos separados debito/credito para representar ambos sentidos
-- en BankPages de SAP B1.
CREATE TEMP TABLE _ocho_a_bank_layout_specs (
  bank_key TEXT PRIMARY KEY,
  bank_tokens TEXT[] NOT NULL,
  layout_name TEXT NOT NULL,
  layout_description TEXT NOT NULL,
  bank_sheet TEXT NOT NULL,
  bank_start_row INTEGER NOT NULL,
  date_column TEXT NOT NULL,
  description_column TEXT NOT NULL,
  amount_columns TEXT NOT NULL,
  reference_column TEXT NOT NULL,
  debit_column TEXT NOT NULL,
  credit_column TEXT NOT NULL,
  balance_column TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _ocho_a_bank_layout_specs (
  bank_key,
  bank_tokens,
  layout_name,
  layout_description,
  bank_sheet,
  bank_start_row,
  date_column,
  description_column,
  amount_columns,
  reference_column,
  debit_column,
  credit_column,
  balance_column
) VALUES
  (
    'BASA',
    ARRAY['basa', 'atlas'],
    'OCHO_A BASA vs SAP B1',
    'Plantilla BASA exclusiva de OCHO_A, basada en el extracto USD de enero de 2026.',
    'Extracto', 9, 'A', 'D', 'E|F', 'B|P', 'E', 'F', 'G'
  ),
  (
    'FAMILIAR',
    ARRAY['familiar'],
    'OCHO_A Familiar vs SAP B1',
    'Plantilla Banco Familiar exclusiva de OCHO_A, basada en el extracto PYG de enero de 2026.',
    'movimientos', 13, 'B', 'D', 'E|F', 'C', 'E', 'F', 'G'
  ),
  (
    'GNB',
    ARRAY['gnb'],
    'OCHO_A GNB vs SAP B1',
    'Plantilla GNB exclusiva de OCHO_A, basada en el extracto USD de enero de 2026.',
    'report', 15, 'B', 'G', 'H|I', 'E|D', 'H', 'I', 'J'
  ),
  (
    'ITAU',
    ARRAY['itau'],
    'OCHO_A Itau vs SAP B1',
    'Plantilla Itau exclusiva de OCHO_A, basada en el extracto USD de enero de 2026.',
    'Contenido', 10, 'A', 'B', 'D|E', 'C', 'D', 'E', 'F'
  );

-- Se exige simultaneamente empresa_id = 6 y emp_id_fiscal = OCHO_A. La
-- combinacion es la barrera de alcance del script. No se seleccionan bancos
-- copiados ni bancos de otra empresa.
DO $$
DECLARE
  spec RECORD;
  matched_bank_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas company
    WHERE company.emp_id = 6
      AND LOWER(TRIM(company.emp_id_fiscal)) = LOWER('OCHO_A')
  ) THEN
    RAISE EXCEPTION
      'La empresa emp_id = 6 no existe o su emp_id_fiscal no es OCHO_A. No se aplican cambios.';
  END IF;

  FOR spec IN
    SELECT *
    FROM _ocho_a_bank_layout_specs
    ORDER BY bank_key
  LOOP
    SELECT COUNT(*)
    INTO matched_bank_count
    FROM public.bancos bank
    WHERE bank.empresa_id = 6
      AND bank.banco_activo = TRUE
      AND bank.banco_origen_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM unnest(spec.bank_tokens) AS token(value)
        WHERE REGEXP_REPLACE(LOWER(bank.banco_nombre), '[^a-z0-9]+', '', 'g')
          LIKE '%' || token.value || '%'
      );

    IF matched_bank_count <> 1 THEN
      RAISE EXCEPTION
        'Se esperaba exactamente un banco activo de OCHO_A para %; encontrados: %. Revisa banco_nombre, banco_activo y banco_origen_id antes de ejecutar.',
        spec.bank_key,
        matched_bank_count;
    END IF;

    -- Bloquea solo el registro del banco objetivo durante esta transaccion. Es
    -- una proteccion contra la creacion concurrente de layouts para el mismo
    -- banco; no modifica ningun dato del banco.
    PERFORM bank.banco_id
    FROM public.bancos bank
    WHERE bank.empresa_id = 6
      AND bank.banco_activo = TRUE
      AND bank.banco_origen_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM unnest(spec.bank_tokens) AS token(value)
        WHERE REGEXP_REPLACE(LOWER(bank.banco_nombre), '[^a-z0-9]+', '', 'g')
          LIKE '%' || token.value || '%'
      )
    FOR UPDATE;
  END LOOP;
END;
$$;

-- Solo entran a esta tabla temporal los bancos que NO tienen ningun layout,
-- independientemente de si los layouts existentes estuvieran activos o
-- inactivos. Cualquier layout previo prevalece y permanece intacto.
CREATE TEMP TABLE _ocho_a_missing_bank_layouts ON COMMIT DROP AS
SELECT
  spec.*,
  bank.banco_id,
  bank.banco_nombre
FROM _ocho_a_bank_layout_specs spec
JOIN public.bancos bank
  ON bank.empresa_id = 6
  AND bank.banco_activo = TRUE
  AND bank.banco_origen_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM unnest(spec.bank_tokens) AS token(value)
    WHERE REGEXP_REPLACE(LOWER(bank.banco_nombre), '[^a-z0-9]+', '', 'g')
      LIKE '%' || token.value || '%'
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plantillas_conciliacion existing_layout
  WHERE existing_layout.banco_id = bank.banco_id
);

-- Guarda los IDs devueltos por el INSERT para que todos los mapeos posteriores
-- se vinculen exclusivamente a layouts creados por esta ejecucion.
CREATE TEMP TABLE _ocho_a_created_bank_layouts (
  plantilla_id INTEGER PRIMARY KEY,
  banco_id INTEGER NOT NULL UNIQUE,
  bank_key TEXT NOT NULL,
  layout_name TEXT NOT NULL,
  bank_sheet TEXT NOT NULL,
  bank_start_row INTEGER NOT NULL,
  date_column TEXT NOT NULL,
  description_column TEXT NOT NULL,
  amount_columns TEXT NOT NULL,
  reference_column TEXT NOT NULL,
  debit_column TEXT NOT NULL,
  credit_column TEXT NOT NULL,
  balance_column TEXT NOT NULL
) ON COMMIT DROP;

-- Crea un layout directo/local; no crea ni edita una plantilla_base global.
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
    target.layout_name,
    target.layout_description,
    'SAP B1',
    target.banco_nombre,
    0.75,
    'debit_credit',
    TRUE
  FROM _ocho_a_missing_bank_layouts target
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.plantillas_conciliacion layout
    WHERE layout.banco_id = target.banco_id
  )
  RETURNING plantilla_id, banco_id, plantilla_nombre
)
INSERT INTO _ocho_a_created_bank_layouts (
  plantilla_id,
  banco_id,
  bank_key,
  layout_name,
  bank_sheet,
  bank_start_row,
  date_column,
  description_column,
  amount_columns,
  reference_column,
  debit_column,
  credit_column,
  balance_column
)
SELECT
  inserted.plantilla_id,
  target.banco_id,
  target.bank_key,
  target.layout_name,
  target.bank_sheet,
  target.bank_start_row,
  target.date_column,
  target.description_column,
  target.amount_columns,
  target.reference_column,
  target.debit_column,
  target.credit_column,
  target.balance_column
FROM inserted_layout inserted
JOIN _ocho_a_missing_bank_layouts target
  ON target.banco_id = inserted.banco_id
  AND LOWER(target.layout_name) = LOWER(inserted.plantilla_nombre);

DO $$
DECLARE
  expected_count INTEGER;
  created_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO expected_count
  FROM _ocho_a_missing_bank_layouts;

  SELECT COUNT(*) INTO created_count
  FROM _ocho_a_created_bank_layouts;

  IF created_count <> expected_count THEN
    RAISE EXCEPTION
      'Se esperaban crear % layouts de OCHO_A, pero se crearon %. La transaccion se revierte para no tocar layouts existentes.',
      expected_count,
      created_count;
  END IF;
END;
$$;

-- Mapeos que se aplican solo a los layouts locales configurados arriba.
CREATE TEMP TABLE _ocho_a_bank_mapping_specs ON COMMIT DROP AS
SELECT
  target.plantilla_id,
  target.banco_id,
  target.layout_name,
  mapping.field_key,
  mapping.label,
  mapping.sort_order,
  mapping.required,
  mapping.comparison_operator,
  mapping.weight,
  mapping.tolerance,
  mapping.system_sheet,
  mapping.system_column,
  mapping.system_start_row,
  mapping.system_end_row,
  mapping.system_data_type,
  mapping.bank_column,
  mapping.bank_data_type
FROM _ocho_a_created_bank_layouts target
CROSS JOIN LATERAL (
  VALUES
    ('fecha',       'Fecha',       1,  TRUE,  'date_equals',    2, NULL::NUMERIC, 'SAP', 'B', 2, 5000, 'date',   target.date_column,        'date'),
    ('descripcion', 'Descripcion', 2,  FALSE, 'contains',       2, NULL::NUMERIC, 'SAP', 'H', 2, 5000, 'text',   target.description_column, 'text'),
    ('monto',       'Monto',       3,  TRUE,  'numeric_equals', 4, 0::NUMERIC,    'SAP', 'G', 2, 5000, 'amount', target.amount_columns,      'amount'),
    ('referencia',  'Referencia',  4,  FALSE, 'contains',       2, NULL::NUMERIC, 'SAP', 'F', 2, 5000, 'text',   target.reference_column,   'text'),
    ('debito',      'Debito',      91, FALSE, 'numeric_equals', 1, 0::NUMERIC,    NULL,  NULL, NULL, NULL, 'amount', target.debit_column,       'amount'),
    ('credito',     'Credito',     92, FALSE, 'numeric_equals', 1, 0::NUMERIC,    NULL,  NULL, NULL, NULL, 'amount', target.credit_column,      'amount'),
    ('saldo',       'Saldo',       95, FALSE, 'numeric_equals', 0, 0::NUMERIC,    NULL,  NULL, NULL, NULL, 'amount', target.balance_column,     'amount')
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

-- Inserta los mapeos del layout recien creado. No existe ningun UPDATE ni
-- DELETE sobre plantillas o mapeos persistentes en este script.
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
  source.plantilla_id,
  source.field_key,
  source.label,
  source.sort_order,
  TRUE,
  source.required,
  source.comparison_operator,
  source.weight,
  source.tolerance,
  source.system_sheet,
  source.system_column,
  source.system_start_row,
  source.system_end_row,
  source.system_data_type,
  target.bank_sheet,
  source.bank_column,
  target.bank_start_row,
  5000,
  source.bank_data_type
FROM _ocho_a_bank_mapping_specs source
JOIN _ocho_a_created_bank_layouts target
  ON target.plantilla_id = source.plantilla_id;

-- Verifica que cada layout configurado por este script tenga los siete campos
-- necesarios. Si falla, la transaccion completa se revierte.
DO $$
DECLARE
  invalid_layout_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO invalid_layout_count
  FROM _ocho_a_created_bank_layouts target
  LEFT JOIN LATERAL (
    SELECT
      layout.plantilla_id,
      COUNT(*) FILTER (
        WHERE LOWER(TRIM(mapping.mapeo_clave_campo)) IN (
          'fecha', 'descripcion', 'monto', 'referencia', 'debito', 'credito', 'saldo'
        )
      ) AS mapping_count
    FROM public.plantillas_conciliacion layout
    LEFT JOIN public.plantillas_conciliacion_mapeos mapping
      ON mapping.plantilla_id = layout.plantilla_id
    WHERE layout.plantilla_id = target.plantilla_id
      AND layout.banco_id = target.banco_id
      AND layout.plantilla_base_id IS NULL
      AND layout.plantilla_activa = TRUE
    GROUP BY layout.plantilla_id
  ) layout_check ON TRUE
  WHERE layout_check.plantilla_id IS NULL
    OR layout_check.mapping_count <> 7;

  IF invalid_layout_count <> 0 THEN
    RAISE EXCEPTION
      'No se pudieron dejar completos los mapeos de % layout(s) local(es) de OCHO_A. No se aplicaron cambios.',
      invalid_layout_count;
  END IF;
END;
$$;

-- Verificacion posterior. "CONFIGURADA" significa que no tenia ninguna
-- plantilla; "OMITIDA" conserva todos sus layouts existentes sin cambios.
SELECT
  spec.bank_key AS banco_esperado,
  bank.banco_id,
  bank.banco_nombre,
  CASE
    WHEN configured.banco_id IS NOT NULL THEN 'CONFIGURADA POR ESTE SCRIPT'
    ELSE 'OMITIDA: YA TENIA UNA O MAS PLANTILLAS'
  END AS resultado,
  COUNT(layout.plantilla_id) AS cantidad_plantillas,
  COUNT(layout.plantilla_id) FILTER (
    WHERE layout.plantilla_activa = TRUE
  ) AS cantidad_activas,
  STRING_AGG(
    layout.plantilla_nombre || CASE
      WHEN layout.plantilla_activa = TRUE THEN ' [ACTIVA]'
      ELSE ' [INACTIVA]'
    END,
    ', '
    ORDER BY layout.plantilla_id
  ) AS plantillas
FROM _ocho_a_bank_layout_specs spec
JOIN public.bancos bank
  ON bank.empresa_id = 6
  AND bank.banco_activo = TRUE
  AND bank.banco_origen_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM unnest(spec.bank_tokens) AS token(value)
    WHERE REGEXP_REPLACE(LOWER(bank.banco_nombre), '[^a-z0-9]+', '', 'g')
      LIKE '%' || token.value || '%'
  )
LEFT JOIN public.plantillas_conciliacion layout
  ON layout.banco_id = bank.banco_id
LEFT JOIN _ocho_a_created_bank_layouts configured
  ON configured.banco_id = bank.banco_id
GROUP BY
  spec.bank_key,
  bank.banco_id,
  bank.banco_nombre,
  configured.banco_id
ORDER BY spec.bank_key;

SELECT
  target.bank_key AS banco,
  mapping.mapeo_clave_campo AS campo,
  mapping.banco_hoja AS hoja_banco,
  mapping.banco_columna AS columna_banco,
  mapping.banco_fila_inicio AS fila_inicio,
  mapping.banco_tipo_dato AS tipo,
  mapping.mapeo_activo AS activo
FROM _ocho_a_created_bank_layouts target
JOIN public.plantillas_conciliacion layout
  ON layout.plantilla_id = target.plantilla_id
  AND layout.banco_id = target.banco_id
  AND layout.plantilla_base_id IS NULL
  AND LOWER(TRIM(layout.plantilla_nombre)) = LOWER(target.layout_name)
  AND layout.plantilla_activa = TRUE
JOIN public.plantillas_conciliacion_mapeos mapping
  ON mapping.plantilla_id = layout.plantilla_id
WHERE LOWER(TRIM(mapping.mapeo_clave_campo)) IN (
  'fecha', 'descripcion', 'monto', 'referencia', 'debito', 'credito', 'saldo'
)
ORDER BY target.bank_key, mapping.mapeo_orden, mapping.mapeo_id;

COMMIT;
