-- Script opcional.
-- Reemplazar <<USER_LOGIN>> por el login del usuario admin al que queres asignar bancos/layouts.
-- Este seed usa como referencia:
--   - Extracto de cuenta Conti Gs.xlsx
--   - Extracto de cuenta Familiar Gs.xlsx
--   - Extracto de cuenta Sudameris Gs.xlsx
--   - Extracto SAP B1.xlsx
--
-- Convencion importante:
--   - En columnas podes usar alternativas con '|', por ejemplo E|F.
--     El sistema toma la primera columna con dato en esa fila.

DO $$
DECLARE
  target_user_id INTEGER;
  familiar_bank_id INTEGER;
  sudameris_bank_id INTEGER;
  conti_bank_id INTEGER;
  familiar_layout_id INTEGER;
  sudameris_layout_id INTEGER;
  conti_layout_id INTEGER;
BEGIN
  SELECT usr_id
  INTO target_user_id
  FROM public.usuarios
  WHERE LOWER(usr_login) = LOWER('<<USER_LOGIN>>')
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No existe el usuario <<USER_LOGIN>>.';
  END IF;

  INSERT INTO public.usuarios_bancos (
    usr_id,
    ubk_banco_nombre,
    ubk_alias,
    ubk_moneda,
    ubk_numero_cuenta,
    ubk_descripcion,
    ubk_activo
  )
  VALUES
    (target_user_id, 'Banco Familiar', 'Familiar GS', 'GS', '3-5962045', 'Template de extracto Banco Familiar', TRUE),
    (target_user_id, 'Sudameris', 'Sudameris GS', 'GS', '1581941', 'Template de extracto Sudameris', TRUE),
    (target_user_id, 'Continental', 'Conti GS', 'GS', NULL, 'Template de extracto Continental', TRUE)
  ON CONFLICT DO NOTHING;

  SELECT ubk_id INTO familiar_bank_id
  FROM public.usuarios_bancos
  WHERE usr_id = target_user_id
    AND LOWER(ubk_banco_nombre) = LOWER('Banco Familiar')
  ORDER BY ubk_id ASC
  LIMIT 1;

  SELECT ubk_id INTO sudameris_bank_id
  FROM public.usuarios_bancos
  WHERE usr_id = target_user_id
    AND LOWER(ubk_banco_nombre) = LOWER('Sudameris')
  ORDER BY ubk_id ASC
  LIMIT 1;

  SELECT ubk_id INTO conti_bank_id
  FROM public.usuarios_bancos
  WHERE usr_id = target_user_id
    AND LOWER(ubk_banco_nombre) = LOWER('Continental')
  ORDER BY ubk_id ASC
  LIMIT 1;

  INSERT INTO public.conciliacion_layouts (
    ubk_id,
    lyt_nombre,
    lyt_descripcion,
    lyt_system_label,
    lyt_bank_label,
    lyt_auto_match_threshold,
    lyt_activo
  )
  SELECT
    familiar_bank_id,
    'Familiar vs SAP B1',
    'Template basado en extracto Familiar y SAP B1',
    'SAP B1',
    'Banco Familiar',
    0.60,
    NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ubk_id = familiar_bank_id
        AND lyt_activo = TRUE
    )
  WHERE familiar_bank_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ubk_id = familiar_bank_id
        AND LOWER(lyt_nombre) = LOWER('Familiar vs SAP B1')
    );

  INSERT INTO public.conciliacion_layouts (
    ubk_id,
    lyt_nombre,
    lyt_descripcion,
    lyt_system_label,
    lyt_bank_label,
    lyt_auto_match_threshold,
    lyt_activo
  )
  SELECT
    sudameris_bank_id,
    'Sudameris vs SAP B1',
    'Template basado en extracto Sudameris y SAP B1',
    'SAP B1',
    'Sudameris',
    0.60,
    NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ubk_id = sudameris_bank_id
        AND lyt_activo = TRUE
    )
  WHERE sudameris_bank_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ubk_id = sudameris_bank_id
        AND LOWER(lyt_nombre) = LOWER('Sudameris vs SAP B1')
    );

  INSERT INTO public.conciliacion_layouts (
    ubk_id,
    lyt_nombre,
    lyt_descripcion,
    lyt_system_label,
    lyt_bank_label,
    lyt_auto_match_threshold,
    lyt_activo
  )
  SELECT
    conti_bank_id,
    'Conti vs SAP B1',
    'Template basado en extracto Continental y SAP B1',
    'SAP B1',
    'Continental',
    0.60,
    NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ubk_id = conti_bank_id
        AND lyt_activo = TRUE
    )
  WHERE conti_bank_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ubk_id = conti_bank_id
        AND LOWER(lyt_nombre) = LOWER('Conti vs SAP B1')
    );

  SELECT lyt_id INTO familiar_layout_id
  FROM public.conciliacion_layouts
  WHERE ubk_id = familiar_bank_id
    AND LOWER(lyt_nombre) = LOWER('Familiar vs SAP B1')
  LIMIT 1;

  SELECT lyt_id INTO sudameris_layout_id
  FROM public.conciliacion_layouts
  WHERE ubk_id = sudameris_bank_id
    AND LOWER(lyt_nombre) = LOWER('Sudameris vs SAP B1')
  LIMIT 1;

  SELECT lyt_id INTO conti_layout_id
  FROM public.conciliacion_layouts
  WHERE ubk_id = conti_bank_id
    AND LOWER(lyt_nombre) = LOWER('Conti vs SAP B1')
  LIMIT 1;

  IF familiar_layout_id IS NOT NULL THEN
    DELETE FROM public.conciliacion_layout_mappings WHERE lyt_id = familiar_layout_id;

    INSERT INTO public.conciliacion_layout_mappings (
      lyt_id, lmp_field_key, lmp_label, lmp_sort_order, lmp_active, lmp_required,
      lmp_compare_operator, lmp_weight, lmp_tolerance,
      lmp_system_sheet, lmp_system_column, lmp_system_start_row, lmp_system_end_row, lmp_system_data_type,
      lmp_bank_sheet, lmp_bank_column, lmp_bank_start_row, lmp_bank_end_row, lmp_bank_data_type
    )
    VALUES
      (familiar_layout_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'Familiar', 'B', 13, 5000, 'date'),
      (familiar_layout_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'H', 2, 5000, 'text', 'Familiar', 'D', 13, 5000, 'text'),
      (familiar_layout_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'Familiar', 'E|F', 13, 5000, 'amount'),
      (familiar_layout_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'Familiar', 'C', 13, 5000, 'text');
  END IF;

  IF sudameris_layout_id IS NOT NULL THEN
    DELETE FROM public.conciliacion_layout_mappings WHERE lyt_id = sudameris_layout_id;

    INSERT INTO public.conciliacion_layout_mappings (
      lyt_id, lmp_field_key, lmp_label, lmp_sort_order, lmp_active, lmp_required,
      lmp_compare_operator, lmp_weight, lmp_tolerance,
      lmp_system_sheet, lmp_system_column, lmp_system_start_row, lmp_system_end_row, lmp_system_data_type,
      lmp_bank_sheet, lmp_bank_column, lmp_bank_start_row, lmp_bank_end_row, lmp_bank_data_type
    )
    VALUES
      (sudameris_layout_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'HOJA1', 'A', 14, 5000, 'date'),
      (sudameris_layout_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'H', 2, 5000, 'text', 'HOJA1', 'C', 14, 5000, 'text'),
      (sudameris_layout_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'HOJA1', 'E', 14, 5000, 'amount'),
      (sudameris_layout_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'HOJA1', 'D', 14, 5000, 'text');
  END IF;

  IF conti_layout_id IS NOT NULL THEN
    DELETE FROM public.conciliacion_layout_mappings WHERE lyt_id = conti_layout_id;

    INSERT INTO public.conciliacion_layout_mappings (
      lyt_id, lmp_field_key, lmp_label, lmp_sort_order, lmp_active, lmp_required,
      lmp_compare_operator, lmp_weight, lmp_tolerance,
      lmp_system_sheet, lmp_system_column, lmp_system_start_row, lmp_system_end_row, lmp_system_data_type,
      lmp_bank_sheet, lmp_bank_column, lmp_bank_start_row, lmp_bank_end_row, lmp_bank_data_type
    )
    VALUES
      (conti_layout_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'Hoja1', 'O', 2, 5000, 'date'),
      (conti_layout_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'H', 2, 5000, 'text', 'Hoja1', 'D', 2, 5000, 'text'),
      (conti_layout_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'Hoja1', 'E|F', 2, 5000, 'amount'),
      (conti_layout_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'Hoja1', 'J', 2, 5000, 'text');
  END IF;
END;
$$;
