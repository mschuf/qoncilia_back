-- =============================================================================
-- Plantilla Sudameris USD EXCLUSIVA de OCHO_A.
--
-- Archivo verificado: EXTRACTO 01-02 AL 28-02.xls
--   Hoja: primera hoja (actualmente HOJA1)
--   Encabezado: fila 8
--   Datos: fila 9 en adelante
--
--   A Fecha Operacion  -> fecha del movimiento / DueDate SAP
--   B Fecha Proceso    -> no es necesaria para el envio
--   C Descripcion      -> Memo SAP
--   D Referencia       -> Reference SAP
--   E Importe          -> importe unico con signo
--   F Saldo            -> solo visual, no se envia ni compara
--
-- Convencion Sudameris: Importe negativo = debito; Importe positivo = credito.
-- El modo signed del backend convierte esos valores respectivamente en
-- DebitAmount (absoluto) y CreditAmount para BankPages de SAP B1.
--
-- Alcance: solo el banco Sudameris de OCHO_A identificado por banco_id=14,
-- empresa_id=6, usuario_id=21 y su cuenta bancaria 24. Si el banco no posee
-- un layout local Sudameris, crea su copia desde la plantilla base global.
-- No toca Continental, otros bancos, cuentas ni otras empresas.
--
-- EJECUCION MANUAL: revisar y ejecutar en la base correspondiente despues de
-- desplegar el backend actual. Es idempotente y atomico.
-- =============================================================================

BEGIN;

-- Verifica exactamente el banco, la cuenta y la plantilla base que se va a
-- copiar. Tambien evita desactivar por error una plantilla activa distinta.
DO $$
DECLARE
  target_bank_count INTEGER;
  target_account_count INTEGER;
  sudameris_base_count INTEGER;
  total_active_layouts INTEGER;
  sudameris_active_layouts INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO target_bank_count
  FROM public.bancos bank
  WHERE bank.banco_id = 14
    AND bank.empresa_id = 6
    AND bank.usuario_id = 21;

  IF target_bank_count <> 1 THEN
    RAISE EXCEPTION
      'No coincide el banco Sudameris objetivo de OCHO_A (banco 14, empresa 6, usuario 21). Encontrados: %.',
      target_bank_count;
  END IF;

  SELECT COUNT(*)
  INTO target_account_count
  FROM public.cuentas_bancarias account
  JOIN public.bancos bank ON bank.banco_id = account.banco_id
  WHERE account.cuenta_bancaria_id = 24
    AND account.empresa_id = 6
    AND account.banco_id = 14
    AND bank.empresa_id = 6
    AND bank.usuario_id = 21;

  IF target_account_count <> 1 THEN
    RAISE EXCEPTION
      'No coincide la cuenta Sudameris objetivo de OCHO_A (cuenta 24, banco 14, empresa 6). Encontradas: %.',
      target_account_count;
  END IF;

  SELECT COUNT(*)
  INTO sudameris_base_count
  FROM public.plantillas_base base
  WHERE LOWER(TRIM(base.plantilla_base_nombre)) = LOWER('Base Sudameris vs SAP B1')
    AND base.plantilla_base_activa = TRUE;

  IF sudameris_base_count <> 1 THEN
    RAISE EXCEPTION
      'Debe existir exactamente una plantilla base activa "Base Sudameris vs SAP B1". Encontradas: %.',
      sudameris_base_count;
  END IF;

  SELECT COUNT(*)
  INTO total_active_layouts
  FROM public.plantillas_conciliacion layout
  WHERE layout.banco_id = 14
    AND layout.plantilla_activa = TRUE;

  SELECT COUNT(*)
  INTO sudameris_active_layouts
  FROM public.plantillas_conciliacion layout
  JOIN public.plantillas_base base
    ON base.plantilla_base_id = layout.plantilla_base_id
  WHERE layout.banco_id = 14
    AND layout.plantilla_activa = TRUE
    AND LOWER(TRIM(base.plantilla_base_nombre)) = LOWER('Base Sudameris vs SAP B1');

  IF total_active_layouts <> sudameris_active_layouts THEN
    RAISE EXCEPTION
      'El banco Sudameris 14 tiene una plantilla activa distinta de la plantilla base Sudameris. No se modifica automaticamente.';
  END IF;
END;
$$;

-- Reactiva la copia Sudameris local si existe. Si no existe, se crea en el
-- siguiente bloque. El chequeo previo garantiza que no haya conflicto con otro
-- layout activo en el banco 14.
WITH target_bank AS (
  SELECT bank.banco_id, bank.banco_nombre
  FROM public.bancos bank
  WHERE bank.banco_id = 14
    AND bank.empresa_id = 6
    AND bank.usuario_id = 21
), sudameris_base AS (
  SELECT *
  FROM public.plantillas_base base
  WHERE LOWER(TRIM(base.plantilla_base_nombre)) = LOWER('Base Sudameris vs SAP B1')
    AND base.plantilla_base_activa = TRUE
)
UPDATE public.plantillas_conciliacion layout
SET
  plantilla_nombre = 'Sudameris USD vs SAP B1',
  plantilla_descripcion = COALESCE(
    base.plantilla_base_descripcion,
    'Plantilla Sudameris USD para conciliacion bancaria de OCHO_A.'
  ),
  plantilla_etiqueta_sistema = base.plantilla_base_etiqueta_sistema,
  plantilla_etiqueta_banco = bank.banco_nombre,
  plantilla_umbral_auto_match = base.plantilla_base_umbral_auto_match,
  plantilla_monto_modo = 'signed',
  plantilla_activa = TRUE,
  plantilla_actualizada_en = NOW()
FROM target_bank bank
CROSS JOIN sudameris_base base
WHERE layout.banco_id = bank.banco_id
  AND layout.plantilla_base_id = base.plantilla_base_id;

-- Crea la copia local solo cuando el banco 14 no tenia una plantilla vinculada
-- a la base Sudameris. El indice unico por banco/base evita duplicados.
WITH target_bank AS (
  SELECT bank.banco_id, bank.banco_nombre
  FROM public.bancos bank
  WHERE bank.banco_id = 14
    AND bank.empresa_id = 6
    AND bank.usuario_id = 21
), sudameris_base AS (
  SELECT *
  FROM public.plantillas_base base
  WHERE LOWER(TRIM(base.plantilla_base_nombre)) = LOWER('Base Sudameris vs SAP B1')
    AND base.plantilla_base_activa = TRUE
)
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
  bank.banco_id,
  base.plantilla_base_id,
  'Sudameris USD vs SAP B1',
  COALESCE(
    base.plantilla_base_descripcion,
    'Plantilla Sudameris USD para conciliacion bancaria de OCHO_A.'
  ),
  base.plantilla_base_etiqueta_sistema,
  bank.banco_nombre,
  base.plantilla_base_umbral_auto_match,
  'signed',
  TRUE
FROM target_bank bank
CROSS JOIN sudameris_base base
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plantillas_conciliacion layout
  WHERE layout.banco_id = bank.banco_id
    AND layout.plantilla_base_id = base.plantilla_base_id
);

-- Copia los mapeos faltantes desde la base. Esto cubre tanto un layout nuevo
-- como una copia local inactiva que se hubiera creado sin todos sus campos.
WITH target_bank AS (
  SELECT bank.banco_id
  FROM public.bancos bank
  WHERE bank.banco_id = 14
    AND bank.empresa_id = 6
    AND bank.usuario_id = 21
), sudameris_base AS (
  SELECT base.plantilla_base_id
  FROM public.plantillas_base base
  WHERE LOWER(TRIM(base.plantilla_base_nombre)) = LOWER('Base Sudameris vs SAP B1')
    AND base.plantilla_base_activa = TRUE
), target_layout AS (
  SELECT layout.plantilla_id, layout.plantilla_base_id
  FROM public.plantillas_conciliacion layout
  JOIN target_bank bank ON bank.banco_id = layout.banco_id
  JOIN sudameris_base base ON base.plantilla_base_id = layout.plantilla_base_id
  WHERE layout.plantilla_activa = TRUE
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
  layout.plantilla_id,
  mapping.mapeo_base_clave_campo,
  mapping.mapeo_base_etiqueta,
  mapping.mapeo_base_orden,
  mapping.mapeo_base_activo,
  mapping.mapeo_base_requerido,
  mapping.mapeo_base_operador_comparacion,
  mapping.mapeo_base_peso,
  mapping.mapeo_base_tolerancia,
  mapping.sistema_hoja,
  mapping.sistema_columna,
  mapping.sistema_fila_inicio,
  mapping.sistema_fila_fin,
  mapping.sistema_tipo_dato,
  mapping.banco_hoja,
  mapping.banco_columna,
  mapping.banco_fila_inicio,
  mapping.banco_fila_fin,
  mapping.banco_tipo_dato
FROM target_layout layout
JOIN public.plantillas_base_mapeos mapping
  ON mapping.plantilla_base_id = layout.plantilla_base_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plantillas_conciliacion_mapeos existing
  WHERE existing.plantilla_id = layout.plantilla_id
    AND LOWER(TRIM(existing.mapeo_clave_campo))
      = LOWER(TRIM(mapping.mapeo_base_clave_campo))
);

-- Despues de crear o reactivar la copia, valida que los cuatro campos
-- operativos necesarios existan una sola vez.
DO $$
DECLARE
  active_layout_count INTEGER;
  date_mapping_count INTEGER;
  description_mapping_count INTEGER;
  reference_mapping_count INTEGER;
  amount_mapping_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO active_layout_count
  FROM public.plantillas_conciliacion layout
  JOIN public.plantillas_base base
    ON base.plantilla_base_id = layout.plantilla_base_id
  WHERE layout.banco_id = 14
    AND layout.plantilla_activa = TRUE
    AND LOWER(TRIM(base.plantilla_base_nombre)) = LOWER('Base Sudameris vs SAP B1');

  IF active_layout_count <> 1 THEN
    RAISE EXCEPTION
      'No se pudo obtener una unica plantilla Sudameris activa para el banco 14. Encontradas: %.',
      active_layout_count;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE LOWER(TRIM(mapping.mapeo_clave_campo)) = 'fecha'),
    COUNT(*) FILTER (WHERE LOWER(TRIM(mapping.mapeo_clave_campo)) = 'descripcion'),
    COUNT(*) FILTER (WHERE LOWER(TRIM(mapping.mapeo_clave_campo)) = 'referencia'),
    COUNT(*) FILTER (
      WHERE LOWER(TRIM(mapping.mapeo_clave_campo)) IN ('monto', 'importe', 'amount')
    )
  INTO
    date_mapping_count,
    description_mapping_count,
    reference_mapping_count,
    amount_mapping_count
  FROM public.plantillas_conciliacion_mapeos mapping
  JOIN public.plantillas_conciliacion layout
    ON layout.plantilla_id = mapping.plantilla_id
  JOIN public.plantillas_base base
    ON base.plantilla_base_id = layout.plantilla_base_id
  WHERE layout.banco_id = 14
    AND layout.plantilla_activa = TRUE
    AND LOWER(TRIM(base.plantilla_base_nombre)) = LOWER('Base Sudameris vs SAP B1');

  IF date_mapping_count <> 1
    OR description_mapping_count <> 1
    OR reference_mapping_count <> 1
    OR amount_mapping_count <> 1 THEN
    RAISE EXCEPTION
      'La plantilla Sudameris activa debe tener un unico mapeo fecha/descripcion/referencia/importe. Encontrados: fecha=%, descripcion=%, referencia=%, importe=% .',
      date_mapping_count,
      description_mapping_count,
      reference_mapping_count,
      amount_mapping_count;
  END IF;
END;
$$;

-- Usa la primera hoja del archivo, para no depender del nombre de la pestana.
-- En el extracto revisado es HOJA1. Las filas empiezan en 9, luego del
-- encabezado ubicado en la fila 8.
WITH target_layout AS (
  SELECT layout.plantilla_id
  FROM public.plantillas_conciliacion layout
  JOIN public.plantillas_base base
    ON base.plantilla_base_id = layout.plantilla_base_id
  WHERE layout.banco_id = 14
    AND layout.plantilla_activa = TRUE
    AND LOWER(TRIM(base.plantilla_base_nombre)) = LOWER('Base Sudameris vs SAP B1')
)
UPDATE public.plantillas_conciliacion_mapeos mapping
SET
  mapeo_etiqueta = CASE LOWER(TRIM(mapping.mapeo_clave_campo))
    WHEN 'fecha' THEN 'Fecha Operacion'
    WHEN 'descripcion' THEN 'Descripcion'
    WHEN 'referencia' THEN 'Referencia'
    ELSE 'Importe'
  END,
  banco_hoja = NULL,
  banco_columna = CASE LOWER(TRIM(mapping.mapeo_clave_campo))
    WHEN 'fecha' THEN 'A'
    WHEN 'descripcion' THEN 'C'
    WHEN 'referencia' THEN 'D'
    ELSE 'E'
  END,
  banco_fila_inicio = 9,
  banco_fila_fin = 5000,
  banco_tipo_dato = CASE
    WHEN LOWER(TRIM(mapping.mapeo_clave_campo)) = 'fecha' THEN 'date'
    WHEN LOWER(TRIM(mapping.mapeo_clave_campo)) IN ('monto', 'importe', 'amount') THEN 'amount'
    ELSE 'text'
  END,
  mapeo_activo = TRUE,
  mapeo_actualizado_en = NOW()
FROM target_layout target
WHERE mapping.plantilla_id = target.plantilla_id
  AND LOWER(TRIM(mapping.mapeo_clave_campo)) IN (
    'fecha',
    'descripcion',
    'referencia',
    'monto',
    'importe',
    'amount'
  );

-- Saldo es solo visual: no interviene en el matching ni en el payload SAP.
WITH target_layout AS (
  SELECT layout.plantilla_id
  FROM public.plantillas_conciliacion layout
  JOIN public.plantillas_base base
    ON base.plantilla_base_id = layout.plantilla_base_id
  WHERE layout.banco_id = 14
    AND layout.plantilla_activa = TRUE
    AND LOWER(TRIM(base.plantilla_base_nombre)) = LOWER('Base Sudameris vs SAP B1')
)
UPDATE public.plantillas_conciliacion_mapeos mapping
SET
  mapeo_etiqueta = 'Saldo',
  mapeo_orden = 95,
  mapeo_activo = TRUE,
  mapeo_requerido = FALSE,
  mapeo_operador_comparacion = 'numeric_equals',
  mapeo_peso = 0,
  mapeo_tolerancia = 0,
  sistema_hoja = NULL,
  sistema_columna = NULL,
  sistema_fila_inicio = NULL,
  sistema_fila_fin = NULL,
  sistema_tipo_dato = 'amount',
  banco_hoja = NULL,
  banco_columna = 'F',
  banco_fila_inicio = 9,
  banco_fila_fin = 5000,
  banco_tipo_dato = 'amount',
  mapeo_actualizado_en = NOW()
FROM target_layout target
WHERE mapping.plantilla_id = target.plantilla_id
  AND LOWER(TRIM(mapping.mapeo_clave_campo)) = 'saldo';

WITH target_layout AS (
  SELECT layout.plantilla_id
  FROM public.plantillas_conciliacion layout
  JOIN public.plantillas_base base
    ON base.plantilla_base_id = layout.plantilla_base_id
  WHERE layout.banco_id = 14
    AND layout.plantilla_activa = TRUE
    AND LOWER(TRIM(base.plantilla_base_nombre)) = LOWER('Base Sudameris vs SAP B1')
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
  target.plantilla_id,
  'saldo',
  'Saldo',
  95,
  TRUE,
  FALSE,
  'numeric_equals',
  0,
  0,
  NULL,
  NULL,
  NULL,
  NULL,
  'amount',
  NULL,
  'F',
  9,
  5000,
  'amount'
FROM target_layout target
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plantillas_conciliacion_mapeos existing
  WHERE existing.plantilla_id = target.plantilla_id
    AND LOWER(TRIM(existing.mapeo_clave_campo)) = 'saldo'
);

-- Un layout signed usa solo Importe (E); Debito/Credito separados, si hubieran
-- quedado de una configuracion anterior, se desactivan para no interferir.
WITH target_layout AS (
  SELECT layout.plantilla_id
  FROM public.plantillas_conciliacion layout
  JOIN public.plantillas_base base
    ON base.plantilla_base_id = layout.plantilla_base_id
  WHERE layout.banco_id = 14
    AND layout.plantilla_activa = TRUE
    AND LOWER(TRIM(base.plantilla_base_nombre)) = LOWER('Base Sudameris vs SAP B1')
)
UPDATE public.plantillas_conciliacion_mapeos mapping
SET
  mapeo_activo = FALSE,
  mapeo_actualizado_en = NOW()
FROM target_layout target
WHERE mapping.plantilla_id = target.plantilla_id
  AND LOWER(TRIM(mapping.mapeo_clave_campo)) IN ('debito', 'credito');

WITH target_layout AS (
  SELECT layout.plantilla_id
  FROM public.plantillas_conciliacion layout
  JOIN public.plantillas_base base
    ON base.plantilla_base_id = layout.plantilla_base_id
  WHERE layout.banco_id = 14
    AND layout.plantilla_activa = TRUE
    AND LOWER(TRIM(base.plantilla_base_nombre)) = LOWER('Base Sudameris vs SAP B1')
)
UPDATE public.plantillas_conciliacion layout
SET
  plantilla_monto_modo = 'signed',
  plantilla_actualizada_en = NOW()
FROM target_layout target
WHERE layout.plantilla_id = target.plantilla_id;

-- Verificacion posterior (solo lectura). Debe devolver el layout activo del
-- banco 14, cuenta 24, con Fecha Operacion=A, Descripcion=C, Referencia=D,
-- Importe=E, Saldo=F, inicio=9 y modo signed.
SELECT
  company.emp_id_fiscal AS empresa_codigo,
  bank.banco_id AS banco_id,
  bank.empresa_id AS empresa_id,
  bank.usuario_id AS usuario_id,
  bank.banco_nombre AS banco,
  account.cuenta_bancaria_id AS cuenta_id,
  account.cuenta_bancaria_nombre AS cuenta_nombre,
  account.cuenta_bancaria_numero AS cuenta_numero,
  layout.plantilla_nombre AS plantilla,
  layout.plantilla_monto_modo AS modo_importe,
  mapping.mapeo_clave_campo AS campo,
  mapping.mapeo_etiqueta AS etiqueta,
  mapping.banco_columna AS columna_banco,
  mapping.banco_fila_inicio AS fila_inicio,
  mapping.banco_fila_fin AS fila_fin,
  mapping.mapeo_activo AS activo
FROM public.plantillas_conciliacion layout
JOIN public.bancos bank ON bank.banco_id = layout.banco_id
JOIN public.empresas company ON company.emp_id = bank.empresa_id
JOIN public.cuentas_bancarias account
  ON account.banco_id = bank.banco_id
JOIN public.plantillas_base base
  ON base.plantilla_base_id = layout.plantilla_base_id
JOIN public.plantillas_conciliacion_mapeos mapping
  ON mapping.plantilla_id = layout.plantilla_id
WHERE bank.banco_id = 14
  AND bank.empresa_id = 6
  AND bank.usuario_id = 21
  AND account.cuenta_bancaria_id = 24
  AND account.empresa_id = 6
  AND layout.plantilla_activa = TRUE
  AND LOWER(TRIM(base.plantilla_base_nombre)) = LOWER('Base Sudameris vs SAP B1')
  AND LOWER(TRIM(mapping.mapeo_clave_campo)) IN (
    'fecha',
    'descripcion',
    'referencia',
    'monto',
    'importe',
    'amount',
    'saldo',
    'debito',
    'credito'
  )
ORDER BY mapping.mapeo_orden, mapping.mapeo_id;

COMMIT;
