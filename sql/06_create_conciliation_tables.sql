BEGIN;

CREATE TABLE IF NOT EXISTS public.usuarios_bancos (
  ubk_id SERIAL PRIMARY KEY,
  usr_id INTEGER NOT NULL,
  ubk_banco_nombre VARCHAR(120) NOT NULL,
  ubk_alias VARCHAR(120) NULL,
  ubk_moneda VARCHAR(20) NOT NULL,
  ubk_numero_cuenta VARCHAR(80) NULL,
  ubk_descripcion VARCHAR(255) NULL,
  ubk_activo BOOLEAN NOT NULL DEFAULT TRUE,
  ubk_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ubk_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_usuarios_bancos_banco_not_blank CHECK (length(trim(ubk_banco_nombre)) > 0),
  CONSTRAINT chk_usuarios_bancos_moneda_not_blank CHECK (length(trim(ubk_moneda)) > 0)
);

ALTER TABLE public.usuarios_bancos
  ADD COLUMN IF NOT EXISTS ubk_alias VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS ubk_moneda VARCHAR(20) NOT NULL DEFAULT 'GS',
  ADD COLUMN IF NOT EXISTS ubk_numero_cuenta VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS ubk_descripcion VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS ubk_activo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ubk_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ubk_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_usuarios_bancos_usuarios'
  ) THEN
    ALTER TABLE public.usuarios_bancos
      ADD CONSTRAINT fk_usuarios_bancos_usuarios
      FOREIGN KEY (usr_id) REFERENCES public.usuarios (usr_id) ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.conciliacion_layouts (
  lyt_id SERIAL PRIMARY KEY,
  ubk_id INTEGER NOT NULL,
  lyt_nombre VARCHAR(120) NOT NULL,
  lyt_descripcion VARCHAR(255) NULL,
  lyt_system_label VARCHAR(120) NOT NULL DEFAULT 'Sistema',
  lyt_bank_label VARCHAR(120) NOT NULL DEFAULT 'Banco',
  lyt_auto_match_threshold DOUBLE PRECISION NOT NULL DEFAULT 1,
  lyt_activo BOOLEAN NOT NULL DEFAULT FALSE,
  lyt_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lyt_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_conciliacion_layouts_nombre_not_blank CHECK (length(trim(lyt_nombre)) > 0),
  CONSTRAINT chk_conciliacion_layouts_threshold_range CHECK (lyt_auto_match_threshold >= 0 AND lyt_auto_match_threshold <= 1)
);

ALTER TABLE public.conciliacion_layouts
  ADD COLUMN IF NOT EXISTS lyt_system_label VARCHAR(120) NOT NULL DEFAULT 'Sistema',
  ADD COLUMN IF NOT EXISTS lyt_bank_label VARCHAR(120) NOT NULL DEFAULT 'Banco',
  ADD COLUMN IF NOT EXISTS lyt_auto_match_threshold DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lyt_activo BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS lyt_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS lyt_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conciliacion_layouts_usuarios_bancos'
  ) THEN
    ALTER TABLE public.conciliacion_layouts
      ADD CONSTRAINT fk_conciliacion_layouts_usuarios_bancos
      FOREIGN KEY (ubk_id) REFERENCES public.usuarios_bancos (ubk_id) ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.conciliacion_layout_mappings (
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
  CONSTRAINT chk_conciliacion_layout_mappings_weight_non_negative CHECK (lmp_weight >= 0)
);

ALTER TABLE public.conciliacion_layout_mappings
  ADD COLUMN IF NOT EXISTS lmp_compare_operator VARCHAR(40) NOT NULL DEFAULT 'equals',
  ADD COLUMN IF NOT EXISTS lmp_weight DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lmp_tolerance DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS lmp_system_sheet VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS lmp_system_column VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS lmp_system_start_row INTEGER NULL,
  ADD COLUMN IF NOT EXISTS lmp_system_end_row INTEGER NULL,
  ADD COLUMN IF NOT EXISTS lmp_system_data_type VARCHAR(20) NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS lmp_bank_sheet VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS lmp_bank_column VARCHAR(30) NULL,
  ADD COLUMN IF NOT EXISTS lmp_bank_start_row INTEGER NULL,
  ADD COLUMN IF NOT EXISTS lmp_bank_end_row INTEGER NULL,
  ADD COLUMN IF NOT EXISTS lmp_bank_data_type VARCHAR(20) NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS lmp_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS lmp_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conciliacion_layout_mappings_layouts'
  ) THEN
    ALTER TABLE public.conciliacion_layout_mappings
      ADD CONSTRAINT fk_conciliacion_layout_mappings_layouts
      FOREIGN KEY (lyt_id) REFERENCES public.conciliacion_layouts (lyt_id) ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.conciliaciones (
  con_id SERIAL PRIMARY KEY,
  usr_id INTEGER NOT NULL,
  ubk_id INTEGER NOT NULL,
  lyt_id INTEGER NOT NULL,
  con_nombre VARCHAR(160) NOT NULL,
  con_estado VARCHAR(40) NOT NULL DEFAULT 'saved',
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
  CONSTRAINT chk_conciliaciones_nombre_not_blank CHECK (length(trim(con_nombre)) > 0)
);

ALTER TABLE public.conciliaciones
  ADD COLUMN IF NOT EXISTS con_estado VARCHAR(40) NOT NULL DEFAULT 'saved',
  ADD COLUMN IF NOT EXISTS con_system_filename VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS con_bank_filename VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS con_total_system_rows INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS con_total_bank_rows INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS con_auto_matches INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS con_manual_matches INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS con_unmatched_system INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS con_unmatched_bank INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS con_match_percentage DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS con_summary_snapshot JSONB NULL,
  ADD COLUMN IF NOT EXISTS con_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS con_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conciliaciones_usuarios'
  ) THEN
    ALTER TABLE public.conciliaciones
      ADD CONSTRAINT fk_conciliaciones_usuarios
      FOREIGN KEY (usr_id) REFERENCES public.usuarios (usr_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conciliaciones_usuarios_bancos'
  ) THEN
    ALTER TABLE public.conciliaciones
      ADD CONSTRAINT fk_conciliaciones_usuarios_bancos
      FOREIGN KEY (ubk_id) REFERENCES public.usuarios_bancos (ubk_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conciliaciones_layouts'
  ) THEN
    ALTER TABLE public.conciliaciones
      ADD CONSTRAINT fk_conciliaciones_layouts
      FOREIGN KEY (lyt_id) REFERENCES public.conciliacion_layouts (lyt_id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.conciliacion_matches (
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
  cmt_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conciliacion_matches_conciliaciones'
  ) THEN
    ALTER TABLE public.conciliacion_matches
      ADD CONSTRAINT fk_conciliacion_matches_conciliaciones
      FOREIGN KEY (con_id) REFERENCES public.conciliaciones (con_id) ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_bancos_usuario_banco_cuenta_moneda
  ON public.usuarios_bancos (
    usr_id,
    LOWER(ubk_banco_nombre),
    COALESCE(LOWER(ubk_numero_cuenta), ''),
    UPPER(ubk_moneda)
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_conciliacion_layouts_active
  ON public.conciliacion_layouts (ubk_id)
  WHERE lyt_activo = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_conciliacion_layout_mappings_layout_field
  ON public.conciliacion_layout_mappings (lyt_id, LOWER(lmp_field_key));

CREATE INDEX IF NOT EXISTS idx_usuarios_bancos_usr_id
  ON public.usuarios_bancos (usr_id);

CREATE INDEX IF NOT EXISTS idx_conciliacion_layouts_ubk_id
  ON public.conciliacion_layouts (ubk_id);

CREATE INDEX IF NOT EXISTS idx_conciliacion_layout_mappings_lyt_id
  ON public.conciliacion_layout_mappings (lyt_id);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_usr_id
  ON public.conciliaciones (usr_id);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_ubk_id
  ON public.conciliaciones (ubk_id);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_lyt_id
  ON public.conciliaciones (lyt_id);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_created_at
  ON public.conciliaciones (con_created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conciliacion_matches_con_id
  ON public.conciliacion_matches (con_id);

CREATE OR REPLACE FUNCTION public.fn_touch_ubk_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.ubk_updated_at = NOW();
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

DROP TRIGGER IF EXISTS trg_usuarios_bancos_touch_updated_at ON public.usuarios_bancos;
CREATE TRIGGER trg_usuarios_bancos_touch_updated_at
BEFORE UPDATE ON public.usuarios_bancos
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_ubk_updated_at();

DROP TRIGGER IF EXISTS trg_conciliacion_layouts_touch_updated_at ON public.conciliacion_layouts;
CREATE TRIGGER trg_conciliacion_layouts_touch_updated_at
BEFORE UPDATE ON public.conciliacion_layouts
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_lyt_updated_at();

DROP TRIGGER IF EXISTS trg_conciliacion_layout_mappings_touch_updated_at ON public.conciliacion_layout_mappings;
CREATE TRIGGER trg_conciliacion_layout_mappings_touch_updated_at
BEFORE UPDATE ON public.conciliacion_layout_mappings
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_lmp_updated_at();

DROP TRIGGER IF EXISTS trg_conciliaciones_touch_updated_at ON public.conciliaciones;
CREATE TRIGGER trg_conciliaciones_touch_updated_at
BEFORE UPDATE ON public.conciliaciones
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_con_updated_at();

COMMIT;
