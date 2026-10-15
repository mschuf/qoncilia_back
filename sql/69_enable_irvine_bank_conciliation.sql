-- =============================================================================
-- Habilita en IRVINE la conciliacion bancaria de produccion de Guarani
-- (5629621): Cargar Extractos + Conciliacion de banco.
--
-- EJECUTAR MANUALMENTE. El agente no corre este archivo.
--
-- Alcance EXCLUSIVO:
--   * empresa IRVINE
--   * rol admin (usuario cmiranda.irvine)
-- No modifica FG_TARJETA, 5629621, QA, OCHO_A ni a cmiranda de FG_TARJETA.
--
-- Que hace:
--   1) enciende modulos admin de IRVINE:
--        conciliation        -> /bank-statements     (Cargar Extractos)
--        bank_conciliation   -> /conciliacion-banco  (Conciliacion de banco)
--      Igual que Frigorifico Guarani productivo. NO usa conciliation_fg /
--      bank_conciliation_fg (esos son de QA).
--   2) copia SAP_B1 activa de 5629621 a IRVINE si IRVINE no la tiene.
--      Sin SAP_B1 la pantalla Conciliacion de banco no opera.
--   3) suma a cmiranda.irvine las plantillas base que ya tienen los admins
--      activos de 5629621 (INSERT only). No copia bancos ni cuentas de Guarani.
--
-- No toca SAP_TARJETAS de IRVINE ni Pago de Tarjeta.
-- Idempotente: reejecutar no duplica ERP ni apaga otros modulos.
-- Si una corrida previa quedo abortada: ROLLBACK; y reintentar.
-- Tras ejecutar, Miranda debe volver a iniciar sesion para refrescar JWT.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  expected_database CONSTANT TEXT := 'QONCILIA_BACK';
BEGIN
  IF current_database() <> expected_database THEN
    RAISE EXCEPTION 'Base incorrecta. Esperada %, actual %.', expected_database, current_database();
  END IF;
END;
$$;

CREATE TEMP TABLE irvine_bank_conc_meta (
  source_tax_id     VARCHAR(50) PRIMARY KEY,
  target_tax_id     VARCHAR(50) NOT NULL UNIQUE,
  target_user_login VARCHAR(80) NOT NULL
) ON COMMIT DROP;

INSERT INTO irvine_bank_conc_meta (source_tax_id, target_tax_id, target_user_login)
VALUES ('5629621', 'IRVINE', 'cmiranda.irvine');

CREATE TEMP TABLE irvine_bank_conc_snapshot ON COMMIT DROP AS
SELECT
  (
    SELECT COUNT(*)
    FROM public.empresas_roles_modulos erm
    JOIN public.empresas e ON e.emp_id = erm.emp_id
    JOIN public.modulos m ON m.mod_id = erm.mod_id
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) <> 'irvine'
      AND LOWER(BTRIM(m.mod_codigo)) IN ('conciliation', 'bank_conciliation')
      AND erm.erm_habilitado = TRUE
  ) AS other_enabled_conciliation_modules,
  (
    SELECT e.emp_updated_at
    FROM public.empresas e
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) = '5629621'
  ) AS source_company_updated_at,
  (
    SELECT u.usr_updated_at
    FROM public.usuarios u
    WHERE LOWER(BTRIM(u.usr_login)) = 'cmiranda'
  ) AS fg_cmiranda_updated_at,
  (
    SELECT COUNT(*)
    FROM public.empresas_erp_configuraciones c
    JOIN public.empresas e ON e.emp_id = c.emp_id
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) = '5629621'
  ) AS source_erp_count,
  (
    SELECT COUNT(*)
    FROM public.empresas_erp_configuraciones c
    JOIN public.empresas e ON e.emp_id = c.emp_id
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) = 'irvine'
  ) AS target_erp_count,
  (
    SELECT COUNT(*)
    FROM public.empresas_erp_configuraciones c
    JOIN public.empresas e ON e.emp_id = c.emp_id
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) = 'irvine'
      AND LOWER(BTRIM(c.epc_codigo)) = 'sap_b1'
  ) AS target_sap_b1_count,
  (
    SELECT COUNT(*)
    FROM public.bancos b
    JOIN public.empresas e ON e.emp_id = b.empresa_id
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) = '5629621'
  ) AS source_bank_count;

DO $$
DECLARE
  missing_modules TEXT;
  target_user RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(BTRIM(emp_id_fiscal)) = '5629621'
      AND emp_activa = TRUE
  ) THEN
    RAISE EXCEPTION 'No existe o no esta activa la empresa origen 5629621 (Guarani).';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(BTRIM(emp_id_fiscal)) = 'irvine'
      AND emp_activa = TRUE
  ) THEN
    RAISE EXCEPTION 'No existe o no esta activa la empresa IRVINE. Ejecuta antes 68_clone_fg_tarjeta_to_irvine.sql.';
  END IF;

  SELECT u.usr_id, u.emp_id, r.rol_codigo, u.usr_activo
  INTO target_user
  FROM public.usuarios u
  JOIN public.empresas e ON e.emp_id = u.emp_id
  JOIN public.roles r ON r.rol_id = u.rol_id
  JOIN irvine_bank_conc_meta meta
    ON LOWER(BTRIM(u.usr_login)) = LOWER(BTRIM(meta.target_user_login))
  WHERE LOWER(BTRIM(e.emp_id_fiscal)) = 'irvine';

  IF target_user.usr_id IS NULL THEN
    RAISE EXCEPTION 'No existe cmiranda.irvine en IRVINE.';
  END IF;

  IF target_user.usr_activo IS NOT TRUE THEN
    RAISE EXCEPTION 'cmiranda.irvine esta inactivo.';
  END IF;

  IF LOWER(BTRIM(target_user.rol_codigo)) <> 'admin' THEN
    RAISE EXCEPTION 'cmiranda.irvine no es admin (rol=%). Abortado.', target_user.rol_codigo;
  END IF;

  SELECT STRING_AGG(required.mod_codigo, ', ' ORDER BY required.mod_codigo)
  INTO missing_modules
  FROM (
    VALUES
      ('conciliation'::VARCHAR),
      ('bank_conciliation'::VARCHAR)
  ) AS required(mod_codigo)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.modulos m
    WHERE LOWER(BTRIM(m.mod_codigo)) = required.mod_codigo
      AND m.mod_activo = TRUE
  );

  IF missing_modules IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan modulos activos: %.', missing_modules;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas e
    JOIN public.roles r
      ON LOWER(BTRIM(r.rol_codigo)) = 'admin'
     AND r.rol_activo = TRUE
    JOIN public.empresas_roles_modulos erm
      ON erm.emp_id = e.emp_id
     AND erm.rol_id = r.rol_id
     AND erm.erm_habilitado = TRUE
    JOIN public.modulos m ON m.mod_id = erm.mod_id
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) = '5629621'
      AND LOWER(BTRIM(m.mod_codigo)) = 'conciliation'
  ) THEN
    RAISE EXCEPTION '5629621 no tiene conciliation habilitado para admin. No se copia un estado incompleto.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas e
    JOIN public.roles r
      ON LOWER(BTRIM(r.rol_codigo)) = 'admin'
     AND r.rol_activo = TRUE
    JOIN public.empresas_roles_modulos erm
      ON erm.emp_id = e.emp_id
     AND erm.rol_id = r.rol_id
     AND erm.erm_habilitado = TRUE
    JOIN public.modulos m ON m.mod_id = erm.mod_id
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) = '5629621'
      AND LOWER(BTRIM(m.mod_codigo)) = 'bank_conciliation'
  ) THEN
    RAISE EXCEPTION '5629621 no tiene bank_conciliation habilitado para admin. No se copia un estado incompleto.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas e
    JOIN public.empresas_erp_configuraciones c ON c.emp_id = e.emp_id
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) = '5629621'
      AND LOWER(BTRIM(c.epc_codigo)) = 'sap_b1'
      AND c.epc_activo = TRUE
      AND NULLIF(TRIM(c.epc_db_name), '') IS NOT NULL
      AND NULLIF(TRIM(c.query_banco), '') IS NOT NULL
      AND NULLIF(TRIM(c.query_sistema), '') IS NOT NULL
  ) THEN
    RAISE EXCEPTION '5629621 no tiene SAP_B1 activa operativa. No se genera una copia incompleta.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'empresas_erp_configuraciones'
      AND column_name = 'query_tarjeta'
  ) THEN
    RAISE EXCEPTION 'Falta empresas_erp_configuraciones.query_tarjeta.';
  END IF;
END;
$$;

-- Enciende solo los dos modulos de Guarani prod para admin de IRVINE.
INSERT INTO public.empresas_roles_modulos (
  emp_id,
  rol_id,
  mod_id,
  erm_habilitado
)
SELECT
  target_company.emp_id,
  admin_role.rol_id,
  module.mod_id,
  TRUE
FROM irvine_bank_conc_meta meta
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(meta.target_tax_id))
JOIN public.roles admin_role
  ON LOWER(BTRIM(admin_role.rol_codigo)) = 'admin'
 AND admin_role.rol_activo = TRUE
JOIN public.modulos module
  ON LOWER(BTRIM(module.mod_codigo)) IN ('conciliation', 'bank_conciliation')
 AND module.mod_activo = TRUE
ON CONFLICT (emp_id, rol_id, mod_id) DO UPDATE
SET
  erm_habilitado = TRUE,
  erm_updated_at = NOW()
WHERE empresas_roles_modulos.erm_habilitado IS NOT TRUE;

-- Copia SAP_B1 de Guarani solo si IRVINE no la tiene. No pisa SAP_TARJETAS.
INSERT INTO public.empresas_erp_configuraciones (
  ept_id,
  emp_id,
  epc_codigo,
  epc_nombre,
  epc_activo,
  epc_es_predeterminado,
  epc_user_system,
  epc_user_pass,
  epc_db_name,
  epc_server_node,
  query_banco,
  query_sistema,
  query_tarjeta,
  epc_db_user,
  epc_db_password_enc,
  epc_service_layer_url,
  epc_tls_version,
  epc_allow_self_signed,
  epc_settings
)
SELECT
  source_config.ept_id,
  target_company.emp_id,
  source_config.epc_codigo,
  source_config.epc_nombre,
  source_config.epc_activo,
  source_config.epc_es_predeterminado,
  source_config.epc_user_system,
  source_config.epc_user_pass,
  source_config.epc_db_name,
  source_config.epc_server_node,
  source_config.query_banco,
  source_config.query_sistema,
  source_config.query_tarjeta,
  source_config.epc_db_user,
  source_config.epc_db_password_enc,
  source_config.epc_service_layer_url,
  source_config.epc_tls_version,
  source_config.epc_allow_self_signed,
  source_config.epc_settings
FROM irvine_bank_conc_meta meta
JOIN public.empresas source_company
  ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(meta.source_tax_id))
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(meta.target_tax_id))
JOIN public.empresas_erp_configuraciones source_config
  ON source_config.emp_id = source_company.emp_id
 AND LOWER(BTRIM(source_config.epc_codigo)) = 'sap_b1'
 AND source_config.epc_activo = TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.empresas_erp_configuraciones existing
  WHERE existing.emp_id = target_company.emp_id
    AND LOWER(BTRIM(existing.epc_codigo)) = 'sap_b1'
);

-- Plantillas base de admins de Guarani -> Miranda IRVINE. No toca otros usuarios.
INSERT INTO public.usuarios_plantillas_base_disponibles (
  usuario_id,
  plantilla_base_id
)
SELECT DISTINCT
  target_user.usr_id,
  availability.plantilla_base_id
FROM irvine_bank_conc_meta meta
JOIN public.empresas source_company
  ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(meta.source_tax_id))
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(meta.target_tax_id))
JOIN public.usuarios target_user
  ON target_user.emp_id = target_company.emp_id
 AND LOWER(BTRIM(target_user.usr_login)) = LOWER(BTRIM(meta.target_user_login))
JOIN public.roles admin_role
  ON LOWER(BTRIM(admin_role.rol_codigo)) = 'admin'
 AND admin_role.rol_activo = TRUE
JOIN public.usuarios source_admin
  ON source_admin.emp_id = source_company.emp_id
 AND source_admin.rol_id = admin_role.rol_id
 AND source_admin.usr_activo = TRUE
JOIN public.usuarios_plantillas_base_disponibles availability
  ON availability.usuario_id = source_admin.usr_id
ON CONFLICT (usuario_id, plantilla_base_id) DO NOTHING;

DO $$
DECLARE
  snap irvine_bank_conc_snapshot%ROWTYPE;
  target_company_id INTEGER;
  enabled_conciliation BOOLEAN;
  enabled_bank BOOLEAN;
  sap_b1_count INTEGER;
  card_payment_still_on BOOLEAN;
BEGIN
  SELECT * INTO STRICT snap FROM irvine_bank_conc_snapshot LIMIT 1;

  SELECT emp_id
  INTO STRICT target_company_id
  FROM public.empresas
  WHERE LOWER(BTRIM(emp_id_fiscal)) = 'irvine';

  SELECT
    BOOL_OR(LOWER(BTRIM(m.mod_codigo)) = 'conciliation' AND erm.erm_habilitado),
    BOOL_OR(LOWER(BTRIM(m.mod_codigo)) = 'bank_conciliation' AND erm.erm_habilitado),
    BOOL_OR(LOWER(BTRIM(m.mod_codigo)) = 'card_payment' AND erm.erm_habilitado)
  INTO enabled_conciliation, enabled_bank, card_payment_still_on
  FROM public.empresas_roles_modulos erm
  JOIN public.roles r ON r.rol_id = erm.rol_id
  JOIN public.modulos m ON m.mod_id = erm.mod_id
  WHERE erm.emp_id = target_company_id
    AND LOWER(BTRIM(r.rol_codigo)) = 'admin';

  IF enabled_conciliation IS NOT TRUE OR enabled_bank IS NOT TRUE THEN
    RAISE EXCEPTION 'IRVINE admin no quedo con conciliation y bank_conciliation encendidos.';
  END IF;

  IF card_payment_still_on IS NOT TRUE THEN
    RAISE EXCEPTION 'Se apago card_payment de IRVINE. Abortado.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.empresas_roles_modulos erm
    JOIN public.empresas e ON e.emp_id = erm.emp_id
    JOIN public.modulos m ON m.mod_id = erm.mod_id
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) <> 'irvine'
      AND LOWER(BTRIM(m.mod_codigo)) IN ('conciliation', 'bank_conciliation')
      AND erm.erm_habilitado = TRUE
  ) <> snap.other_enabled_conciliation_modules THEN
    RAISE EXCEPTION 'Se modificaron modulos de conciliacion de otras empresas. Abortado.';
  END IF;

  IF (
    SELECT e.emp_updated_at
    FROM public.empresas e
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) = '5629621'
  ) IS DISTINCT FROM snap.source_company_updated_at THEN
    RAISE EXCEPTION 'Se toco la empresa 5629621. Abortado.';
  END IF;

  IF (
    SELECT u.usr_updated_at
    FROM public.usuarios u
    WHERE LOWER(BTRIM(u.usr_login)) = 'cmiranda'
  ) IS DISTINCT FROM snap.fg_cmiranda_updated_at THEN
    RAISE EXCEPTION 'Se toco cmiranda de FG_TARJETA. Abortado.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.bancos b
    JOIN public.empresas e ON e.emp_id = b.empresa_id
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) = '5629621'
  ) <> snap.source_bank_count THEN
    RAISE EXCEPTION 'Se modificaron bancos de Guarani. Abortado.';
  END IF;

  SELECT COUNT(*)
  INTO sap_b1_count
  FROM public.empresas_erp_configuraciones c
  WHERE c.emp_id = target_company_id
    AND LOWER(BTRIM(c.epc_codigo)) = 'sap_b1'
    AND c.epc_activo = TRUE;

  IF sap_b1_count <> 1 THEN
    RAISE EXCEPTION 'IRVINE debe tener exactamente una SAP_B1 activa. Encontradas: %.', sap_b1_count;
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.empresas_erp_configuraciones c
    JOIN public.empresas e ON e.emp_id = c.emp_id
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) = '5629621'
  ) <> snap.source_erp_count THEN
    RAISE EXCEPTION 'Se modificaron ERP de Guarani. Abortado.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.empresas_roles_modulos erm
    JOIN public.empresas e ON e.emp_id = erm.emp_id
    JOIN public.modulos m ON m.mod_id = erm.mod_id
    WHERE LOWER(BTRIM(e.emp_id_fiscal)) = 'irvine'
      AND LOWER(BTRIM(m.mod_codigo)) IN ('conciliation_fg', 'bank_conciliation_fg')
      AND erm.erm_habilitado = TRUE
  ) THEN
    RAISE EXCEPTION 'No se deben encender modulos FG de QA en IRVINE.';
  END IF;
END;
$$;

SELECT
  e.emp_id_fiscal AS empresa,
  u.usr_login,
  r.rol_codigo,
  m.mod_codigo,
  m.mod_nombre,
  m.mod_ruta,
  erm.erm_habilitado
FROM public.empresas e
JOIN public.usuarios u ON u.emp_id = e.emp_id
JOIN public.roles r ON r.rol_id = u.rol_id
JOIN public.empresas_roles_modulos erm
  ON erm.emp_id = e.emp_id
 AND erm.rol_id = r.rol_id
JOIN public.modulos m ON m.mod_id = erm.mod_id
WHERE LOWER(BTRIM(e.emp_id_fiscal)) = 'irvine'
  AND LOWER(BTRIM(u.usr_login)) = 'cmiranda.irvine'
  AND LOWER(BTRIM(m.mod_codigo)) IN (
    'conciliation',
    'bank_conciliation',
    'card_payment',
    'conciliation_fg',
    'bank_conciliation_fg'
  )
ORDER BY m.mod_codigo;

SELECT
  e.emp_id_fiscal,
  c.epc_codigo,
  c.epc_nombre,
  c.epc_activo,
  c.epc_db_name,
  (NULLIF(TRIM(c.query_banco), '') IS NOT NULL) AS tiene_query_banco,
  (NULLIF(TRIM(c.query_sistema), '') IS NOT NULL) AS tiene_query_sistema
FROM public.empresas e
JOIN public.empresas_erp_configuraciones c ON c.emp_id = e.emp_id
WHERE LOWER(BTRIM(e.emp_id_fiscal)) = 'irvine'
ORDER BY c.epc_codigo;

COMMIT;
