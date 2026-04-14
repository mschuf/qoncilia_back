-- Script opcional.
-- Reemplazar <<USER_LOGIN>> por el login del usuario admin al que queres asignar bancos/layouts.
-- Si dejas <<USER_LOGIN>> sin reemplazar, el script intenta usar automaticamente:
--   1) un superadmin/admin activo
--   2) cualquier usuario activo
--   3) el primer usuario disponible
--
-- Este seed usa como referencia:
--   - Extractos GNB.xlsx
--   - Extractos ITAU.xlsx
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

  gnb_bank_id INTEGER;
  itau_bank_id INTEGER;

  gnb_layout_id INTEGER;
  gnb_443_layout_id INTEGER;
  gnb3_layout_id INTEGER;
  itau_layout_id INTEGER;
BEGIN
  IF requested_login IS NOT NULL
     AND btrim(requested_login) <> ''
     AND requested_login <> '<<USER_LOGIN>>' THEN
    SELECT usr_id, usr_login
    INTO target_user_id, target_user_login
    FROM public.usuarios
    WHERE LOWER(usr_login) = LOWER(requested_login)
    ORDER BY usr_id ASC
    LIMIT 1;
  END IF;

  IF target_user_id IS NULL THEN
    SELECT usr_id, usr_login
    INTO target_user_id, target_user_login
    FROM public.usuarios
    ORDER BY
      CASE
        WHEN usr_activo = TRUE AND usr_is_super_admin = TRUE THEN 1
        WHEN usr_activo = TRUE AND usr_is_admin = TRUE THEN 2
        WHEN usr_activo = TRUE THEN 3
        ELSE 4
      END,
      usr_id ASC
    LIMIT 1;
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No existe ningun usuario en public.usuarios para aplicar el seed.';
  END IF;

  RAISE NOTICE 'Seed GNB/Itau aplicado sobre usr_id=% usr_login=%', target_user_id, target_user_login;

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
    (target_user_id, 'GNB', 'GNB GS', 'GS', '1074137', 'Template de extracto GNB', TRUE),
    (target_user_id, 'Itau', 'Itau GS', 'GS', '800005117', 'Template de extracto Itau', TRUE)
  ON CONFLICT DO NOTHING;

  SELECT ubk_id INTO gnb_bank_id
  FROM public.usuarios_bancos
  WHERE usr_id = target_user_id
    AND LOWER(ubk_banco_nombre) = LOWER('GNB')
  ORDER BY ubk_id ASC
  LIMIT 1;

  SELECT ubk_id INTO itau_bank_id
  FROM public.usuarios_bancos
  WHERE usr_id = target_user_id
    AND LOWER(ubk_banco_nombre) = LOWER('Itau')
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
    gnb_bank_id,
    'GNB vs SAP B1',
    'Template basado en hoja GNB de Extractos GNB vs SAP B1',
    'SAP B1',
    'GNB',
    0.60,
    NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ubk_id = gnb_bank_id
        AND lyt_activo = TRUE
    )
  WHERE gnb_bank_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ubk_id = gnb_bank_id
        AND LOWER(lyt_nombre) = LOWER('GNB vs SAP B1')
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
    gnb_bank_id,
    'GNB-443 vs SAP B1',
    'Template basado en hoja GNB-443 de Extractos GNB vs SAP B1',
    'SAP B1',
    'GNB',
    0.60,
    FALSE
  WHERE gnb_bank_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ubk_id = gnb_bank_id
        AND LOWER(lyt_nombre) = LOWER('GNB-443 vs SAP B1')
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
    gnb_bank_id,
    'GNB3 vs SAP B1',
    'Template basado en hoja GNB3 de Extractos GNB vs SAP B1',
    'SAP B1',
    'GNB',
    0.60,
    FALSE
  WHERE gnb_bank_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ubk_id = gnb_bank_id
        AND LOWER(lyt_nombre) = LOWER('GNB3 vs SAP B1')
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
    itau_bank_id,
    'Itau vs SAP B1',
    'Template basado en Extractos ITAU vs SAP B1',
    'SAP B1',
    'Itau',
    0.60,
    NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ubk_id = itau_bank_id
        AND lyt_activo = TRUE
    )
  WHERE itau_bank_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.conciliacion_layouts
      WHERE ubk_id = itau_bank_id
        AND LOWER(lyt_nombre) = LOWER('Itau vs SAP B1')
    );

  SELECT lyt_id INTO gnb_layout_id
  FROM public.conciliacion_layouts
  WHERE ubk_id = gnb_bank_id
    AND LOWER(lyt_nombre) = LOWER('GNB vs SAP B1')
  LIMIT 1;

  SELECT lyt_id INTO gnb_443_layout_id
  FROM public.conciliacion_layouts
  WHERE ubk_id = gnb_bank_id
    AND LOWER(lyt_nombre) = LOWER('GNB-443 vs SAP B1')
  LIMIT 1;

  SELECT lyt_id INTO gnb3_layout_id
  FROM public.conciliacion_layouts
  WHERE ubk_id = gnb_bank_id
    AND LOWER(lyt_nombre) = LOWER('GNB3 vs SAP B1')
  LIMIT 1;

  SELECT lyt_id INTO itau_layout_id
  FROM public.conciliacion_layouts
  WHERE ubk_id = itau_bank_id
    AND LOWER(lyt_nombre) = LOWER('Itau vs SAP B1')
  LIMIT 1;

  IF gnb_layout_id IS NOT NULL THEN
    DELETE FROM public.conciliacion_layout_mappings WHERE lyt_id = gnb_layout_id;

    INSERT INTO public.conciliacion_layout_mappings (
      lyt_id, lmp_field_key, lmp_label, lmp_sort_order, lmp_active, lmp_required,
      lmp_compare_operator, lmp_weight, lmp_tolerance,
      lmp_system_sheet, lmp_system_column, lmp_system_start_row, lmp_system_end_row, lmp_system_data_type,
      lmp_bank_sheet, lmp_bank_column, lmp_bank_start_row, lmp_bank_end_row, lmp_bank_data_type
    )
    VALUES
      (gnb_layout_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'GNB', 'C', 15, 5000, 'date'),
      (gnb_layout_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'H', 2, 5000, 'text', 'GNB', 'G', 15, 5000, 'text'),
      (gnb_layout_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'GNB', 'I', 15, 5000, 'amount'),
      (gnb_layout_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'GNB', 'E|D', 15, 5000, 'text');
  END IF;

  IF gnb_443_layout_id IS NOT NULL THEN
    DELETE FROM public.conciliacion_layout_mappings WHERE lyt_id = gnb_443_layout_id;

    INSERT INTO public.conciliacion_layout_mappings (
      lyt_id, lmp_field_key, lmp_label, lmp_sort_order, lmp_active, lmp_required,
      lmp_compare_operator, lmp_weight, lmp_tolerance,
      lmp_system_sheet, lmp_system_column, lmp_system_start_row, lmp_system_end_row, lmp_system_data_type,
      lmp_bank_sheet, lmp_bank_column, lmp_bank_start_row, lmp_bank_end_row, lmp_bank_data_type
    )
    VALUES
      (gnb_443_layout_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'GNB-443', 'C', 15, 5000, 'date'),
      (gnb_443_layout_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'H', 2, 5000, 'text', 'GNB-443', 'G', 15, 5000, 'text'),
      (gnb_443_layout_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'GNB-443', 'I', 15, 5000, 'amount'),
      (gnb_443_layout_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'GNB-443', 'E|D', 15, 5000, 'text');
  END IF;

  IF gnb3_layout_id IS NOT NULL THEN
    DELETE FROM public.conciliacion_layout_mappings WHERE lyt_id = gnb3_layout_id;

    INSERT INTO public.conciliacion_layout_mappings (
      lyt_id, lmp_field_key, lmp_label, lmp_sort_order, lmp_active, lmp_required,
      lmp_compare_operator, lmp_weight, lmp_tolerance,
      lmp_system_sheet, lmp_system_column, lmp_system_start_row, lmp_system_end_row, lmp_system_data_type,
      lmp_bank_sheet, lmp_bank_column, lmp_bank_start_row, lmp_bank_end_row, lmp_bank_data_type
    )
    VALUES
      (gnb3_layout_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'GNB3', 'C', 15, 5000, 'date'),
      (gnb3_layout_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'H', 2, 5000, 'text', 'GNB3', 'G', 15, 5000, 'text'),
      (gnb3_layout_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'GNB3', 'I', 15, 5000, 'amount'),
      (gnb3_layout_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'GNB3', 'E|D', 15, 5000, 'text');
  END IF;

  IF itau_layout_id IS NOT NULL THEN
    DELETE FROM public.conciliacion_layout_mappings WHERE lyt_id = itau_layout_id;

    INSERT INTO public.conciliacion_layout_mappings (
      lyt_id, lmp_field_key, lmp_label, lmp_sort_order, lmp_active, lmp_required,
      lmp_compare_operator, lmp_weight, lmp_tolerance,
      lmp_system_sheet, lmp_system_column, lmp_system_start_row, lmp_system_end_row, lmp_system_data_type,
      lmp_bank_sheet, lmp_bank_column, lmp_bank_start_row, lmp_bank_end_row, lmp_bank_data_type
    )
    VALUES
      (itau_layout_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'Itau CC', 'A', 10, 5000, 'date'),
      (itau_layout_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'H', 2, 5000, 'text', 'Itau CC', 'B', 10, 5000, 'text'),
      (itau_layout_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'Itau CC', 'E', 10, 5000, 'amount'),
      (itau_layout_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'Itau CC', 'C', 10, 5000, 'text');
  END IF;
END;
$$;
