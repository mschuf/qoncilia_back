-- Tabla legacy: habilitaba plantillas base por banco.
-- Desde 18_create_user_template_availability.sql la habilitacion operativa es global por usuario admin.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bancos_plantillas_base_disponibles (
  banco_plantilla_disponible_id SERIAL PRIMARY KEY,
  banco_id INTEGER NOT NULL,
  plantilla_base_id INTEGER NOT NULL,
  disponible_creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_bancos_plantillas_disp_bancos FOREIGN KEY (banco_id)
    REFERENCES public.bancos (banco_id) ON DELETE CASCADE,
  CONSTRAINT fk_bancos_plantillas_disp_plantillas_base FOREIGN KEY (plantilla_base_id)
    REFERENCES public.plantillas_base (plantilla_base_id) ON DELETE CASCADE,
  CONSTRAINT uq_bancos_plantillas_base_disponibles_banco_plantilla
    UNIQUE (banco_id, plantilla_base_id)
);

CREATE INDEX IF NOT EXISTS idx_bancos_plantillas_disp_banco
  ON public.bancos_plantillas_base_disponibles (banco_id);

CREATE INDEX IF NOT EXISTS idx_bancos_plantillas_disp_plantilla_base
  ON public.bancos_plantillas_base_disponibles (plantilla_base_id);

COMMIT;
