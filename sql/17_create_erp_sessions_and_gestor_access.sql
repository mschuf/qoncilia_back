BEGIN;

CREATE TABLE IF NOT EXISTS public.usuarios_erp_sesiones (
  ues_id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  epc_id INTEGER NOT NULL,
  ues_erp_tipo VARCHAR(50) NOT NULL DEFAULT 'sap_b1',
  ues_username VARCHAR(160) NOT NULL,
  ues_session_cookie_enc TEXT NOT NULL,
  ues_expires_at TIMESTAMPTZ NULL,
  ues_last_validated_at TIMESTAMPTZ NULL,
  ues_invalidated_at TIMESTAMPTZ NULL,
  ues_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ues_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_usuarios_erp_sesiones_username_not_blank CHECK (length(trim(ues_username)) > 0),
  CONSTRAINT fk_usuarios_erp_sesiones_usuarios FOREIGN KEY (usuario_id)
    REFERENCES public.usuarios (usr_id) ON DELETE CASCADE,
  CONSTRAINT fk_usuarios_erp_sesiones_config FOREIGN KEY (epc_id)
    REFERENCES public.empresas_erp_configuraciones (epc_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_erp_sesiones_usuario_config
  ON public.usuarios_erp_sesiones (usuario_id, epc_id);

CREATE INDEX IF NOT EXISTS idx_usuarios_erp_sesiones_usuario_activa
  ON public.usuarios_erp_sesiones (usuario_id, epc_id)
  WHERE ues_invalidated_at IS NULL;

CREATE OR REPLACE FUNCTION public.fn_touch_ues_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.ues_updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_erp_sesiones_touch_updated_at ON public.usuarios_erp_sesiones;
CREATE TRIGGER trg_usuarios_erp_sesiones_touch_updated_at
BEFORE UPDATE ON public.usuarios_erp_sesiones
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_ues_updated_at();

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
  ON r.rol_codigo IN ('is_super_admin', 'admin', 'gestor_cobranza', 'gestor_pagos')
JOIN public.modulos m
  ON m.mod_codigo = 'erp_management'
ON CONFLICT (emp_id, rol_id, mod_id) DO UPDATE
SET
  erm_habilitado = EXCLUDED.erm_habilitado,
  erm_updated_at = NOW();

COMMIT;
