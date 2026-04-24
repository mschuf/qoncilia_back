BEGIN;

DROP TRIGGER IF EXISTS trg_conciliaciones_erp_envios_touch_updated_at ON public.conciliaciones_erp_envios;
DROP TRIGGER IF EXISTS trg_empresas_erp_configuraciones_touch_updated_at ON public.empresas_erp_configuraciones;
DROP TABLE IF EXISTS public.conciliaciones_erp_envios CASCADE;
DROP TABLE IF EXISTS public.empresas_erp_configuraciones CASCADE;

CREATE TABLE IF NOT EXISTS public.empresas_erp_configuraciones (
  epc_id SERIAL PRIMARY KEY,
  emp_id INTEGER NOT NULL,
  epc_codigo VARCHAR(80) NOT NULL,
  epc_nombre VARCHAR(160) NOT NULL,
  epc_tipo VARCHAR(50) NOT NULL DEFAULT 'sap_b1',
  epc_descripcion VARCHAR(255) NULL,
  epc_activo BOOLEAN NOT NULL DEFAULT TRUE,
  epc_es_predeterminado BOOLEAN NOT NULL DEFAULT FALSE,
  epc_sap_username VARCHAR(120) NULL,
  epc_db_name VARCHAR(160) NULL,
  epc_cmp_name VARCHAR(160) NULL,
  epc_server_node VARCHAR(160) NULL,
  epc_db_user VARCHAR(160) NULL,
  epc_db_password_enc TEXT NULL,
  epc_service_layer_url VARCHAR(255) NULL,
  epc_tls_version VARCHAR(10) NULL,
  epc_allow_self_signed BOOLEAN NOT NULL DEFAULT FALSE,
  epc_settings JSONB NULL,
  epc_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  epc_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_empresas_erp_configuraciones_codigo_not_blank CHECK (length(trim(epc_codigo)) > 0),
  CONSTRAINT chk_empresas_erp_configuraciones_nombre_not_blank CHECK (length(trim(epc_nombre)) > 0)
);

ALTER TABLE public.empresas_erp_configuraciones
  ADD COLUMN IF NOT EXISTS emp_id INTEGER,
  ADD COLUMN IF NOT EXISTS epc_codigo VARCHAR(80),
  ADD COLUMN IF NOT EXISTS epc_nombre VARCHAR(160),
  ADD COLUMN IF NOT EXISTS epc_tipo VARCHAR(50) NOT NULL DEFAULT 'sap_b1',
  ADD COLUMN IF NOT EXISTS epc_descripcion VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS epc_activo BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS epc_es_predeterminado BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS epc_sap_username VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS epc_db_name VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS epc_cmp_name VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS epc_server_node VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS epc_db_user VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS epc_db_password_enc TEXT NULL,
  ADD COLUMN IF NOT EXISTS epc_service_layer_url VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS epc_tls_version VARCHAR(10) NULL,
  ADD COLUMN IF NOT EXISTS epc_allow_self_signed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS epc_settings JSONB NULL,
  ADD COLUMN IF NOT EXISTS epc_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS epc_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_empresas_erp_configuraciones_empresas'
  ) THEN
    ALTER TABLE public.empresas_erp_configuraciones
      ADD CONSTRAINT fk_empresas_erp_configuraciones_empresas
      FOREIGN KEY (emp_id) REFERENCES public.empresas (emp_id) ON DELETE CASCADE;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_erp_configuraciones_codigo
  ON public.empresas_erp_configuraciones (emp_id, LOWER(epc_codigo));

CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_erp_configuraciones_default
  ON public.empresas_erp_configuraciones (emp_id)
  WHERE epc_es_predeterminado = TRUE;

CREATE INDEX IF NOT EXISTS idx_empresas_erp_configuraciones_emp_id
  ON public.empresas_erp_configuraciones (emp_id);

CREATE INDEX IF NOT EXISTS idx_empresas_erp_configuraciones_emp_id_activo
  ON public.empresas_erp_configuraciones (emp_id, epc_activo);

CREATE TABLE IF NOT EXISTS public.conciliaciones_erp_envios (
  ces_id SERIAL PRIMARY KEY,
  con_id INTEGER NOT NULL,
  epc_id INTEGER NOT NULL,
  usr_sender_id INTEGER NOT NULL,
  ces_documento_tipo VARCHAR(40) NOT NULL,
  ces_estado VARCHAR(40) NOT NULL DEFAULT 'pending',
  ces_endpoint VARCHAR(255) NULL,
  ces_http_status INTEGER NULL,
  ces_request_payload JSONB NULL,
  ces_response_payload JSONB NULL,
  ces_error_message VARCHAR(500) NULL,
  ces_external_doc_entry VARCHAR(80) NULL,
  ces_external_doc_num VARCHAR(80) NULL,
  ces_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ces_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_conciliaciones_erp_envios_documento_tipo_not_blank CHECK (length(trim(ces_documento_tipo)) > 0),
  CONSTRAINT chk_conciliaciones_erp_envios_estado_not_blank CHECK (length(trim(ces_estado)) > 0)
);

ALTER TABLE public.conciliaciones_erp_envios
  ADD COLUMN IF NOT EXISTS con_id INTEGER,
  ADD COLUMN IF NOT EXISTS epc_id INTEGER,
  ADD COLUMN IF NOT EXISTS usr_sender_id INTEGER,
  ADD COLUMN IF NOT EXISTS ces_documento_tipo VARCHAR(40),
  ADD COLUMN IF NOT EXISTS ces_estado VARCHAR(40) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ces_endpoint VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS ces_http_status INTEGER NULL,
  ADD COLUMN IF NOT EXISTS ces_request_payload JSONB NULL,
  ADD COLUMN IF NOT EXISTS ces_response_payload JSONB NULL,
  ADD COLUMN IF NOT EXISTS ces_error_message VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS ces_external_doc_entry VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS ces_external_doc_num VARCHAR(80) NULL,
  ADD COLUMN IF NOT EXISTS ces_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS ces_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conciliaciones_erp_envios_conciliaciones'
  ) THEN
    ALTER TABLE public.conciliaciones_erp_envios
      ADD CONSTRAINT fk_conciliaciones_erp_envios_conciliaciones
      FOREIGN KEY (con_id) REFERENCES public.conciliaciones (con_id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conciliaciones_erp_envios_empresas_erp_configuraciones'
  ) THEN
    ALTER TABLE public.conciliaciones_erp_envios
      ADD CONSTRAINT fk_conciliaciones_erp_envios_empresas_erp_configuraciones
      FOREIGN KEY (epc_id) REFERENCES public.empresas_erp_configuraciones (epc_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conciliaciones_erp_envios_usuarios'
  ) THEN
    ALTER TABLE public.conciliaciones_erp_envios
      ADD CONSTRAINT fk_conciliaciones_erp_envios_usuarios
      FOREIGN KEY (usr_sender_id) REFERENCES public.usuarios (usr_id) ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_conciliaciones_erp_envios_con_id
  ON public.conciliaciones_erp_envios (con_id);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_erp_envios_epc_id
  ON public.conciliaciones_erp_envios (epc_id);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_erp_envios_sender_id
  ON public.conciliaciones_erp_envios (usr_sender_id);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_erp_envios_estado
  ON public.conciliaciones_erp_envios (ces_estado);

CREATE OR REPLACE FUNCTION public.fn_touch_epc_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.epc_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_touch_ces_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.ces_updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_empresas_erp_configuraciones_touch_updated_at ON public.empresas_erp_configuraciones;
CREATE TRIGGER trg_empresas_erp_configuraciones_touch_updated_at
BEFORE UPDATE ON public.empresas_erp_configuraciones
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_epc_updated_at();

DROP TRIGGER IF EXISTS trg_conciliaciones_erp_envios_touch_updated_at ON public.conciliaciones_erp_envios;
CREATE TRIGGER trg_conciliaciones_erp_envios_touch_updated_at
BEFORE UPDATE ON public.conciliaciones_erp_envios
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_ces_updated_at();

INSERT INTO public.modulos (
  mod_codigo,
  mod_nombre,
  mod_ruta,
  mod_descripcion,
  mod_activo
) VALUES
  ('erp_management', 'Integraciones ERP', '/erp-management', 'Configuracion de ERPs por empresa y envios a SAP.', TRUE)
ON CONFLICT (mod_codigo) DO UPDATE
SET
  mod_nombre = EXCLUDED.mod_nombre,
  mod_ruta = EXCLUDED.mod_ruta,
  mod_descripcion = EXCLUDED.mod_descripcion,
  mod_activo = EXCLUDED.mod_activo;

INSERT INTO public.empresas_roles_modulos (
  emp_id,
  rol_id,
  mod_id,
  erm_habilitado
)
SELECT
  e.emp_id,
  r.rol_id,
  m.mod_id,
  TRUE
FROM public.empresas e
JOIN public.roles r
  ON r.rol_codigo IN ('is_super_admin', 'admin')
JOIN public.modulos m
  ON m.mod_codigo = 'erp_management'
ON CONFLICT (emp_id, rol_id, mod_id) DO UPDATE
SET
  erm_habilitado = EXCLUDED.erm_habilitado,
  erm_updated_at = NOW();

COMMIT;
