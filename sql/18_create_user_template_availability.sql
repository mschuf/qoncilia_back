-- Habilita plantillas base por usuario admin, no por banco.
-- Migra las habilitaciones antiguas por banco hacia el usuario dueno del banco.

BEGIN;

CREATE TABLE IF NOT EXISTS public.usuarios_plantillas_base_disponibles (
  usuario_plantilla_disponible_id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  plantilla_base_id INTEGER NOT NULL,
  disponible_creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_usuarios_plantillas_disp_usuarios FOREIGN KEY (usuario_id)
    REFERENCES public.usuarios (usr_id) ON DELETE CASCADE,
  CONSTRAINT fk_usuarios_plantillas_disp_plantillas_base FOREIGN KEY (plantilla_base_id)
    REFERENCES public.plantillas_base (plantilla_base_id) ON DELETE CASCADE,
  CONSTRAINT uq_usuarios_plantillas_base_disponibles_usuario_plantilla
    UNIQUE (usuario_id, plantilla_base_id)
);

CREATE INDEX IF NOT EXISTS idx_usuarios_plantillas_disp_usuario
  ON public.usuarios_plantillas_base_disponibles (usuario_id);

CREATE INDEX IF NOT EXISTS idx_usuarios_plantillas_disp_plantilla_base
  ON public.usuarios_plantillas_base_disponibles (plantilla_base_id);

DO $$
BEGIN
  IF to_regclass('public.bancos_plantillas_base_disponibles') IS NOT NULL THEN
    INSERT INTO public.usuarios_plantillas_base_disponibles (
      usuario_id,
      plantilla_base_id,
      disponible_creado_en
    )
    SELECT DISTINCT
      b.usuario_id,
      old_disp.plantilla_base_id,
      MIN(old_disp.disponible_creado_en)
    FROM public.bancos_plantillas_base_disponibles old_disp
    JOIN public.bancos b ON b.banco_id = old_disp.banco_id
    GROUP BY b.usuario_id, old_disp.plantilla_base_id
    ON CONFLICT (usuario_id, plantilla_base_id) DO NOTHING;
  END IF;
END;
$$;

COMMIT;
