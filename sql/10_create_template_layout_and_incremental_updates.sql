BEGIN;

DROP TRIGGER IF EXISTS trg_template_layout_mapping_touch_updated_at ON public.template_layout_mapping;
DROP TRIGGER IF EXISTS trg_template_layout_touch_updated_at ON public.template_layout;

DROP TABLE IF EXISTS public.template_layout_mapping CASCADE;
DROP TABLE IF EXISTS public.template_layout CASCADE;

ALTER TABLE public.conciliacion_layouts
  DROP CONSTRAINT IF EXISTS fk_conciliacion_layouts_template_layout;

ALTER TABLE public.conciliacion_layouts
  DROP COLUMN IF EXISTS tpl_id;

CREATE TABLE public.template_layout (
  tpl_id SERIAL PRIMARY KEY,
  tpl_nombre VARCHAR(120) NOT NULL,
  tpl_descripcion VARCHAR(255) NULL,
  tpl_banco_referencia VARCHAR(120) NULL,
  sys_id INTEGER NOT NULL,
  tpl_system_label VARCHAR(120) NOT NULL DEFAULT 'Sistema',
  tpl_bank_label VARCHAR(120) NOT NULL DEFAULT 'Banco',
  tpl_auto_match_threshold DOUBLE PRECISION NOT NULL DEFAULT 1,
  tpl_activo BOOLEAN NOT NULL DEFAULT TRUE,
  tpl_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tpl_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_template_layout_nombre_not_blank CHECK (length(trim(tpl_nombre)) > 0),
  CONSTRAINT chk_template_layout_threshold_range CHECK (
    tpl_auto_match_threshold >= 0 AND tpl_auto_match_threshold <= 1
  ),
  CONSTRAINT fk_template_layout_systems FOREIGN KEY (sys_id)
    REFERENCES public.conciliation_systems (sys_id) ON DELETE RESTRICT
);

CREATE TABLE public.template_layout_mapping (
  tpm_id SERIAL PRIMARY KEY,
  tpl_id INTEGER NOT NULL,
  tpm_field_key VARCHAR(60) NOT NULL,
  tpm_label VARCHAR(120) NOT NULL,
  tpm_sort_order INTEGER NOT NULL DEFAULT 0,
  tpm_active BOOLEAN NOT NULL DEFAULT TRUE,
  tpm_required BOOLEAN NOT NULL DEFAULT FALSE,
  tpm_compare_operator VARCHAR(40) NOT NULL DEFAULT 'equals',
  tpm_weight DOUBLE PRECISION NOT NULL DEFAULT 1,
  tpm_tolerance DOUBLE PRECISION NULL,
  tpm_system_sheet VARCHAR(120) NULL,
  tpm_system_column VARCHAR(30) NULL,
  tpm_system_start_row INTEGER NULL,
  tpm_system_end_row INTEGER NULL,
  tpm_system_data_type VARCHAR(20) NOT NULL DEFAULT 'text',
  tpm_bank_sheet VARCHAR(120) NULL,
  tpm_bank_column VARCHAR(30) NULL,
  tpm_bank_start_row INTEGER NULL,
  tpm_bank_end_row INTEGER NULL,
  tpm_bank_data_type VARCHAR(20) NOT NULL DEFAULT 'text',
  tpm_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tpm_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_template_layout_mapping_field_not_blank CHECK (length(trim(tpm_field_key)) > 0),
  CONSTRAINT chk_template_layout_mapping_label_not_blank CHECK (length(trim(tpm_label)) > 0),
  CONSTRAINT chk_template_layout_mapping_weight_non_negative CHECK (tpm_weight >= 0),
  CONSTRAINT fk_template_layout_mapping_template_layout FOREIGN KEY (tpl_id) REFERENCES public.template_layout (tpl_id) ON DELETE CASCADE
);

ALTER TABLE public.conciliacion_layouts
  ADD COLUMN tpl_id INTEGER NULL;

ALTER TABLE public.conciliacion_layouts
  ADD CONSTRAINT fk_conciliacion_layouts_template_layout
  FOREIGN KEY (tpl_id) REFERENCES public.template_layout (tpl_id) ON DELETE SET NULL;

CREATE UNIQUE INDEX uq_template_layout_name
  ON public.template_layout ((LOWER(tpl_nombre)));

CREATE UNIQUE INDEX uq_template_layout_mapping_field
  ON public.template_layout_mapping (tpl_id, LOWER(tpm_field_key));

CREATE INDEX idx_template_layout_mapping_tpl_id
  ON public.template_layout_mapping (tpl_id);

CREATE INDEX idx_conciliacion_layouts_tpl_id
  ON public.conciliacion_layouts (tpl_id);

CREATE INDEX idx_template_layout_sys_id
  ON public.template_layout (sys_id);

CREATE OR REPLACE FUNCTION public.fn_touch_tpl_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tpl_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_touch_tpm_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tpm_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_template_layout_touch_updated_at
BEFORE UPDATE ON public.template_layout
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_tpl_updated_at();

CREATE TRIGGER trg_template_layout_mapping_touch_updated_at
BEFORE UPDATE ON public.template_layout_mapping
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_tpm_updated_at();

COMMIT;
