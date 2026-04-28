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
  CONSTRAINT chk_empresas_erp_configuraciones_nombre_not_blank CHECK (length(trim(epc_nombre)) > 0),
  CONSTRAINT fk_empresas_erp_configuraciones_empresas FOREIGN KEY (emp_id)
    REFERENCES public.empresas (emp_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_erp_configuraciones_codigo
  ON public.empresas_erp_configuraciones (emp_id, LOWER(epc_codigo));

CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_erp_configuraciones_default
  ON public.empresas_erp_configuraciones (emp_id)
  WHERE epc_es_predeterminado = TRUE;

CREATE INDEX IF NOT EXISTS idx_empresas_erp_configuraciones_emp_id
  ON public.empresas_erp_configuraciones (emp_id);

CREATE INDEX IF NOT EXISTS idx_empresas_erp_configuraciones_emp_id_activo
  ON public.empresas_erp_configuraciones (emp_id, epc_activo);

CREATE OR REPLACE FUNCTION public.fn_touch_epc_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.epc_updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_empresas_erp_configuraciones_touch_updated_at
BEFORE UPDATE ON public.empresas_erp_configuraciones
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_epc_updated_at();

INSERT INTO public.modulos (
  mod_codigo,
  mod_nombre,
  mod_ruta,
  mod_descripcion,
  mod_activo
) VALUES
  ('erp_management', 'Integraciones ERP', '/erp-management', 'Configuracion de ERPs por empresa.', TRUE)
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
