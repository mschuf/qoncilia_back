BEGIN;

DROP TRIGGER IF EXISTS trg_conciliacion_matches_touch_updated_at ON public.conciliacion_matches;
DROP TRIGGER IF EXISTS trg_conciliaciones_touch_updated_at ON public.conciliaciones;
DROP TRIGGER IF EXISTS trg_conciliacion_layout_mappings_touch_updated_at ON public.conciliacion_layout_mappings;
DROP TRIGGER IF EXISTS trg_conciliacion_layouts_touch_updated_at ON public.conciliacion_layouts;
DROP TRIGGER IF EXISTS trg_conciliation_systems_touch_updated_at ON public.conciliation_systems;

DROP TABLE IF EXISTS public.conciliacion_matches CASCADE;
DROP TABLE IF EXISTS public.conciliaciones CASCADE;
DROP TABLE IF EXISTS public.conciliacion_layout_mappings CASCADE;
DROP TABLE IF EXISTS public.conciliacion_layouts CASCADE;
DROP TABLE IF EXISTS public.conciliation_systems CASCADE;
DROP TABLE IF EXISTS public.migrations CASCADE;

CREATE TABLE public.conciliation_systems (
  sys_id SERIAL PRIMARY KEY,
  sys_nombre VARCHAR(120) NOT NULL,
  sys_descripcion VARCHAR(255) NULL,
  sys_activo BOOLEAN NOT NULL DEFAULT TRUE,
  sys_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sys_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_conciliation_systems_nombre_not_blank CHECK (length(trim(sys_nombre)) > 0)
);

CREATE UNIQUE INDEX uq_conciliation_systems_name
  ON public.conciliation_systems ((LOWER(sys_nombre)));

CREATE TABLE public.conciliacion_layouts (
  lyt_id SERIAL PRIMARY KEY,
  ban_id INTEGER NOT NULL,
  sys_id INTEGER NOT NULL,
  lyt_source_layout_id INTEGER NULL,
  lyt_nombre VARCHAR(120) NOT NULL,
  lyt_descripcion VARCHAR(255) NULL,
  lyt_system_label VARCHAR(120) NOT NULL DEFAULT 'Sistema',
  lyt_bank_label VARCHAR(120) NOT NULL DEFAULT 'Banco',
  lyt_auto_match_threshold DOUBLE PRECISION NOT NULL DEFAULT 1,
  lyt_activo BOOLEAN NOT NULL DEFAULT FALSE,
  lyt_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lyt_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_conciliacion_layouts_nombre_not_blank CHECK (length(trim(lyt_nombre)) > 0),
  CONSTRAINT chk_conciliacion_layouts_threshold_range CHECK (lyt_auto_match_threshold >= 0 AND lyt_auto_match_threshold <= 1),
  CONSTRAINT fk_conciliacion_layouts_bancos FOREIGN KEY (ban_id) REFERENCES public.bancos (ban_id) ON DELETE CASCADE,
  CONSTRAINT fk_conciliacion_layouts_systems FOREIGN KEY (sys_id)
    REFERENCES public.conciliation_systems (sys_id) ON DELETE RESTRICT,
  CONSTRAINT fk_conciliacion_layouts_source_layout FOREIGN KEY (lyt_source_layout_id)
    REFERENCES public.conciliacion_layouts (lyt_id) ON DELETE SET NULL
);

CREATE TABLE public.conciliacion_layout_mappings (
  lmp_id SERIAL PRIMARY KEY,
  lyt_id INTEGER NOT NULL,
  lmp_field_key VARCHAR(60) NOT NULL,
  lmp_label VARCHAR(120) NOT NULL,
  lmp_sort_order INTEGER NOT NULL DEFAULT 0,
  lmp_active BOOLEAN NOT NULL DEFAULT TRUE,
  lmp_required BOOLEAN NOT NULL DEFAULT FALSE,
  lmp_compare_operator VARCHAR(40) NOT NULL DEFAULT 'equals',
  lmp_weight DOUBLE PRECISION NOT NULL DEFAULT 1,
  lmp_tolerance DOUBLE PRECISION NULL,
  lmp_system_sheet VARCHAR(120) NULL,
  lmp_system_column VARCHAR(30) NULL,
  lmp_system_start_row INTEGER NULL,
  lmp_system_end_row INTEGER NULL,
  lmp_system_data_type VARCHAR(20) NOT NULL DEFAULT 'text',
  lmp_bank_sheet VARCHAR(120) NULL,
  lmp_bank_column VARCHAR(30) NULL,
  lmp_bank_start_row INTEGER NULL,
  lmp_bank_end_row INTEGER NULL,
  lmp_bank_data_type VARCHAR(20) NOT NULL DEFAULT 'text',
  lmp_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lmp_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_conciliacion_layout_mappings_field_not_blank CHECK (length(trim(lmp_field_key)) > 0),
  CONSTRAINT chk_conciliacion_layout_mappings_label_not_blank CHECK (length(trim(lmp_label)) > 0),
  CONSTRAINT chk_conciliacion_layout_mappings_weight_non_negative CHECK (lmp_weight >= 0),
  CONSTRAINT fk_conciliacion_layout_mappings_layouts FOREIGN KEY (lyt_id) REFERENCES public.conciliacion_layouts (lyt_id) ON DELETE CASCADE
);

CREATE TABLE public.conciliaciones (
  con_id SERIAL PRIMARY KEY,
  usr_id INTEGER NOT NULL,
  ban_id INTEGER NOT NULL,
  lyt_id INTEGER NOT NULL,
  ecb_id INTEGER NULL,
  con_nombre VARCHAR(160) NOT NULL,
  con_estado VARCHAR(40) NOT NULL DEFAULT 'saved',
  con_update_count INTEGER NOT NULL DEFAULT 0,
  con_has_system_data BOOLEAN NOT NULL DEFAULT FALSE,
  con_has_bank_data BOOLEAN NOT NULL DEFAULT FALSE,
  con_system_filename VARCHAR(255) NULL,
  con_bank_filename VARCHAR(255) NULL,
  con_total_system_rows INTEGER NOT NULL DEFAULT 0,
  con_total_bank_rows INTEGER NOT NULL DEFAULT 0,
  con_auto_matches INTEGER NOT NULL DEFAULT 0,
  con_manual_matches INTEGER NOT NULL DEFAULT 0,
  con_unmatched_system INTEGER NOT NULL DEFAULT 0,
  con_unmatched_bank INTEGER NOT NULL DEFAULT 0,
  con_match_percentage DOUBLE PRECISION NOT NULL DEFAULT 0,
  con_summary_snapshot JSONB NULL,
  con_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  con_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_conciliaciones_nombre_not_blank CHECK (length(trim(con_nombre)) > 0),
  CONSTRAINT fk_conciliaciones_usuarios FOREIGN KEY (usr_id) REFERENCES public.usuarios (usr_id) ON DELETE CASCADE,
  CONSTRAINT fk_conciliaciones_bancos FOREIGN KEY (ban_id) REFERENCES public.bancos (ban_id) ON DELETE CASCADE,
  CONSTRAINT fk_conciliaciones_layouts FOREIGN KEY (lyt_id) REFERENCES public.conciliacion_layouts (lyt_id) ON DELETE RESTRICT,
  CONSTRAINT fk_conciliaciones_ecb FOREIGN KEY (ecb_id)
    REFERENCES public.empresas_cuentas_bancarias (ecb_id) ON DELETE SET NULL
);

CREATE TABLE public.conciliacion_matches (
  cmt_id SERIAL PRIMARY KEY,
  con_id INTEGER NOT NULL,
  cmt_status VARCHAR(40) NOT NULL,
  cmt_system_row_id VARCHAR(80) NULL,
  cmt_bank_row_id VARCHAR(80) NULL,
  cmt_system_row_number INTEGER NULL,
  cmt_bank_row_number INTEGER NULL,
  cmt_score DOUBLE PRECISION NULL,
  cmt_details JSONB NULL,
  cmt_system_payload JSONB NULL,
  cmt_bank_payload JSONB NULL,
  cmt_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_conciliacion_matches_conciliaciones FOREIGN KEY (con_id) REFERENCES public.conciliaciones (con_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_conciliacion_layouts_active
  ON public.conciliacion_layouts (ban_id)
  WHERE lyt_activo = TRUE;

CREATE UNIQUE INDEX uq_conciliacion_layouts_source_layout
  ON public.conciliacion_layouts (ban_id, lyt_source_layout_id)
  WHERE lyt_source_layout_id IS NOT NULL;

CREATE UNIQUE INDEX uq_conciliacion_layout_mappings_layout_field
  ON public.conciliacion_layout_mappings (lyt_id, LOWER(lmp_field_key));

CREATE INDEX idx_conciliacion_layouts_ban_id
  ON public.conciliacion_layouts (ban_id);

CREATE INDEX idx_conciliacion_layouts_sys_id
  ON public.conciliacion_layouts (sys_id);

CREATE INDEX idx_conciliacion_layouts_source_layout_id
  ON public.conciliacion_layouts (lyt_source_layout_id);

CREATE INDEX idx_conciliacion_layout_mappings_lyt_id
  ON public.conciliacion_layout_mappings (lyt_id);

CREATE INDEX idx_conciliaciones_usr_id
  ON public.conciliaciones (usr_id);

CREATE INDEX idx_conciliaciones_ban_id
  ON public.conciliaciones (ban_id);

CREATE INDEX idx_conciliaciones_lyt_id
  ON public.conciliaciones (lyt_id);

CREATE INDEX idx_conciliaciones_ecb_id
  ON public.conciliaciones (ecb_id);

CREATE INDEX idx_conciliaciones_created_at
  ON public.conciliaciones (con_created_at DESC);

CREATE INDEX idx_conciliacion_matches_con_id
  ON public.conciliacion_matches (con_id);

INSERT INTO public.conciliation_systems (
  sys_nombre,
  sys_descripcion,
  sys_activo
)
VALUES (
  'SAP',
  'Sistema base para seeds y layouts iniciales de conciliacion.',
  TRUE
)
ON CONFLICT ((LOWER(sys_nombre))) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_touch_sys_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.sys_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_touch_lyt_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.lyt_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_touch_lmp_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.lmp_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_touch_con_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.con_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_conciliacion_layouts_touch_updated_at
BEFORE UPDATE ON public.conciliacion_layouts
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_lyt_updated_at();

CREATE TRIGGER trg_conciliacion_layout_mappings_touch_updated_at
BEFORE UPDATE ON public.conciliacion_layout_mappings
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_lmp_updated_at();

CREATE TRIGGER trg_conciliaciones_touch_updated_at
BEFORE UPDATE ON public.conciliaciones
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_con_updated_at();

CREATE TRIGGER trg_conciliation_systems_touch_updated_at
BEFORE UPDATE ON public.conciliation_systems
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_sys_updated_at();

COMMIT;
