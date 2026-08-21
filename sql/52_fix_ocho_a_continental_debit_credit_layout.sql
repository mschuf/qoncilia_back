-- =============================================================================
-- Corrige la plantilla Continental EXCLUSIVA de OCHO_A para BankPages SAP_B1.
--
-- Convencion del extracto Continental (confirmada en la plantilla existente):
--   columna E / DEBE  -> DebitAmount  (egreso)
--   columna F / HABER -> CreditAmount (ingreso)
--
-- La plantilla anterior conserva un mapeo combinado E|F (Monto) para
-- compatibilidad visual, pero este script garantiza que el envio a Service
-- Layer use los dos mapeos separados y el modo debit_credit.
--
-- Alcance: solo el banco Continental de la empresa OCHO_A. No toca plantillas
-- base, otras empresas, otros bancos ni extractos ya cargados.
--
-- EJECUCION MANUAL: revisar y ejecutar en la base correspondiente, despues de
-- desplegar el backend que ya soporta plantilla_monto_modo = debit_credit.
-- Es idempotente: se puede ejecutar mas de una vez.
-- =============================================================================

BEGIN;

-- Se detiene si la configuracion objetivo no es inequivoca. Asi no se modifica
-- por error un banco/layout distinto al de OCHO_A.
DO $$
DECLARE
  continental_bank_count INTEGER;
  active_layout_count INTEGER;
  amount_mapping_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO continental_bank_count
  FROM public.bancos b
  JOIN public.empresas e ON e.emp_id = b.empresa_id
  WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('OCHO_A')
    AND b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental');

  IF continental_bank_count <> 1 THEN
    RAISE EXCEPTION
      'Se esperaba un unico banco Continental para OCHO_A; encontrados: %.',
      continental_bank_count;
  END IF;

  SELECT COUNT(*)
  INTO active_layout_count
  FROM public.plantillas_conciliacion l
  JOIN public.bancos b ON b.banco_id = l.banco_id
  JOIN public.empresas e ON e.emp_id = b.empresa_id
  WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('OCHO_A')
    AND b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental')
    AND l.plantilla_activa = TRUE;

  IF active_layout_count <> 1 THEN
    RAISE EXCEPTION
      'Se esperaba una unica plantilla Continental activa para OCHO_A; encontradas: %.',
      active_layout_count;
  END IF;

  SELECT COUNT(*)
  INTO amount_mapping_count
  FROM public.plantillas_conciliacion_mapeos m
  JOIN public.plantillas_conciliacion l ON l.plantilla_id = m.plantilla_id
  JOIN public.bancos b ON b.banco_id = l.banco_id
  JOIN public.empresas e ON e.emp_id = b.empresa_id
  WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('OCHO_A')
    AND b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental')
    AND l.plantilla_activa = TRUE
    AND LOWER(TRIM(m.mapeo_clave_campo)) IN ('monto', 'importe', 'amount')
    AND LOWER(TRIM(m.banco_tipo_dato)) IN ('amount', 'number');

  IF amount_mapping_count = 0 THEN
    RAISE EXCEPTION
      'La plantilla Continental activa de OCHO_A no tiene el mapeo Monto/Importe de origen para copiar hoja y filas.';
  END IF;
END;
$$;

-- Obliga a que la carga para SAP use columnas separadas. Al preparar cada
-- BankPage, el backend enviara solo el campo que corresponda:
--   DEBE  -> DebitAmount
--   HABER -> CreditAmount
WITH target_layout AS (
  SELECT l.plantilla_id
  FROM public.plantillas_conciliacion l
  JOIN public.bancos b ON b.banco_id = l.banco_id
  JOIN public.empresas e ON e.emp_id = b.empresa_id
  WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('OCHO_A')
    AND b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental')
    AND l.plantilla_activa = TRUE
)
UPDATE public.plantillas_conciliacion l
SET
  plantilla_monto_modo = 'debit_credit',
  plantilla_actualizada_en = NOW()
FROM target_layout target
WHERE l.plantilla_id = target.plantilla_id;

-- Toma hoja y rango de filas desde el mapeo de importe ya existente. Solo se
-- corrigen las columnas: E=DEBE y F=HABER. Esto evita suponer el nombre real de
-- la hoja del Excel de Continental.
WITH target_layout AS (
  SELECT l.plantilla_id
  FROM public.plantillas_conciliacion l
  JOIN public.bancos b ON b.banco_id = l.banco_id
  JOIN public.empresas e ON e.emp_id = b.empresa_id
  WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('OCHO_A')
    AND b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental')
    AND l.plantilla_activa = TRUE
), amount_source AS (
  SELECT DISTINCT ON (m.plantilla_id)
    m.plantilla_id,
    m.banco_hoja,
    m.banco_fila_inicio,
    m.banco_fila_fin
  FROM public.plantillas_conciliacion_mapeos m
  JOIN target_layout target ON target.plantilla_id = m.plantilla_id
  WHERE LOWER(TRIM(m.mapeo_clave_campo)) IN ('monto', 'importe', 'amount')
    AND LOWER(TRIM(m.banco_tipo_dato)) IN ('amount', 'number')
  ORDER BY m.plantilla_id, m.mapeo_orden, m.mapeo_id
), desired_mappings AS (
  SELECT
    source.plantilla_id,
    mapping.field_key,
    mapping.label,
    mapping.bank_column,
    mapping.sort_order,
    source.banco_hoja,
    source.banco_fila_inicio,
    source.banco_fila_fin
  FROM amount_source source
  CROSS JOIN LATERAL (
    VALUES
      ('debito',  'Debito (DEBE)',   'E', 91),
      ('credito', 'Credito (HABER)', 'F', 92)
  ) AS mapping(field_key, label, bank_column, sort_order)
)
UPDATE public.plantillas_conciliacion_mapeos target
SET
  mapeo_etiqueta = source.label,
  mapeo_orden = source.sort_order,
  mapeo_activo = TRUE,
  mapeo_requerido = FALSE,
  mapeo_operador_comparacion = 'numeric_equals',
  mapeo_peso = 1,
  mapeo_tolerancia = 0,
  sistema_hoja = NULL,
  sistema_columna = NULL,
  sistema_fila_inicio = NULL,
  sistema_fila_fin = NULL,
  sistema_tipo_dato = 'amount',
  banco_hoja = source.banco_hoja,
  banco_columna = source.bank_column,
  banco_fila_inicio = source.banco_fila_inicio,
  banco_fila_fin = source.banco_fila_fin,
  banco_tipo_dato = 'amount',
  mapeo_actualizado_en = NOW()
FROM desired_mappings source
WHERE target.plantilla_id = source.plantilla_id
  AND LOWER(TRIM(target.mapeo_clave_campo)) = source.field_key;

-- Crea Debito/Credito si el layout de OCHO_A aun no los tenia. No utiliza
-- ON CONFLICT para mantener compatibilidad con la instalacion existente: el
-- indice unico funcional tambien queda cubierto por el NOT EXISTS.
WITH target_layout AS (
  SELECT l.plantilla_id
  FROM public.plantillas_conciliacion l
  JOIN public.bancos b ON b.banco_id = l.banco_id
  JOIN public.empresas e ON e.emp_id = b.empresa_id
  WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('OCHO_A')
    AND b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental')
    AND l.plantilla_activa = TRUE
), amount_source AS (
  SELECT DISTINCT ON (m.plantilla_id)
    m.plantilla_id,
    m.banco_hoja,
    m.banco_fila_inicio,
    m.banco_fila_fin
  FROM public.plantillas_conciliacion_mapeos m
  JOIN target_layout target ON target.plantilla_id = m.plantilla_id
  WHERE LOWER(TRIM(m.mapeo_clave_campo)) IN ('monto', 'importe', 'amount')
    AND LOWER(TRIM(m.banco_tipo_dato)) IN ('amount', 'number')
  ORDER BY m.plantilla_id, m.mapeo_orden, m.mapeo_id
), desired_mappings AS (
  SELECT
    source.plantilla_id,
    mapping.field_key,
    mapping.label,
    mapping.bank_column,
    mapping.sort_order,
    source.banco_hoja,
    source.banco_fila_inicio,
    source.banco_fila_fin
  FROM amount_source source
  CROSS JOIN LATERAL (
    VALUES
      ('debito',  'Debito (DEBE)',   'E', 91),
      ('credito', 'Credito (HABER)', 'F', 92)
  ) AS mapping(field_key, label, bank_column, sort_order)
)
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
  FALSE,
  'numeric_equals',
  1,
  0,
  NULL,
  NULL,
  NULL,
  NULL,
  'amount',
  source.banco_hoja,
  source.bank_column,
  source.banco_fila_inicio,
  source.banco_fila_fin,
  'amount'
FROM desired_mappings source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plantillas_conciliacion_mapeos existing
  WHERE existing.plantilla_id = source.plantilla_id
    AND LOWER(TRIM(existing.mapeo_clave_campo)) = source.field_key
);

-- Verificacion posterior (solo lectura). Debe mostrar el modo debit_credit y:
-- Debito (DEBE) = E, Credito (HABER) = F, en la unica plantilla de OCHO_A.
SELECT
  e.emp_id_fiscal AS empresa_codigo,
  b.banco_nombre AS banco,
  l.plantilla_nombre AS plantilla,
  l.plantilla_monto_modo AS modo_importe,
  m.mapeo_clave_campo AS campo,
  m.mapeo_etiqueta AS etiqueta,
  m.banco_columna AS columna_banco,
  m.banco_hoja AS hoja_banco,
  m.banco_fila_inicio AS fila_inicio,
  m.banco_fila_fin AS fila_fin,
  m.mapeo_activo AS activo
FROM public.plantillas_conciliacion l
JOIN public.bancos b ON b.banco_id = l.banco_id
JOIN public.empresas e ON e.emp_id = b.empresa_id
JOIN public.plantillas_conciliacion_mapeos m ON m.plantilla_id = l.plantilla_id
WHERE LOWER(TRIM(e.emp_id_fiscal)) = LOWER('OCHO_A')
  AND b.banco_origen_id IS NULL
  AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
    IN ('continental', 'bancocontinental')
  AND l.plantilla_activa = TRUE
  AND LOWER(TRIM(m.mapeo_clave_campo)) IN ('debito', 'credito')
ORDER BY m.mapeo_orden, m.mapeo_id;

COMMIT;
