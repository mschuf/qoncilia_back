CREATE OR REPLACE FUNCTION public.fn_set_usr_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.usr_updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_set_updated_at ON public.usuarios;

CREATE TRIGGER trg_usuarios_set_updated_at
BEFORE UPDATE ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION public.fn_set_usr_updated_at();

