BEGIN;

-- Completa mappings en plantillas base existentes y en plantillas de usuario ya copiadas.
-- Basado en los XLSX reales de la raiz del proyecto:
--   Extracto SAP B1.xlsx
--   Extracto de cuenta Conti Gs.xlsx
--   Extracto de cuenta Familiar Gs.xlsx
--   Extracto de cuenta Sudameris Gs.xlsx
--   Extractos GNB.xlsx
--   Extractos ITAU.xlsx
--
-- Es idempotente: actualiza campos existentes e inserta los faltantes.
CREATE TEMP TABLE tmp_qoncilia_template_mappings (
  template_name TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  active BOOLEAN NOT NULL,
  required BOOLEAN NOT NULL,
  compare_operator TEXT NOT NULL,
  weight DOUBLE PRECISION NOT NULL,
  tolerance DOUBLE PRECISION NULL,
  system_sheet TEXT NULL,
  system_column TEXT NULL,
  system_start_row INTEGER NULL,
  system_end_row INTEGER NULL,
  system_data_type TEXT NOT NULL,
  bank_sheet TEXT NULL,
  bank_column TEXT NULL,
  bank_start_row INTEGER NULL,
  bank_end_row INTEGER NULL,
  bank_data_type TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO tmp_qoncilia_template_mappings (
  template_name,
  field_key,
  label,
  sort_order,
  active,
  required,
  compare_operator,
  weight,
  tolerance,
  system_sheet,
  system_column,
  system_start_row,
  system_end_row,
  system_data_type,
  bank_sheet,
  bank_column,
  bank_start_row,
  bank_end_row,
  bank_data_type
)
VALUES
  -- SAP B1: hoja SAP. Campos marcados en el Excel: Fecha de contabilizacion, Ref.1 (fila), Importe.
  -- Continental: el archivo real trae Hoja1; dejamos banco_hoja NULL para usar la primera hoja.
  ('Base Continental vs SAP B1', 'fecha', 'Fecha de contabilizacion / FECHAMOVI', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', NULL, 'N', 2, 5000, 'date'),
  ('Base Continental vs SAP B1', 'referencia', 'Ref.1 (fila) / COMPROBANTE', 2, TRUE, TRUE, 'contains', 2, NULL, 'SAP', 'D', 2, 5000, 'text', NULL, 'J|C', 2, 5000, 'text'),
  ('Base Continental vs SAP B1', 'monto', 'Importe / DEBE-HABER', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', NULL, 'E|F', 2, 5000, 'amount'),
  ('Base Continental vs SAP B1', 'descripcion', 'Info.detallada / DESCRIP', 4, TRUE, FALSE, 'contains', 1, NULL, 'SAP', 'H', 2, 5000, 'text', NULL, 'D', 2, 5000, 'text'),
  ('Base Continental vs SAP B1', 'transactionNumber', 'Numero de operacion', 90, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'A', 2, 5000, 'number', NULL, NULL, 2, 5000, 'number'),
  ('Base Continental vs SAP B1', 'lineNumber', 'Ref.2 (fila)', 91, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'E', 2, 5000, 'number', NULL, NULL, 2, 5000, 'number'),
  ('Base Continental vs SAP B1', 'sequence', 'ORDEN', 92, TRUE, FALSE, 'equals', 0, NULL, NULL, NULL, 2, 5000, 'number', NULL, 'H', 2, 5000, 'number'),

  -- Familiar: hoja Familiar, encabezado fila 12, datos desde fila 13.
  ('Base Familiar vs SAP B1', 'fecha', 'Fecha de contabilizacion / Fecha Movimiento', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'Familiar', 'B', 13, 5000, 'date'),
  ('Base Familiar vs SAP B1', 'referencia', 'Ref.1 (fila) / Comprobante', 2, TRUE, TRUE, 'contains', 2, NULL, 'SAP', 'D', 2, 5000, 'text', 'Familiar', 'C', 13, 5000, 'text'),
  ('Base Familiar vs SAP B1', 'monto', 'Importe / Debito-Credito', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'Familiar', 'E|F', 13, 5000, 'amount'),
  ('Base Familiar vs SAP B1', 'descripcion', 'Info.detallada / Transaccion', 4, TRUE, FALSE, 'contains', 1, NULL, 'SAP', 'H', 2, 5000, 'text', 'Familiar', 'D', 13, 5000, 'text'),
  ('Base Familiar vs SAP B1', 'transactionNumber', 'Numero de operacion', 90, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'A', 2, 5000, 'number', 'Familiar', NULL, 13, 5000, 'number'),
  ('Base Familiar vs SAP B1', 'lineNumber', 'Ref.2 (fila)', 91, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'E', 2, 5000, 'number', 'Familiar', NULL, 13, 5000, 'number'),
  ('Base Familiar vs SAP B1', 'sequence', 'Comprobante', 92, TRUE, FALSE, 'equals', 0, NULL, NULL, NULL, 2, 5000, 'number', 'Familiar', 'C', 13, 5000, 'number'),

  -- Sudameris: el archivo real trae HOJA1; dejamos banco_hoja NULL para usar la primera hoja.
  ('Base Sudameris vs SAP B1', 'fecha', 'Fecha de contabilizacion / Fecha Proceso', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', NULL, 'B', 14, 5000, 'date'),
  ('Base Sudameris vs SAP B1', 'referencia', 'Ref.1 (fila) / Referencia', 2, TRUE, TRUE, 'contains', 2, NULL, 'SAP', 'D', 2, 5000, 'text', NULL, 'D', 14, 5000, 'text'),
  ('Base Sudameris vs SAP B1', 'monto', 'Importe / Importe', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', NULL, 'E', 14, 5000, 'amount'),
  ('Base Sudameris vs SAP B1', 'descripcion', 'Info.detallada / Descripcion', 4, TRUE, FALSE, 'contains', 1, NULL, 'SAP', 'H', 2, 5000, 'text', NULL, 'C', 14, 5000, 'text'),
  ('Base Sudameris vs SAP B1', 'transactionNumber', 'Numero de operacion', 90, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'A', 2, 5000, 'number', NULL, NULL, 14, 5000, 'number'),
  ('Base Sudameris vs SAP B1', 'lineNumber', 'Ref.2 (fila)', 91, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'E', 2, 5000, 'number', NULL, NULL, 14, 5000, 'number'),
  ('Base Sudameris vs SAP B1', 'sequence', 'Referencia', 92, TRUE, FALSE, 'equals', 0, NULL, NULL, NULL, 2, 5000, 'number', NULL, 'D', 14, 5000, 'number'),

  -- GNB: workbook con hojas GNB, GNB-443 y GNB3; aca si se fija hoja.
  ('Base GNB vs SAP B1', 'fecha', 'Fecha de contabilizacion / Fecha Contable', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'GNB', 'C', 15, 5000, 'date'),
  ('Base GNB vs SAP B1', 'referencia', 'Ref.1 (fila) / Referencia', 2, TRUE, TRUE, 'contains', 2, NULL, 'SAP', 'D', 2, 5000, 'text', 'GNB', 'E', 15, 5000, 'text'),
  ('Base GNB vs SAP B1', 'monto', 'Importe / Importe Debito-Credito', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'GNB', 'H|I', 15, 5000, 'amount'),
  ('Base GNB vs SAP B1', 'descripcion', 'Info.detallada / Descripcion', 4, TRUE, FALSE, 'contains', 1, NULL, 'SAP', 'H', 2, 5000, 'text', 'GNB', 'G', 15, 5000, 'text'),
  ('Base GNB vs SAP B1', 'transactionNumber', 'Numero de operacion', 90, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'A', 2, 5000, 'number', 'GNB', NULL, 15, 5000, 'number'),
  ('Base GNB vs SAP B1', 'lineNumber', 'Ref.2 (fila)', 91, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'E', 2, 5000, 'number', 'GNB', NULL, 15, 5000, 'number'),
  ('Base GNB vs SAP B1', 'sequence', 'Nro de Comprobante', 92, TRUE, FALSE, 'equals', 0, NULL, NULL, NULL, 2, 5000, 'number', 'GNB', 'D', 15, 5000, 'number'),

  ('Base GNB-443 vs SAP B1', 'fecha', 'Fecha de contabilizacion / Fecha Contable', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'GNB-443', 'C', 15, 5000, 'date'),
  ('Base GNB-443 vs SAP B1', 'referencia', 'Ref.1 (fila) / Referencia', 2, TRUE, TRUE, 'contains', 2, NULL, 'SAP', 'D', 2, 5000, 'text', 'GNB-443', 'E', 15, 5000, 'text'),
  ('Base GNB-443 vs SAP B1', 'monto', 'Importe / Importe Debito-Credito', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'GNB-443', 'H|I', 15, 5000, 'amount'),
  ('Base GNB-443 vs SAP B1', 'descripcion', 'Info.detallada / Descripcion', 4, TRUE, FALSE, 'contains', 1, NULL, 'SAP', 'H', 2, 5000, 'text', 'GNB-443', 'G', 15, 5000, 'text'),
  ('Base GNB-443 vs SAP B1', 'transactionNumber', 'Numero de operacion', 90, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'A', 2, 5000, 'number', 'GNB-443', NULL, 15, 5000, 'number'),
  ('Base GNB-443 vs SAP B1', 'lineNumber', 'Ref.2 (fila)', 91, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'E', 2, 5000, 'number', 'GNB-443', NULL, 15, 5000, 'number'),
  ('Base GNB-443 vs SAP B1', 'sequence', 'Nro de Comprobante', 92, TRUE, FALSE, 'equals', 0, NULL, NULL, NULL, 2, 5000, 'number', 'GNB-443', 'D', 15, 5000, 'number'),

  ('Base GNB3 vs SAP B1', 'fecha', 'Fecha de contabilizacion / Fecha Contable', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'GNB3', 'C', 15, 5000, 'date'),
  ('Base GNB3 vs SAP B1', 'referencia', 'Ref.1 (fila) / Referencia', 2, TRUE, TRUE, 'contains', 2, NULL, 'SAP', 'D', 2, 5000, 'text', 'GNB3', 'E', 15, 5000, 'text'),
  ('Base GNB3 vs SAP B1', 'monto', 'Importe / Importe Debito-Credito', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'GNB3', 'H|I', 15, 5000, 'amount'),
  ('Base GNB3 vs SAP B1', 'descripcion', 'Info.detallada / Descripcion', 4, TRUE, FALSE, 'contains', 1, NULL, 'SAP', 'H', 2, 5000, 'text', 'GNB3', 'G', 15, 5000, 'text'),
  ('Base GNB3 vs SAP B1', 'transactionNumber', 'Numero de operacion', 90, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'A', 2, 5000, 'number', 'GNB3', NULL, 15, 5000, 'number'),
  ('Base GNB3 vs SAP B1', 'lineNumber', 'Ref.2 (fila)', 91, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'E', 2, 5000, 'number', 'GNB3', NULL, 15, 5000, 'number'),
  ('Base GNB3 vs SAP B1', 'sequence', 'Nro de Comprobante', 92, TRUE, FALSE, 'equals', 0, NULL, NULL, NULL, 2, 5000, 'number', 'GNB3', 'D', 15, 5000, 'number'),

  -- Itau: hoja Itau CC, encabezado fila 9, datos desde fila 10.
  ('Base Itau vs SAP B1', 'fecha', 'Fecha de contabilizacion / Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'Itau CC', 'A', 10, 5000, 'date'),
  ('Base Itau vs SAP B1', 'referencia', 'Ref.1 (fila) / Movimiento', 2, TRUE, TRUE, 'contains', 2, NULL, 'SAP', 'D', 2, 5000, 'text', 'Itau CC', 'C', 10, 5000, 'text'),
  ('Base Itau vs SAP B1', 'monto', 'Importe / Debitos-Creditos', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'Itau CC', 'D|E', 10, 5000, 'amount'),
  ('Base Itau vs SAP B1', 'descripcion', 'Info.detallada / Descripcion', 4, TRUE, FALSE, 'contains', 1, NULL, 'SAP', 'H', 2, 5000, 'text', 'Itau CC', 'B', 10, 5000, 'text'),
  ('Base Itau vs SAP B1', 'transactionNumber', 'Numero de operacion', 90, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'A', 2, 5000, 'number', 'Itau CC', NULL, 10, 5000, 'number'),
  ('Base Itau vs SAP B1', 'lineNumber', 'Ref.2 (fila)', 91, TRUE, FALSE, 'equals', 0, NULL, 'SAP', 'E', 2, 5000, 'number', 'Itau CC', NULL, 10, 5000, 'number'),
  ('Base Itau vs SAP B1', 'sequence', 'Movimiento', 92, TRUE, FALSE, 'equals', 0, NULL, NULL, NULL, 2, 5000, 'number', 'Itau CC', 'C', 10, 5000, 'number');

UPDATE public.plantillas_base_mapeos target
SET
  mapeo_base_etiqueta = source.label,
  mapeo_base_orden = source.sort_order,
  mapeo_base_activo = source.active,
  mapeo_base_requerido = source.required,
  mapeo_base_operador_comparacion = source.compare_operator,
  mapeo_base_peso = source.weight,
  mapeo_base_tolerancia = source.tolerance,
  sistema_hoja = source.system_sheet,
  sistema_columna = source.system_column,
  sistema_fila_inicio = source.system_start_row,
  sistema_fila_fin = source.system_end_row,
  sistema_tipo_dato = source.system_data_type,
  banco_hoja = source.bank_sheet,
  banco_columna = source.bank_column,
  banco_fila_inicio = source.bank_start_row,
  banco_fila_fin = source.bank_end_row,
  banco_tipo_dato = source.bank_data_type,
  mapeo_base_actualizado_en = NOW()
FROM tmp_qoncilia_template_mappings source
JOIN public.plantillas_base base
  ON LOWER(base.plantilla_base_nombre) = LOWER(source.template_name)
WHERE target.plantilla_base_id = base.plantilla_base_id
  AND LOWER(target.mapeo_base_clave_campo) = LOWER(source.field_key);

INSERT INTO public.plantillas_base_mapeos (
  plantilla_base_id,
  mapeo_base_clave_campo,
  mapeo_base_etiqueta,
  mapeo_base_orden,
  mapeo_base_activo,
  mapeo_base_requerido,
  mapeo_base_operador_comparacion,
  mapeo_base_peso,
  mapeo_base_tolerancia,
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
  base.plantilla_base_id,
  source.field_key,
  source.label,
  source.sort_order,
  source.active,
  source.required,
  source.compare_operator,
  source.weight,
  source.tolerance,
  source.system_sheet,
  source.system_column,
  source.system_start_row,
  source.system_end_row,
  source.system_data_type,
  source.bank_sheet,
  source.bank_column,
  source.bank_start_row,
  source.bank_end_row,
  source.bank_data_type
FROM tmp_qoncilia_template_mappings source
JOIN public.plantillas_base base
  ON LOWER(base.plantilla_base_nombre) = LOWER(source.template_name)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plantillas_base_mapeos existing
  WHERE existing.plantilla_base_id = base.plantilla_base_id
    AND LOWER(existing.mapeo_base_clave_campo) = LOWER(source.field_key)
);

UPDATE public.plantillas_conciliacion_mapeos target
SET
  mapeo_etiqueta = source.label,
  mapeo_orden = source.sort_order,
  mapeo_activo = source.active,
  mapeo_requerido = source.required,
  mapeo_operador_comparacion = source.compare_operator,
  mapeo_peso = source.weight,
  mapeo_tolerancia = source.tolerance,
  sistema_hoja = source.system_sheet,
  sistema_columna = source.system_column,
  sistema_fila_inicio = source.system_start_row,
  sistema_fila_fin = source.system_end_row,
  sistema_tipo_dato = source.system_data_type,
  banco_hoja = source.bank_sheet,
  banco_columna = source.bank_column,
  banco_fila_inicio = source.bank_start_row,
  banco_fila_fin = source.bank_end_row,
  banco_tipo_dato = source.bank_data_type,
  mapeo_actualizado_en = NOW()
FROM tmp_qoncilia_template_mappings source
JOIN public.plantillas_base base
  ON LOWER(base.plantilla_base_nombre) = LOWER(source.template_name)
JOIN public.plantillas_conciliacion template
  ON template.plantilla_base_id = base.plantilla_base_id
WHERE target.plantilla_id = template.plantilla_id
  AND LOWER(target.mapeo_clave_campo) = LOWER(source.field_key);

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
  template.plantilla_id,
  source.field_key,
  source.label,
  source.sort_order,
  source.active,
  source.required,
  source.compare_operator,
  source.weight,
  source.tolerance,
  source.system_sheet,
  source.system_column,
  source.system_start_row,
  source.system_end_row,
  source.system_data_type,
  source.bank_sheet,
  source.bank_column,
  source.bank_start_row,
  source.bank_end_row,
  source.bank_data_type
FROM tmp_qoncilia_template_mappings source
JOIN public.plantillas_base base
  ON LOWER(base.plantilla_base_nombre) = LOWER(source.template_name)
JOIN public.plantillas_conciliacion template
  ON template.plantilla_base_id = base.plantilla_base_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plantillas_conciliacion_mapeos existing
  WHERE existing.plantilla_id = template.plantilla_id
    AND LOWER(existing.mapeo_clave_campo) = LOWER(source.field_key)
);

COMMIT;
