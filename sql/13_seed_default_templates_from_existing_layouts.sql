BEGIN;

WITH source_layouts AS (
  SELECT DISTINCT ON (LOWER(l.lyt_nombre))
    l.lyt_id,
    l.sys_id,
    trim(l.lyt_nombre) AS template_name,
    NULLIF(trim(l.lyt_descripcion), '') AS template_description,
    COALESCE(
      NULLIF(trim(b.ban_alias), ''),
      NULLIF(trim(b.ban_nombre), '')
    ) AS reference_bank_name,
    l.lyt_system_label,
    l.lyt_bank_label,
    l.lyt_auto_match_threshold,
    COALESCE(l.lyt_activo, TRUE) AS tpl_activo
  FROM public.conciliacion_layouts l
  INNER JOIN public.bancos b
    ON b.ban_id = l.ban_id
  ORDER BY LOWER(l.lyt_nombre), l.lyt_id
)
INSERT INTO public.template_layout (
  tpl_nombre,
  tpl_descripcion,
  tpl_banco_referencia,
  sys_id,
  tpl_system_label,
  tpl_bank_label,
  tpl_auto_match_threshold,
  tpl_activo
)
SELECT
  s.template_name,
  s.template_description,
  s.reference_bank_name,
  s.sys_id,
  s.lyt_system_label,
  s.lyt_bank_label,
  s.lyt_auto_match_threshold,
  s.tpl_activo
FROM source_layouts s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.template_layout t
  WHERE LOWER(t.tpl_nombre) = LOWER(s.template_name)
);

WITH source_layouts AS (
  SELECT DISTINCT ON (LOWER(l.lyt_nombre))
    l.lyt_id,
    trim(l.lyt_nombre) AS template_name
  FROM public.conciliacion_layouts l
  ORDER BY LOWER(l.lyt_nombre), l.lyt_id
)
INSERT INTO public.template_layout_mapping (
  tpl_id,
  tpm_field_key,
  tpm_label,
  tpm_sort_order,
  tpm_active,
  tpm_required,
  tpm_compare_operator,
  tpm_weight,
  tpm_tolerance,
  tpm_system_sheet,
  tpm_system_column,
  tpm_system_start_row,
  tpm_system_end_row,
  tpm_system_data_type,
  tpm_bank_sheet,
  tpm_bank_column,
  tpm_bank_start_row,
  tpm_bank_end_row,
  tpm_bank_data_type
)
SELECT
  t.tpl_id,
  m.lmp_field_key,
  m.lmp_label,
  m.lmp_sort_order,
  m.lmp_active,
  m.lmp_required,
  m.lmp_compare_operator,
  m.lmp_weight,
  m.lmp_tolerance,
  m.lmp_system_sheet,
  m.lmp_system_column,
  m.lmp_system_start_row,
  m.lmp_system_end_row,
  m.lmp_system_data_type,
  m.lmp_bank_sheet,
  m.lmp_bank_column,
  m.lmp_bank_start_row,
  m.lmp_bank_end_row,
  m.lmp_bank_data_type
FROM source_layouts s
INNER JOIN public.template_layout t
  ON LOWER(t.tpl_nombre) = LOWER(s.template_name)
INNER JOIN public.conciliacion_layout_mappings m
  ON m.lyt_id = s.lyt_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.template_layout_mapping tm
  WHERE tm.tpl_id = t.tpl_id
)
ORDER BY t.tpl_id, m.lmp_sort_order, m.lmp_id;

UPDATE public.conciliacion_layouts l
SET tpl_id = t.tpl_id
FROM public.template_layout t
WHERE LOWER(t.tpl_nombre) = LOWER(l.lyt_nombre)
  AND t.sys_id = l.sys_id
  AND l.tpl_id IS DISTINCT FROM t.tpl_id;

COMMIT;
