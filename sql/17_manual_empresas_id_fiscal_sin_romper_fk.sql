-- Alternativa segura para bases con datos ya cargados.
-- Objetivo: habilitar emp_id_fiscal sin borrar/recrear public.empresas
-- ni tocar el PK emp_id, evitando conflictos con FK existentes.
--
-- Importante:
-- 1) NO elimines public.usuarios.emp_id. El backend actual lo usa y la FK es parte del modelo.
-- 2) El error "operator does not exist: integer = character varying" aparece cuando se compara
--    u.emp_id (INTEGER) contra e.emp_codigo / e.emp_id_fiscal (VARCHAR).
--    El join correcto siempre es: u.emp_id = e.emp_id
--
-- Tablas que referencian public.empresas(emp_id):
-- - public.usuarios                        (fk_usuarios_empresas)
-- - public.empresas_roles_modulos         (fk_erm_empresas)
-- - public.empresas_cuentas_bancarias     (fk_ecb_empresas)
-- - public.empresas_erp_configuraciones   (fk_empresas_erp_configuraciones_empresas)
--
-- Este script:
-- - hace backup defensivo
-- - agrega emp_id_fiscal si aun no existe
-- - copia datos desde emp_codigo si hace falta
-- - crea constraint e indice nuevos
-- - deja emp_codigo intacto para no forzar limpieza inmediata

BEGIN;

LOCK TABLE public.empresas IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.usuarios IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.empresas_roles_modulos IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.empresas_cuentas_bancarias IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.empresas_erp_configuraciones IN ACCESS EXCLUSIVE MODE;

-- Backups defensivos
CREATE TABLE IF NOT EXISTS public.bak_20260424_empresas AS
SELECT * FROM public.empresas;

CREATE TABLE IF NOT EXISTS public.bak_20260424_usuarios AS
SELECT * FROM public.usuarios;

CREATE TABLE IF NOT EXISTS public.bak_20260424_empresas_roles_modulos AS
SELECT * FROM public.empresas_roles_modulos;

CREATE TABLE IF NOT EXISTS public.bak_20260424_empresas_cuentas_bancarias AS
SELECT * FROM public.empresas_cuentas_bancarias;

CREATE TABLE IF NOT EXISTS public.bak_20260424_empresas_erp_configuraciones AS
SELECT * FROM public.empresas_erp_configuraciones;

-- 1) Crear la nueva columna si aun no existe
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS emp_id_fiscal VARCHAR(50);

-- 2) Copiar datos desde emp_codigo si la nueva columna esta vacia
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'empresas'
      AND column_name = 'emp_codigo'
  ) THEN
    EXECUTE $sql$
      UPDATE public.empresas
      SET emp_id_fiscal = emp_codigo
      WHERE emp_id_fiscal IS NULL
         OR BTRIM(emp_id_fiscal) = ''
    $sql$;
  END IF;
END;
$$;

-- 3) Validaciones previas a constraints
DO $$
DECLARE
  missing_count INTEGER;
  duplicate_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO missing_count
  FROM public.empresas
  WHERE emp_id_fiscal IS NULL
     OR BTRIM(emp_id_fiscal) = '';

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'Existen % empresa(s) sin emp_id_fiscal. Completa esos valores antes de continuar.',
      missing_count;
  END IF;

  SELECT COUNT(*)
  INTO duplicate_count
  FROM (
    SELECT LOWER(BTRIM(emp_id_fiscal)) AS normalized_value
    FROM public.empresas
    GROUP BY LOWER(BTRIM(emp_id_fiscal))
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'Existen emp_id_fiscal duplicados (ignorando mayusculas/minusculas). Corrige esos datos antes de continuar.';
  END IF;
END;
$$;

-- 4) Dejar la nueva columna obligatoria
ALTER TABLE public.empresas
  ALTER COLUMN emp_id_fiscal SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_empresas_id_fiscal_not_blank'
  ) THEN
    ALTER TABLE public.empresas
      ADD CONSTRAINT chk_empresas_id_fiscal_not_blank
      CHECK (length(trim(emp_id_fiscal)) > 0);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_empresas_id_fiscal'
  ) THEN
    ALTER TABLE public.empresas
      ADD CONSTRAINT uq_empresas_id_fiscal UNIQUE (emp_id_fiscal);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_empresas_id_fiscal_lower
  ON public.empresas ((LOWER(emp_id_fiscal)));

COMMIT;

-- ==========================================================
-- Consultas utiles de verificacion
-- ==========================================================

-- Ver datos migrados
-- SELECT emp_id, emp_codigo, emp_id_fiscal, emp_nombre
-- FROM public.empresas
-- ORDER BY emp_id;

-- Ver usuarios con su empresa correctamente relacionada
-- SELECT
--   u.usr_id,
--   u.usr_login,
--   u.emp_id,
--   e.emp_id_fiscal,
--   e.emp_nombre
-- FROM public.usuarios u
-- INNER JOIN public.empresas e
--   ON e.emp_id = u.emp_id
-- ORDER BY u.usr_id;

-- Si necesitas filtrar usuarios por ID fiscal, hazlo asi:
-- SELECT u.*
-- FROM public.usuarios u
-- INNER JOIN public.empresas e
--   ON e.emp_id = u.emp_id
-- WHERE e.emp_id_fiscal = '80012345-6';

-- ==========================================================
-- Limpieza opcional posterior
-- ==========================================================
-- Ejecutar solo cuando ya confirmes que todo el sistema usa emp_id_fiscal.

-- ALTER TABLE public.empresas
--   DROP CONSTRAINT IF EXISTS uq_empresas_codigo;

-- ALTER TABLE public.empresas
--   DROP CONSTRAINT IF EXISTS chk_empresas_codigo_not_blank;

-- DROP INDEX IF EXISTS public.uq_empresas_codigo_lower;

-- ALTER TABLE public.empresas
--   DROP COLUMN IF EXISTS emp_codigo;
