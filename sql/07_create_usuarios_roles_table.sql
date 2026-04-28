BEGIN;

-- Tabla legacy eliminada.
-- Qoncilia maneja un solo rol por usuario y la unica fuente de verdad es
-- public.usuarios.rol_id. Mantener usuarios_roles generaba inconsistencias,
-- por ejemplo un rol principal distinto al rol usado para login.

DROP TRIGGER IF EXISTS trg_sync_usuarios_roles_from_usuarios ON public.usuarios;
DROP TABLE IF EXISTS public.usuarios_roles CASCADE;
DROP FUNCTION IF EXISTS public.fn_sync_usuarios_roles_from_usuarios();
DROP FUNCTION IF EXISTS public.fn_set_ur_updated_at();

COMMIT;
