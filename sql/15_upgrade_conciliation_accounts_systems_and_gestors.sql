BEGIN;

ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS usr_created_by INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_usuarios_created_by'
  ) THEN
    ALTER TABLE public.usuarios
      ADD CONSTRAINT fk_usuarios_created_by
      FOREIGN KEY (usr_created_by) REFERENCES public.usuarios (usr_id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_usuarios_created_by
  ON public.usuarios (usr_created_by);

ALTER TABLE public.bancos
  ADD COLUMN IF NOT EXISTS ban_source_bank_id INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_bancos_source_bank'
  ) THEN
    ALTER TABLE public.bancos
      ADD CONSTRAINT fk_bancos_source_bank
      FOREIGN KEY (ban_source_bank_id) REFERENCES public.bancos (ban_id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_bancos_source_bank_id
  ON public.bancos (ban_source_bank_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bancos_usuario_source_bank
  ON public.bancos (usr_id, ban_source_bank_id)
  WHERE ban_source_bank_id IS NOT NULL;

ALTER TABLE public.empresas_cuentas_bancarias
  ADD COLUMN IF NOT EXISTS ecb_source_account_id INTEGER NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_ecb_source_account'
  ) THEN
    ALTER TABLE public.empresas_cuentas_bancarias
      ADD CONSTRAINT fk_ecb_source_account
      FOREIGN KEY (ecb_source_account_id)
      REFERENCES public.empresas_cuentas_bancarias (ecb_id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_ecb_source_account_id
  ON public.empresas_cuentas_bancarias (ecb_source_account_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ecb_bank_source_account
  ON public.empresas_cuentas_bancarias (ban_id, ecb_source_account_id)
  WHERE ecb_source_account_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.conciliation_systems (
  sys_id SERIAL PRIMARY KEY,
  sys_nombre VARCHAR(120) NOT NULL,
  sys_descripcion VARCHAR(255) NULL,
  sys_activo BOOLEAN NOT NULL DEFAULT TRUE,
  sys_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sys_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_conciliation_systems_nombre_not_blank CHECK (length(trim(sys_nombre)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conciliation_systems_name
  ON public.conciliation_systems ((LOWER(sys_nombre)));

INSERT INTO public.conciliation_systems (
  sys_nombre,
  sys_descripcion,
  sys_activo
)
SELECT DISTINCT source.label, 'Sistema creado automaticamente durante la actualizacion.', TRUE
FROM (
  SELECT NULLIF(trim(lyt_system_label), '') AS label
  FROM public.conciliacion_layouts
  UNION
  SELECT NULLIF(trim(tpl_system_label), '') AS label
  FROM public.template_layout
) source
WHERE source.label IS NOT NULL
ON CONFLICT ((LOWER(sys_nombre))) DO NOTHING;

INSERT INTO public.conciliation_systems (
  sys_nombre,
  sys_descripcion,
  sys_activo
)
VALUES (
  'SAP',
  'Sistema base creado por el upgrade incremental de conciliacion.',
  TRUE
)
ON CONFLICT ((LOWER(sys_nombre))) DO NOTHING;

ALTER TABLE public.template_layout
  ADD COLUMN IF NOT EXISTS sys_id INTEGER NULL;

DO $$
DECLARE
  fallback_system_id INTEGER;
BEGIN
  SELECT sys_id
  INTO fallback_system_id
  FROM public.conciliation_systems
  ORDER BY CASE WHEN LOWER(sys_nombre) = LOWER('SAP') THEN 0 ELSE 1 END, sys_id
  LIMIT 1;

  UPDATE public.template_layout tpl
  SET sys_id = systems.sys_id
  FROM public.conciliation_systems systems
  WHERE tpl.sys_id IS NULL
    AND LOWER(COALESCE(NULLIF(trim(tpl.tpl_system_label), ''), 'SAP')) = LOWER(systems.sys_nombre);

  UPDATE public.template_layout
  SET sys_id = fallback_system_id
  WHERE sys_id IS NULL
    AND fallback_system_id IS NOT NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_template_layout_systems'
  ) THEN
    ALTER TABLE public.template_layout
      ADD CONSTRAINT fk_template_layout_systems
      FOREIGN KEY (sys_id) REFERENCES public.conciliation_systems (sys_id) ON DELETE RESTRICT;
  END IF;
END;
$$;

ALTER TABLE public.template_layout
  ALTER COLUMN sys_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_template_layout_sys_id
  ON public.template_layout (sys_id);

ALTER TABLE public.conciliacion_layouts
  ADD COLUMN IF NOT EXISTS sys_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS lyt_source_layout_id INTEGER NULL;

DO $$
DECLARE
  fallback_system_id INTEGER;
BEGIN
  SELECT sys_id
  INTO fallback_system_id
  FROM public.conciliation_systems
  ORDER BY CASE WHEN LOWER(sys_nombre) = LOWER('SAP') THEN 0 ELSE 1 END, sys_id
  LIMIT 1;

  UPDATE public.conciliacion_layouts lyt
  SET sys_id = systems.sys_id
  FROM public.conciliation_systems systems
  WHERE lyt.sys_id IS NULL
    AND LOWER(COALESCE(NULLIF(trim(lyt.lyt_system_label), ''), 'SAP')) = LOWER(systems.sys_nombre);

  UPDATE public.conciliacion_layouts
  SET sys_id = fallback_system_id
  WHERE sys_id IS NULL
    AND fallback_system_id IS NOT NULL;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conciliacion_layouts_systems'
  ) THEN
    ALTER TABLE public.conciliacion_layouts
      ADD CONSTRAINT fk_conciliacion_layouts_systems
      FOREIGN KEY (sys_id) REFERENCES public.conciliation_systems (sys_id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conciliacion_layouts_source_layout'
  ) THEN
    ALTER TABLE public.conciliacion_layouts
      ADD CONSTRAINT fk_conciliacion_layouts_source_layout
      FOREIGN KEY (lyt_source_layout_id)
      REFERENCES public.conciliacion_layouts (lyt_id) ON DELETE SET NULL;
  END IF;
END;
$$;

ALTER TABLE public.conciliacion_layouts
  ALTER COLUMN sys_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conciliacion_layouts_sys_id
  ON public.conciliacion_layouts (sys_id);

CREATE INDEX IF NOT EXISTS idx_conciliacion_layouts_source_layout_id
  ON public.conciliacion_layouts (lyt_source_layout_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conciliacion_layouts_source_layout
  ON public.conciliacion_layouts (ban_id, lyt_source_layout_id)
  WHERE lyt_source_layout_id IS NOT NULL;

ALTER TABLE public.conciliaciones
  ADD COLUMN IF NOT EXISTS ecb_id INTEGER NULL,
  ADD COLUMN IF NOT EXISTS con_has_system_data BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS con_has_bank_data BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_conciliaciones_ecb'
  ) THEN
    ALTER TABLE public.conciliaciones
      ADD CONSTRAINT fk_conciliaciones_ecb
      FOREIGN KEY (ecb_id) REFERENCES public.empresas_cuentas_bancarias (ecb_id) ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_conciliaciones_ecb_id
  ON public.conciliaciones (ecb_id);

UPDATE public.conciliaciones
SET
  con_has_system_data = COALESCE(con_total_system_rows, 0) > 0,
  con_has_bank_data = COALESCE(con_total_bank_rows, 0) > 0;

WITH ranked_accounts AS (
  SELECT
    c.con_id,
    a.ecb_id,
    ROW_NUMBER() OVER (
      PARTITION BY c.con_id
      ORDER BY
        CASE WHEN COALESCE(a.ecb_activo, TRUE) THEN 0 ELSE 1 END,
        a.ecb_id
    ) AS rn
  FROM public.conciliaciones c
  INNER JOIN public.empresas_cuentas_bancarias a
    ON a.ban_id = c.ban_id
)
UPDATE public.conciliaciones c
SET ecb_id = ranked_accounts.ecb_id
FROM ranked_accounts
WHERE c.con_id = ranked_accounts.con_id
  AND ranked_accounts.rn = 1
  AND c.ecb_id IS NULL;

UPDATE public.conciliaciones c
SET con_summary_snapshot = jsonb_set(
  COALESCE(c.con_summary_snapshot, '{}'::jsonb),
  '{companyBankAccount}',
  jsonb_build_object(
    'id', a.ecb_id,
    'bankId', b.ban_id,
    'bankName', b.ban_nombre,
    'bankAlias', b.ban_alias,
    'name', a.ecb_nombre,
    'currency', a.ecb_moneda,
    'accountNumber', a.ecb_numero_cuenta,
    'active', a.ecb_activo
  ),
  TRUE
)
FROM public.empresas_cuentas_bancarias a
INNER JOIN public.bancos b
  ON b.ban_id = a.ban_id
WHERE c.ecb_id = a.ecb_id
  AND (
    c.con_summary_snapshot IS NULL
    OR c.con_summary_snapshot -> 'companyBankAccount' IS NULL
  );

COMMIT;

-- Revision sugerida para legados con varias cuentas por banco:
-- SELECT con_id, ban_id, ecb_id, con_nombre
-- FROM public.conciliaciones
-- WHERE ecb_id IS NULL
-- ORDER BY con_id;
