BEGIN;

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS fk_usuarios_empresas;

DROP INDEX IF EXISTS public.idx_usuarios_emp_id;

ALTER TABLE public.usuarios
  DROP COLUMN IF EXISTS emp_id;

DROP TRIGGER IF EXISTS trg_empresas_bancos_set_updated_at ON public.empresas_bancos;
DROP TRIGGER IF EXISTS trg_empresas_set_updated_at ON public.empresas;

DROP FUNCTION IF EXISTS public.fn_set_eba_updated_at();
DROP FUNCTION IF EXISTS public.fn_set_emp_updated_at();

DROP TABLE IF EXISTS public.empresas_bancos CASCADE;
DROP TABLE IF EXISTS public.empresas CASCADE;

COMMIT;
