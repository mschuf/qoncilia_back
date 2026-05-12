BEGIN;

-- Plantillas ERP globales. No pertenecen a ninguna empresa.
-- Las passwords se guardan cifradas por la aplicacion; no cargar texto plano por SQL.
CREATE TABLE IF NOT EXISTS public.erp_configuraciones_plantillas (
  ept_id SERIAL PRIMARY KEY,
  ept_codigo VARCHAR(80) NOT NULL,
  ept_nombre VARCHAR(160) NOT NULL,
  ept_activo BOOLEAN NOT NULL DEFAULT FALSE,
  ept_es_predeterminado BOOLEAN NOT NULL DEFAULT FALSE,
  ept_user_system VARCHAR(120) NULL,
  ept_user_pass TEXT NULL,
  ept_db_name VARCHAR(160) NULL,
  ept_server_node VARCHAR(160) NULL,
  ept_db_user VARCHAR(160) NULL,
  ept_db_password_enc TEXT NULL,
  ept_service_layer_url VARCHAR(255) NULL,
  ept_tls_version VARCHAR(10) NULL,
  ept_allow_self_signed BOOLEAN NOT NULL DEFAULT FALSE,
  ept_settings JSONB NULL,
  ept_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ept_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_erp_configuraciones_plantillas_codigo_not_blank CHECK (length(trim(ept_codigo)) > 0),
  CONSTRAINT chk_erp_configuraciones_plantillas_nombre_not_blank CHECK (length(trim(ept_nombre)) > 0),
  CONSTRAINT chk_erp_configuraciones_plantillas_default_active CHECK (
    ept_es_predeterminado = FALSE OR ept_activo = TRUE
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_configuraciones_plantillas_codigo
  ON public.erp_configuraciones_plantillas (LOWER(ept_codigo));

CREATE OR REPLACE FUNCTION public.fn_touch_ept_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.ept_updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_erp_configuraciones_plantillas_touch_updated_at
  ON public.erp_configuraciones_plantillas;

CREATE TRIGGER trg_erp_configuraciones_plantillas_touch_updated_at
BEFORE UPDATE ON public.erp_configuraciones_plantillas
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_ept_updated_at();

ALTER TABLE public.empresas_erp_configuraciones
  ADD COLUMN IF NOT EXISTS ept_id INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_empresas_erp_configuraciones_plantillas'
  ) THEN
    ALTER TABLE public.empresas_erp_configuraciones
      ADD CONSTRAINT fk_empresas_erp_configuraciones_plantillas
      FOREIGN KEY (ept_id)
      REFERENCES public.erp_configuraciones_plantillas (ept_id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_empresas_erp_configuraciones_ept_id
  ON public.empresas_erp_configuraciones (ept_id);

COMMIT;
