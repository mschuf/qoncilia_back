-- Script opcional.
-- Reemplazar <<USER_LOGIN>> por el login del usuario admin al que queres asignar bancos/layouts.
-- Si dejas <<USER_LOGIN>> sin reemplazar, el script intenta usar automaticamente:
--   1) un superadmin/admin activo
--   2) cualquier usuario activo
--   3) el primer usuario disponible
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
  requested_login TEXT := '<<USER_LOGIN>>';
  target_user_id INTEGER;
  target_user_login TEXT;
  target_company_id INTEGER;
  system_id INTEGER;
  familiar_bank_id INTEGER;
  sudameris_bank_id INTEGER;
  conti_bank_id INTEGER;
  familiar_layout_id INTEGER;
  sudameris_layout_id INTEGER;
  conti_layout_id INTEGER;
BEGIN
  IF requested_login IS NOT NULL
     AND btrim(requested_login) <> ''
     AND requested_login <> '<<USER_LOGIN>>' THEN
    SELECT usr_id, usr_login, emp_id
    INTO target_user_id, target_user_login, target_company_id
    FROM public.usuarios
    WHERE LOWER(usr_login) = LOWER(requested_login)
    ORDER BY usr_id ASC
    LIMIT 1;
  END IF;

  IF target_user_id IS NULL THEN
    SELECT usr_id, usr_login, emp_id
    INTO target_user_id, target_user_login, target_company_id
    FROM public.usuarios
    ORDER BY
      CASE WHEN usr_activo = TRUE THEN 1 ELSE 2 END,
      usr_id ASC
    LIMIT 1;
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No existe ningun usuario en public.usuarios para aplicar el seed.';
  END IF;

  SELECT sys_id
  INTO system_id
  FROM public.conciliation_systems
  WHERE LOWER(sys_nombre) = LOWER('SAP')
  ORDER BY sys_id ASC
  LIMIT 1;

  IF system_id IS NULL THEN
    INSERT INTO public.conciliation_systems (
      sys_nombre,
      sys_descripcion,
      sys_activo
    )
    VALUES (
      'SAP',
      'Sistema base creado automaticamente por el seed Paraguay.',
      TRUE
    )
    RETURNING sys_id INTO system_id;
  END IF;

  RAISE NOTICE 'Seed de layouts aplicado sobre usr_id=% usr_login=%', target_user_id, target_user_login;

  INSERT INTO public.bancos (
    emp_id,
    usr_id,
    ban_nombre,
    ban_alias,
    ban_descripcion,
    ban_activo
  )
  VALUES
    (target_company_id, target_user_id, 'Banco Familiar', 'Familiar GS', 'Template de extracto Banco Familiar', TRUE),
    (target_company_id, target_user_id, 'Sudameris', 'Sudameris GS', 'Template de extracto Sudameris', TRUE),
    (target_company_id, target_user_id, 'Continental', 'Conti GS', 'Template de extracto Continental', TRUE)
  ON CONFLICT DO NOTHING;

  SELECT ban_id INTO familiar_bank_id
  FROM public.bancos
  WHERE usr_id = target_user_id
    AND LOWER(ban_nombre) = LOWER('Banco Familiar')
  ORDER BY ban_id ASC
  LIMIT 1;

  SELECT ban_id INTO sudameris_bank_id
  FROM public.bancos
  WHERE usr_id = target_user_id
    AND LOWER(ban_nombre) = LOWER('Sudameris')
  ORDER BY ban_id ASC
  LIMIT 1;

  SELECT ban_id INTO conti_bank_id
  FROM public.bancos
  WHERE usr_id = target_user_id
    AND LOWER(ban_nombre) = LOWER('Continental')
  ORDER BY ban_id ASC
  LIMIT 1;

  INSERT INTO public.conciliacion_layouts (
    ban_id,
    sys_id,
    lyt_nombre,
    lyt_descripcion,
    lyt_system_label,
    lyt_bank_label,
    lyt_auto_match_threshold,
    lyt_activo
  )
  SELECT
    familiar_bank_id,
    system_id,
    'Familiar vs SAP B1',
    'Template basado en extracto Familiar y SAP B1',
    'SAP B1',
    'Banco Familiar',
    0.60,
    NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ban_id = familiar_bank_id
        AND lyt_activo = TRUE
    )
  WHERE familiar_bank_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ban_id = familiar_bank_id
        AND LOWER(lyt_nombre) = LOWER('Familiar vs SAP B1')
    );

  INSERT INTO public.conciliacion_layouts (
    ban_id,
    sys_id,
    lyt_nombre,
    lyt_descripcion,
    lyt_system_label,
    lyt_bank_label,
    lyt_auto_match_threshold,
    lyt_activo
  )
  SELECT
    sudameris_bank_id,
    system_id,
    'Sudameris vs SAP B1',
    'Template basado en extracto Sudameris y SAP B1',
    'SAP B1',
    'Sudameris',
    0.60,
    NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ban_id = sudameris_bank_id
        AND lyt_activo = TRUE
    )
  WHERE sudameris_bank_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ban_id = sudameris_bank_id
        AND LOWER(lyt_nombre) = LOWER('Sudameris vs SAP B1')
    );

  INSERT INTO public.conciliacion_layouts (
    ban_id,
    sys_id,
    lyt_nombre,
    lyt_descripcion,
    lyt_system_label,
    lyt_bank_label,
    lyt_auto_match_threshold,
    lyt_activo
  )
  SELECT
    conti_bank_id,
    system_id,
    'Conti vs SAP B1',
    'Template basado en extracto Continental y SAP B1',
    'SAP B1',
    'Continental',
    0.60,
    NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ban_id = conti_bank_id
        AND lyt_activo = TRUE
    )
  WHERE conti_bank_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ban_id = conti_bank_id
        AND LOWER(lyt_nombre) = LOWER('Conti vs SAP B1')
    );

  SELECT lyt_id INTO familiar_layout_id
  FROM public.conciliacion_layouts
  WHERE ban_id = familiar_bank_id
    AND LOWER(lyt_nombre) = LOWER('Familiar vs SAP B1')
  LIMIT 1;

  SELECT lyt_id INTO sudameris_layout_id
  FROM public.conciliacion_layouts
  WHERE ban_id = sudameris_bank_id
    AND LOWER(lyt_nombre) = LOWER('Sudameris vs SAP B1')
  LIMIT 1;

  SELECT lyt_id INTO conti_layout_id
  FROM public.conciliacion_layouts
  WHERE ban_id = conti_bank_id
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
