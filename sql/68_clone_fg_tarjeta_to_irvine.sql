-- =============================================================================
-- Alta AISLADA de la empresa IRVINE a partir de FG_TARJETA.
--
-- EJECUTAR MANUALMENTE. El agente no corre este archivo.
--
-- PASO 0 OBLIGATORIO (antes de este SQL), en PowerShell:
--   .\QonciliaBack\sql\68_backup_qoncilia_back_before_irvine.ps1
-- Si el dump falla, detenerse. No ejecutar este archivo sin backup.
--
-- Que copia desde FG_TARJETA:
--   * perfil de empresa (logo, direccion, ERP legacy, region/pais);
--   * matriz de modulos del rol admin (habilitados y deshabilitados);
--   * TODAS las configuraciones ERP, con credenciales cifradas, queries y
--     settings (incluye query_tarjeta si existe);
--   * cuenta de comision de tarjetas de la ERP SAP_TARJETAS, si existe.
--
-- Que NO copia:
--   * usuarios de FG_TARJETA (Cintia Miranda / cmiranda se queda en FG_TARJETA);
--   * bancos/cuentas/extractos de FG_TARJETA (GNB Limpio / Punto Carne / etc.);
--   * sesiones ERP, extractos, filas de extractos.
-- FG_TARJETA no tiene plantillas_conciliacion; IRVINE recibe la plantilla base
-- global "Base Itau vs SAP B1" sobre Banco Itau.
--
-- Usuario nuevo (login/email/legajo unicos; cmiranda ya existe en FG_TARJETA):
--   login/legajo: cmiranda.irvine
--   email:        cintia.miranda.irvine@fguarani.com.py
--   password:     mismo hash que cmiranda de FG_TARJETA (si existe);
--                 si no existe cmiranda, hash de 123456.
--   rol:          admin
-- Cedula 5339624 no se persiste: public.usuarios no tiene ese campo.
-- Puesto "Cuentas Corrientes" tampoco se persiste.
--
-- Bancos IRVINE (dueno: cmiranda.irvine):
--   Banco Itau, Bancard, INFONET, Dinelco, CABAL, PANAL
-- Cuentas contables:
--   1.01.01.005.001  Procesadora Infonet - TD
--   1.01.01.005.002  Procesadora Bancard - TC
--   1.01.01.004.011  Banco Itau S.A GS 400010198
-- Dinelco / CABAL / PANAL quedan como bancos sin cuenta (no hay nro. mayor).
--
-- Seguridad: atomico, de una sola vez. Aborta si IRVINE ya existe. No hace
-- UPDATE/DELETE sobre FG_TARJETA ni sobre ninguna otra empresa. Si algo falla,
-- ROLLBACK de toda la transaccion. Si una corrida previa quedo abortada, ejecutar
-- ROLLBACK; una vez en esa sesion antes de volver a correr este archivo.
--
-- ERP clonada apunta al MISMO SAP FG_PROD que FG_TARJETA.
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

CREATE TEMP TABLE irvine_clone_meta (
  source_tax_id            VARCHAR(50) PRIMARY KEY,
  target_tax_id            VARCHAR(50) NOT NULL UNIQUE,
  target_name              VARCHAR(160) NOT NULL,
  admin_login              VARCHAR(80) NOT NULL UNIQUE,
  admin_legajo             VARCHAR(50) NOT NULL UNIQUE,
  admin_email              VARCHAR(160) NOT NULL UNIQUE,
  admin_name               VARCHAR(120) NOT NULL,
  admin_last_name          VARCHAR(120) NOT NULL,
  source_user_login        VARCHAR(80) NOT NULL,
  initial_password_fallback TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO irvine_clone_meta (
  source_tax_id,
  target_tax_id,
  target_name,
  admin_login,
  admin_legajo,
  admin_email,
  admin_name,
  admin_last_name,
  source_user_login,
  initial_password_fallback
) VALUES (
  'FG_TARJETA',
  'IRVINE',
  'IRVINE',
  'cmiranda.irvine',
  'cmiranda.irvine',
  'cintia.miranda.irvine@fguarani.com.py',
  'Cintia Carolina',
  'Miranda',
  'cmiranda',
  '123456'
);

CREATE TEMP TABLE irvine_bank_seed (
  sort_order         INTEGER PRIMARY KEY,
  banco_nombre       VARCHAR(160) NOT NULL UNIQUE,
  banco_descripcion  VARCHAR(255) NOT NULL,
  banco_sucursal     VARCHAR(120) NOT NULL,
  attach_itau_layout BOOLEAN NOT NULL DEFAULT FALSE
) ON COMMIT DROP;

INSERT INTO irvine_bank_seed (
  sort_order,
  banco_nombre,
  banco_descripcion,
  banco_sucursal,
  attach_itau_layout
) VALUES
  (1, 'Banco Itau', 'ITAU',    'Matriz', TRUE),
  (2, 'Bancard',    'BANCARD', 'Matriz', FALSE),
  (3, 'INFONET',    'INFONET', 'Matriz', FALSE),
  (4, 'Dinelco',    'DINELCO', 'Matriz', FALSE),
  (5, 'CABAL',      'CABAL',   'Matriz', FALSE),
  (6, 'PANAL',      'PANAL',   'Matriz', FALSE);

CREATE TEMP TABLE irvine_account_seed (
  banco_nombre                 VARCHAR(160) NOT NULL,
  cuenta_bancaria_nombre       VARCHAR(160) NOT NULL,
  moneda_codigo                VARCHAR(10) NOT NULL,
  cuenta_bancaria_numero       VARCHAR(80) NOT NULL,
  cuenta_bancaria_numero_mayor VARCHAR(80) NOT NULL,
  cuenta_bancaria_numero_pago  VARCHAR(80) NULL,
  cuenta_bancaria_sucursal     VARCHAR(120) NOT NULL,
  cuenta_bancaria_tipo         VARCHAR(40) NOT NULL
) ON COMMIT DROP;

INSERT INTO irvine_account_seed (
  banco_nombre,
  cuenta_bancaria_nombre,
  moneda_codigo,
  cuenta_bancaria_numero,
  cuenta_bancaria_numero_mayor,
  cuenta_bancaria_numero_pago,
  cuenta_bancaria_sucursal,
  cuenta_bancaria_tipo
) VALUES
  (
    'INFONET',
    'INFONET | 1.01.01.005.001 Procesadora Infonet - TD | PYG',
    'PYG',
    '1.01.01.005.001 Procesadora Infonet - TD',
    '1.01.01.005.001',
    NULL,
    'IRVINE',
    'DEBITO'
  ),
  (
    'Bancard',
    'Bancard | 1.01.01.005.002 Procesadora Bancard - TC | PYG',
    'PYG',
    '1.01.01.005.002 Procesadora Bancard - TC',
    '1.01.01.005.002',
    NULL,
    'IRVINE',
    'DEBITO'
  ),
  (
    'Banco Itau',
    'Banco Itau | 1.01.01.004.011 Banco Itau S.A GS 400010198 | PYG',
    'PYG',
    '1.01.01.004.011 Banco Itau S.A GS 400010198',
    '1.01.01.004.011',
    '400010198',
    'IRVINE',
    'DEBITO'
  );

-- Huella de aislamiento: si al final cambia algo que no sea IRVINE, abortar.
CREATE TEMP TABLE irvine_isolation_snapshot ON COMMIT DROP AS
SELECT
  (SELECT COUNT(*) FROM public.empresas) AS empresas,
  (SELECT COUNT(*) FROM public.usuarios) AS usuarios,
  (SELECT COUNT(*) FROM public.empresas_roles_modulos) AS empresas_roles_modulos,
  (SELECT COUNT(*) FROM public.empresas_erp_configuraciones) AS erp_configs,
  (SELECT COUNT(*) FROM public.bancos) AS bancos,
  (SELECT COUNT(*) FROM public.cuentas_bancarias) AS cuentas,
  (SELECT COUNT(*) FROM public.plantillas_conciliacion) AS plantillas,
  (SELECT COUNT(*) FROM public.plantillas_conciliacion_mapeos) AS mapeos,
  (SELECT COUNT(*) FROM public.usuarios_plantillas_base_disponibles) AS plantillas_disp,
  (SELECT COUNT(*) FROM public.bancos_plantillas_base_disponibles) AS bancos_plantillas_disp,
  (
    SELECT COUNT(*)
    FROM public.empresas_erp_tarjetas_comisiones
  ) AS comisiones,
  (
    SELECT u.usr_id
    FROM public.usuarios u
    JOIN irvine_clone_meta m ON LOWER(BTRIM(u.usr_login)) = LOWER(BTRIM(m.source_user_login))
    LIMIT 1
  ) AS source_user_id,
  (
    SELECT u.emp_id
    FROM public.usuarios u
    JOIN irvine_clone_meta m ON LOWER(BTRIM(u.usr_login)) = LOWER(BTRIM(m.source_user_login))
    LIMIT 1
  ) AS source_user_emp_id,
  (
    SELECT u.usr_email
    FROM public.usuarios u
    JOIN irvine_clone_meta m ON LOWER(BTRIM(u.usr_login)) = LOWER(BTRIM(m.source_user_login))
    LIMIT 1
  ) AS source_user_email,
  (
    SELECT u.usr_updated_at
    FROM public.usuarios u
    JOIN irvine_clone_meta m ON LOWER(BTRIM(u.usr_login)) = LOWER(BTRIM(m.source_user_login))
    LIMIT 1
  ) AS source_user_updated_at,
  (
    SELECT e.emp_updated_at
    FROM public.empresas e
    JOIN irvine_clone_meta m
      ON LOWER(BTRIM(e.emp_id_fiscal)) = LOWER(BTRIM(m.source_tax_id))
  ) AS source_company_updated_at,
  (
    SELECT COUNT(*)
    FROM public.empresas_erp_configuraciones c
    JOIN public.empresas e ON e.emp_id = c.emp_id
    JOIN irvine_clone_meta m
      ON LOWER(BTRIM(e.emp_id_fiscal)) = LOWER(BTRIM(m.source_tax_id))
  ) AS source_erp_count,
  (
    SELECT COUNT(*)
    FROM public.empresas_roles_modulos erm
    JOIN public.empresas e ON e.emp_id = erm.emp_id
    JOIN irvine_clone_meta m
      ON LOWER(BTRIM(e.emp_id_fiscal)) = LOWER(BTRIM(m.source_tax_id))
  ) AS source_erm_count,
  (
    SELECT COUNT(*)
    FROM public.empresas_erp_tarjetas_comisiones com
    JOIN public.empresas_erp_configuraciones c ON c.epc_id = com.epc_id
    JOIN public.empresas e ON e.emp_id = c.emp_id
    JOIN irvine_clone_meta m
      ON LOWER(BTRIM(e.emp_id_fiscal)) = LOWER(BTRIM(m.source_tax_id))
  ) AS source_commission_count,
  (
    SELECT COUNT(*)
    FROM public.usuarios_plantillas_base_disponibles d
    JOIN public.usuarios u ON u.usr_id = d.usuario_id
    JOIN public.empresas e ON e.emp_id = u.emp_id
    JOIN public.roles r ON r.rol_id = u.rol_id
    JOIN irvine_clone_meta m
      ON LOWER(BTRIM(e.emp_id_fiscal)) = LOWER(BTRIM(m.source_tax_id))
    WHERE LOWER(BTRIM(r.rol_codigo)) = 'admin'
      AND r.rol_activo = TRUE
      AND u.usr_activo = TRUE
  ) AS source_template_availability_count,
  (
    SELECT COUNT(*)
    FROM public.bancos b
    JOIN public.empresas e ON e.emp_id = b.empresa_id
    JOIN irvine_clone_meta m
      ON LOWER(BTRIM(e.emp_id_fiscal)) = LOWER(BTRIM(m.source_tax_id))
  ) AS source_bank_count,
  (
    SELECT COUNT(*)
    FROM public.cuentas_bancarias a
    JOIN public.empresas e ON e.emp_id = a.empresa_id
    JOIN irvine_clone_meta m
      ON LOWER(BTRIM(e.emp_id_fiscal)) = LOWER(BTRIM(m.source_tax_id))
  ) AS source_account_count,
  (
    SELECT COUNT(*)
    FROM public.bancos b
    JOIN public.empresas e ON e.emp_id = b.empresa_id
    JOIN irvine_clone_meta m
      ON LOWER(BTRIM(e.emp_id_fiscal)) <> LOWER(BTRIM(m.source_tax_id))
  ) AS other_bank_count;

DO $$
DECLARE
  missing_tables TEXT;
  conflicting_identity TEXT;
  source_user_company TEXT;
BEGIN
  SELECT STRING_AGG(required.table_name, ', ' ORDER BY required.table_name)
  INTO missing_tables
  FROM (
    VALUES
      ('empresas', to_regclass('public.empresas') IS NULL),
      ('usuarios', to_regclass('public.usuarios') IS NULL),
      ('roles', to_regclass('public.roles') IS NULL),
      ('empresas_roles_modulos', to_regclass('public.empresas_roles_modulos') IS NULL),
      ('empresas_erp_configuraciones', to_regclass('public.empresas_erp_configuraciones') IS NULL),
      ('bancos', to_regclass('public.bancos') IS NULL),
      ('cuentas_bancarias', to_regclass('public.cuentas_bancarias') IS NULL),
      ('plantillas_conciliacion', to_regclass('public.plantillas_conciliacion') IS NULL),
      ('plantillas_conciliacion_mapeos', to_regclass('public.plantillas_conciliacion_mapeos') IS NULL),
      ('plantillas_base', to_regclass('public.plantillas_base') IS NULL),
      ('plantillas_base_mapeos', to_regclass('public.plantillas_base_mapeos') IS NULL),
      ('usuarios_plantillas_base_disponibles', to_regclass('public.usuarios_plantillas_base_disponibles') IS NULL),
      ('bancos_plantillas_base_disponibles', to_regclass('public.bancos_plantillas_base_disponibles') IS NULL),
      ('empresas_erp_tarjetas_comisiones', to_regclass('public.empresas_erp_tarjetas_comisiones') IS NULL)
  ) AS required(table_name, is_missing)
  WHERE required.is_missing;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan tablas requeridas: %.', missing_tables;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cuentas_bancarias'
      AND column_name = 'cuenta_bancaria_sucursal'
  ) THEN
    RAISE EXCEPTION 'Falta cuentas_bancarias.cuenta_bancaria_sucursal.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cuentas_bancarias'
      AND column_name = 'cuenta_bancaria_tipo'
  ) THEN
    RAISE EXCEPTION 'Falta cuentas_bancarias.cuenta_bancaria_tipo.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'plantillas_conciliacion'
      AND column_name = 'plantilla_monto_modo'
  ) THEN
    RAISE EXCEPTION 'Falta plantillas_conciliacion.plantilla_monto_modo.';
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

  IF to_regprocedure('crypt(text,text)') IS NULL
     OR to_regprocedure('gen_salt(text,integer)') IS NULL THEN
    RAISE EXCEPTION 'No esta disponible pgcrypto (crypt/gen_salt).';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.monedas WHERE moneda_codigo = 'PYG' AND moneda_activa = TRUE) THEN
    RAISE EXCEPTION 'No existe la moneda activa PYG.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM irvine_clone_meta t
    LEFT JOIN public.empresas source_company
      ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
    WHERE source_company.emp_id IS NULL
       OR source_company.emp_activa IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'No existe o no esta activa la empresa origen FG_TARJETA.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM irvine_clone_meta t
    JOIN public.empresas target_company
      ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
      OR LOWER(BTRIM(target_company.emp_nombre)) = LOWER(BTRIM(t.target_name))
  ) THEN
    RAISE EXCEPTION 'Ya existe la empresa IRVINE. Este script no sobrescribe una copia existente.';
  END IF;

  IF (SELECT COUNT(*) FROM public.roles WHERE LOWER(BTRIM(rol_codigo)) = 'admin' AND rol_activo = TRUE) <> 1 THEN
    RAISE EXCEPTION 'Debe existir exactamente un rol activo con codigo admin.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.plantillas_base
    WHERE LOWER(BTRIM(plantilla_base_nombre)) = LOWER('Base Itau vs SAP B1')
      AND plantilla_base_activa = TRUE
  ) THEN
    RAISE EXCEPTION 'No existe la plantilla base activa "Base Itau vs SAP B1".';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas source_company
    JOIN public.empresas_erp_configuraciones config
      ON config.emp_id = source_company.emp_id
     AND config.epc_activo = TRUE
     AND LOWER(BTRIM(config.epc_codigo)) = 'sap_tarjetas'
    JOIN irvine_clone_meta t
      ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
  ) THEN
    RAISE EXCEPTION 'FG_TARJETA no tiene ERP activa SAP_TARJETAS. No se genera una copia incompleta.';
  END IF;

  SELECT u.usr_login || ' / ' || COALESCE(u.usr_email, '-') || ' / ' || u.usr_legajo
  INTO conflicting_identity
  FROM irvine_clone_meta t
  JOIN public.usuarios u
    ON LOWER(BTRIM(u.usr_login)) = LOWER(BTRIM(t.admin_login))
    OR LOWER(BTRIM(u.usr_legajo)) = LOWER(BTRIM(t.admin_legajo))
    OR (
      t.admin_email IS NOT NULL
      AND u.usr_email IS NOT NULL
      AND LOWER(BTRIM(u.usr_email)) = LOWER(BTRIM(t.admin_email))
    )
  LIMIT 1;

  IF conflicting_identity IS NOT NULL THEN
    RAISE EXCEPTION
      'Colision de identidad IRVINE (%). Cambia login/email/legajo en irvine_clone_meta.',
      conflicting_identity;
  END IF;

  SELECT e.emp_id_fiscal
  INTO source_user_company
  FROM irvine_clone_meta t
  JOIN public.usuarios u
    ON LOWER(BTRIM(u.usr_login)) = LOWER(BTRIM(t.source_user_login))
  JOIN public.empresas e ON e.emp_id = u.emp_id
  LIMIT 1;

  IF source_user_company IS NOT NULL
     AND LOWER(BTRIM(source_user_company)) <> 'fg_tarjeta' THEN
    RAISE EXCEPTION
      'El usuario origen cmiranda pertenece a %, no a FG_TARJETA. Abortado para no tocarlo.',
      source_user_company;
  END IF;
END;
$$;

-- Empresa nueva. Copia perfil de FG_TARJETA; cambia solo id fiscal y nombre.
INSERT INTO public.empresas (
  emp_id_fiscal,
  emp_nombre,
  emp_activa,
  emp_logo,
  emp_direccion,
  emp_region,
  emp_pais,
  emp_fecha_vigencia,
  emp_webservice_erp,
  emp_scheme_erp,
  emp_version_tls_erp,
  emp_id_tarjetas
)
SELECT
  t.target_tax_id,
  t.target_name,
  TRUE,
  source_company.emp_logo,
  source_company.emp_direccion,
  source_company.emp_region,
  source_company.emp_pais,
  source_company.emp_fecha_vigencia,
  source_company.emp_webservice_erp,
  source_company.emp_scheme_erp,
  source_company.emp_version_tls_erp,
  source_company.emp_id_tarjetas
FROM irvine_clone_meta t
JOIN public.empresas source_company
  ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id));

-- Usuario IRVINE. No mueve ni actualiza cmiranda de FG_TARJETA.
INSERT INTO public.usuarios (
  usr_nombre,
  usr_apellido,
  usr_email,
  usr_celular,
  usr_login,
  usr_legajo,
  usr_password_hash,
  usr_activo,
  usr_created_by,
  emp_id,
  rol_id
)
SELECT
  t.admin_name,
  t.admin_last_name,
  t.admin_email,
  NULL,
  t.admin_login,
  t.admin_legajo,
  COALESCE(
    source_user.usr_password_hash,
    crypt(t.initial_password_fallback, gen_salt('bf', 12))
  ),
  TRUE,
  NULL,
  target_company.emp_id,
  admin_role.rol_id
FROM irvine_clone_meta t
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
JOIN public.roles admin_role
  ON LOWER(BTRIM(admin_role.rol_codigo)) = 'admin'
 AND admin_role.rol_activo = TRUE
LEFT JOIN public.empresas source_company
  ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
LEFT JOIN public.usuarios source_user
  ON source_user.emp_id = source_company.emp_id
 AND LOWER(BTRIM(source_user.usr_login)) = LOWER(BTRIM(t.source_user_login));

INSERT INTO public.empresas_roles_modulos (
  emp_id,
  rol_id,
  mod_id,
  erm_habilitado
)
SELECT
  target_company.emp_id,
  target_admin_role.rol_id,
  source_assignment.mod_id,
  source_assignment.erm_habilitado
FROM irvine_clone_meta t
JOIN public.empresas source_company
  ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
JOIN public.roles source_admin_role
  ON LOWER(BTRIM(source_admin_role.rol_codigo)) = 'admin'
 AND source_admin_role.rol_activo = TRUE
JOIN public.roles target_admin_role
  ON target_admin_role.rol_id = source_admin_role.rol_id
JOIN public.empresas_roles_modulos source_assignment
  ON source_assignment.emp_id = source_company.emp_id
 AND source_assignment.rol_id = source_admin_role.rol_id;

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
FROM irvine_clone_meta t
JOIN public.empresas source_company
  ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
JOIN public.empresas_erp_configuraciones source_config
  ON source_config.emp_id = source_company.emp_id;

INSERT INTO public.empresas_erp_tarjetas_comisiones (
  epc_id,
  etc_cuenta_comision_credito,
  etc_activa
)
SELECT
  target_config.epc_id,
  source_commission.etc_cuenta_comision_credito,
  source_commission.etc_activa
FROM irvine_clone_meta t
JOIN public.empresas source_company
  ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
JOIN public.empresas_erp_configuraciones source_config
  ON source_config.emp_id = source_company.emp_id
JOIN public.empresas_erp_tarjetas_comisiones source_commission
  ON source_commission.epc_id = source_config.epc_id
JOIN public.empresas_erp_configuraciones target_config
  ON target_config.emp_id = target_company.emp_id
 AND LOWER(BTRIM(target_config.epc_codigo)) = LOWER(BTRIM(source_config.epc_codigo));

-- Plantillas base: union de las de admins FG_TARJETA + Base Itau vs SAP B1.
INSERT INTO public.usuarios_plantillas_base_disponibles (
  usuario_id,
  plantilla_base_id
)
SELECT DISTINCT
  target_user.usr_id,
  availability.plantilla_base_id
FROM irvine_clone_meta t
JOIN public.empresas source_company
  ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
JOIN public.usuarios target_user
  ON target_user.emp_id = target_company.emp_id
 AND LOWER(BTRIM(target_user.usr_login)) = LOWER(BTRIM(t.admin_login))
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

INSERT INTO public.usuarios_plantillas_base_disponibles (
  usuario_id,
  plantilla_base_id
)
SELECT
  target_user.usr_id,
  base_template.plantilla_base_id
FROM irvine_clone_meta t
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
JOIN public.usuarios target_user
  ON target_user.emp_id = target_company.emp_id
 AND LOWER(BTRIM(target_user.usr_login)) = LOWER(BTRIM(t.admin_login))
JOIN public.plantillas_base base_template
  ON LOWER(BTRIM(base_template.plantilla_base_nombre)) = LOWER('Base Itau vs SAP B1')
 AND base_template.plantilla_base_activa = TRUE
ON CONFLICT (usuario_id, plantilla_base_id) DO NOTHING;

INSERT INTO public.bancos (
  empresa_id,
  usuario_id,
  banco_origen_id,
  banco_nombre,
  banco_descripcion,
  banco_sucursal,
  banco_activo
)
SELECT
  target_company.emp_id,
  target_user.usr_id,
  NULL,
  seed.banco_nombre,
  seed.banco_descripcion,
  seed.banco_sucursal,
  TRUE
FROM irvine_clone_meta t
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
JOIN public.usuarios target_user
  ON target_user.emp_id = target_company.emp_id
 AND LOWER(BTRIM(target_user.usr_login)) = LOWER(BTRIM(t.admin_login))
JOIN irvine_bank_seed seed ON TRUE
ORDER BY seed.sort_order;

INSERT INTO public.cuentas_bancarias (
  empresa_id,
  banco_id,
  cuenta_bancaria_origen_id,
  cuenta_bancaria_nombre,
  moneda_codigo,
  cuenta_bancaria_numero,
  cuenta_bancaria_id_banco_erp,
  cuenta_bancaria_numero_mayor,
  cuenta_bancaria_numero_pago,
  cuenta_bancaria_sucursal,
  cuenta_bancaria_tipo,
  cuenta_bancaria_activa
)
SELECT
  target_company.emp_id,
  bank.banco_id,
  NULL,
  seed.cuenta_bancaria_nombre,
  seed.moneda_codigo,
  seed.cuenta_bancaria_numero,
  NULL,
  seed.cuenta_bancaria_numero_mayor,
  seed.cuenta_bancaria_numero_pago,
  seed.cuenta_bancaria_sucursal,
  seed.cuenta_bancaria_tipo,
  TRUE
FROM irvine_clone_meta t
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
JOIN irvine_account_seed seed ON TRUE
JOIN public.bancos bank
  ON bank.empresa_id = target_company.emp_id
 AND bank.banco_origen_id IS NULL
 AND LOWER(BTRIM(bank.banco_nombre)) = LOWER(BTRIM(seed.banco_nombre));

-- Layout Itau desde plantilla base global (FG_TARJETA no tiene layouts propios).
DO $$
DECLARE
  target_bank_id INTEGER;
  target_layout_id INTEGER;
  source_base RECORD;
BEGIN
  SELECT bank.banco_id
  INTO STRICT target_bank_id
  FROM irvine_clone_meta t
  JOIN public.empresas target_company
    ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
  JOIN public.bancos bank
    ON bank.empresa_id = target_company.emp_id
   AND bank.banco_origen_id IS NULL
   AND LOWER(BTRIM(bank.banco_nombre)) = LOWER('Banco Itau');

  SELECT *
  INTO STRICT source_base
  FROM public.plantillas_base
  WHERE LOWER(BTRIM(plantilla_base_nombre)) = LOWER('Base Itau vs SAP B1')
    AND plantilla_base_activa = TRUE;

  INSERT INTO public.plantillas_conciliacion (
    banco_id,
    plantilla_base_id,
    plantilla_nombre,
    plantilla_descripcion,
    plantilla_etiqueta_sistema,
    plantilla_etiqueta_banco,
    plantilla_umbral_auto_match,
    plantilla_monto_modo,
    plantilla_activa
  ) VALUES (
    target_bank_id,
    source_base.plantilla_base_id,
    source_base.plantilla_base_nombre,
    source_base.plantilla_base_descripcion,
    source_base.plantilla_base_etiqueta_sistema,
    source_base.plantilla_base_etiqueta_banco,
    source_base.plantilla_base_umbral_auto_match,
    source_base.plantilla_base_monto_modo,
    TRUE
  )
  RETURNING plantilla_id INTO target_layout_id;

  INSERT INTO public.plantillas_conciliacion_mapeos (
    plantilla_id,
    mapeo_clave_campo,
    mapeo_etiqueta,
    mapeo_orden,
    mapeo_activo,
    mapeo_requerido,
    mapeo_operador_comparacion,
    mapeo_peso,
    mapeo_tolerancia,
    sistema_hoja,
    sistema_columna,
    sistema_fila_inicio,
    sistema_fila_fin,
    sistema_tipo_dato,
    banco_hoja,
    banco_columna,
    banco_fila_inicio,
    banco_fila_fin,
    banco_tipo_dato
  )
  SELECT
    target_layout_id,
    source_mapping.mapeo_base_clave_campo,
    source_mapping.mapeo_base_etiqueta,
    source_mapping.mapeo_base_orden,
    source_mapping.mapeo_base_activo,
    source_mapping.mapeo_base_requerido,
    source_mapping.mapeo_base_operador_comparacion,
    source_mapping.mapeo_base_peso,
    source_mapping.mapeo_base_tolerancia,
    source_mapping.sistema_hoja,
    source_mapping.sistema_columna,
    source_mapping.sistema_fila_inicio,
    source_mapping.sistema_fila_fin,
    source_mapping.sistema_tipo_dato,
    source_mapping.banco_hoja,
    source_mapping.banco_columna,
    source_mapping.banco_fila_inicio,
    source_mapping.banco_fila_fin,
    source_mapping.banco_tipo_dato
  FROM public.plantillas_base_mapeos source_mapping
  WHERE source_mapping.plantilla_base_id = source_base.plantilla_base_id
  ORDER BY source_mapping.mapeo_base_orden, source_mapping.mapeo_base_id;

  INSERT INTO public.bancos_plantillas_base_disponibles (
    banco_id,
    plantilla_base_id
  )
  VALUES (
    target_bank_id,
    source_base.plantilla_base_id
  )
  ON CONFLICT (banco_id, plantilla_base_id) DO NOTHING;
END;
$$;

-- Verificacion + aislamiento. Si falla, ROLLBACK de IRVINE entero.
DO $$
DECLARE
  snap irvine_isolation_snapshot%ROWTYPE;
  target_company_id INTEGER;
  target_user_id INTEGER;
  source_company_id INTEGER;
  expected_itau_mappings INTEGER;
  actual_itau_mappings INTEGER;
  source_user RECORD;
BEGIN
  SELECT * INTO STRICT snap FROM irvine_isolation_snapshot LIMIT 1;

  SELECT target_company.emp_id, target_user.usr_id
  INTO STRICT target_company_id, target_user_id
  FROM irvine_clone_meta t
  JOIN public.empresas target_company
    ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
  JOIN public.usuarios target_user
    ON target_user.emp_id = target_company.emp_id
   AND LOWER(BTRIM(target_user.usr_login)) = LOWER(BTRIM(t.admin_login));

  SELECT source_company.emp_id
  INTO STRICT source_company_id
  FROM irvine_clone_meta t
  JOIN public.empresas source_company
    ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id));

  IF (SELECT COUNT(*) FROM public.empresas) <> snap.empresas + 1 THEN
    RAISE EXCEPTION 'Aislamiento empresas: esperado % filas, hay %.', snap.empresas + 1, (SELECT COUNT(*) FROM public.empresas);
  END IF;

  IF (SELECT COUNT(*) FROM public.usuarios) <> snap.usuarios + 1 THEN
    RAISE EXCEPTION 'Aislamiento usuarios: esperado % filas, hay %.', snap.usuarios + 1, (SELECT COUNT(*) FROM public.usuarios);
  END IF;

  IF (SELECT COUNT(*) FROM public.empresas_roles_modulos) <> snap.empresas_roles_modulos + snap.source_erm_count THEN
    RAISE EXCEPTION 'Aislamiento matriz de modulos rota.';
  END IF;

  IF (SELECT COUNT(*) FROM public.empresas_erp_configuraciones) <> snap.erp_configs + snap.source_erp_count THEN
    RAISE EXCEPTION 'Aislamiento ERP rota.';
  END IF;

  IF (SELECT COUNT(*) FROM public.bancos) <> snap.bancos + 6 THEN
    RAISE EXCEPTION 'Aislamiento bancos: esperado +6.';
  END IF;

  IF (SELECT COUNT(*) FROM public.cuentas_bancarias) <> snap.cuentas + 3 THEN
    RAISE EXCEPTION 'Aislamiento cuentas: esperado +3.';
  END IF;

  IF (SELECT COUNT(*) FROM public.plantillas_conciliacion) <> snap.plantillas + 1 THEN
    RAISE EXCEPTION 'Aislamiento plantillas: esperado +1 (Base Itau).';
  END IF;

  SELECT COUNT(*)
  INTO expected_itau_mappings
  FROM public.plantillas_base_mapeos mapping
  JOIN public.plantillas_base base_template
    ON base_template.plantilla_base_id = mapping.plantilla_base_id
  WHERE LOWER(BTRIM(base_template.plantilla_base_nombre)) = LOWER('Base Itau vs SAP B1');

  SELECT COUNT(*)
  INTO actual_itau_mappings
  FROM public.plantillas_conciliacion_mapeos mapping
  JOIN public.plantillas_conciliacion layout
    ON layout.plantilla_id = mapping.plantilla_id
  JOIN public.bancos bank ON bank.banco_id = layout.banco_id
  WHERE bank.empresa_id = target_company_id;

  IF actual_itau_mappings <> expected_itau_mappings THEN
    RAISE EXCEPTION 'Mappings Itau IRVINE: esperados %, hay %.', expected_itau_mappings, actual_itau_mappings;
  END IF;

  IF (SELECT COUNT(*) FROM public.plantillas_conciliacion_mapeos) <> snap.mapeos + expected_itau_mappings THEN
    RAISE EXCEPTION 'Aislamiento mappings rota.';
  END IF;

  IF (SELECT COUNT(*) FROM public.empresas_erp_tarjetas_comisiones) <> snap.comisiones + snap.source_commission_count THEN
    RAISE EXCEPTION 'Aislamiento comisiones rota.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.bancos b
    WHERE b.empresa_id = source_company_id
  ) <> snap.source_bank_count THEN
    RAISE EXCEPTION 'Se modificaron bancos de FG_TARJETA. Abortado.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.cuentas_bancarias a
    WHERE a.empresa_id = source_company_id
  ) <> snap.source_account_count THEN
    RAISE EXCEPTION 'Se modificaron cuentas de FG_TARJETA. Abortado.';
  END IF;

  IF (
    SELECT COUNT(*)
    FROM public.bancos b
    WHERE b.empresa_id NOT IN (source_company_id, target_company_id)
  ) <> snap.other_bank_count THEN
    RAISE EXCEPTION 'Se modificaron bancos de otras empresas. Abortado.';
  END IF;

  IF (SELECT COUNT(*) FROM public.bancos WHERE empresa_id = target_company_id) <> 6 THEN
    RAISE EXCEPTION 'IRVINE debe tener 6 bancos.';
  END IF;

  IF (SELECT COUNT(*) FROM public.cuentas_bancarias WHERE empresa_id = target_company_id) <> 3 THEN
    RAISE EXCEPTION 'IRVINE debe tener 3 cuentas contables.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bancos bank
    WHERE bank.empresa_id = target_company_id
      AND bank.usuario_id <> target_user_id
  ) THEN
    RAISE EXCEPTION 'Hay bancos IRVINE asignados a otro usuario.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bancos bank
    WHERE bank.empresa_id <> target_company_id
      AND bank.banco_id IN (
        SELECT banco_id FROM public.bancos WHERE empresa_id = target_company_id
      )
  ) THEN
    RAISE EXCEPTION 'Cruce de banco_id con otra empresa.';
  END IF;

  -- FG_TARJETA y cmiranda intactos.
  IF snap.source_user_id IS NOT NULL THEN
    SELECT u.usr_id, u.emp_id, u.usr_email, u.usr_login, u.usr_updated_at
    INTO STRICT source_user
    FROM public.usuarios u
    WHERE u.usr_id = snap.source_user_id;

    IF source_user.emp_id <> snap.source_user_emp_id THEN
      RAISE EXCEPTION 'Se modifico emp_id de cmiranda. Abortado.';
    END IF;

    IF source_user.usr_email IS DISTINCT FROM snap.source_user_email THEN
      RAISE EXCEPTION 'Se modifico email de cmiranda. Abortado.';
    END IF;

    IF source_user.usr_updated_at IS DISTINCT FROM snap.source_user_updated_at THEN
      RAISE EXCEPTION 'Se toco usr_updated_at de cmiranda. Abortado.';
    END IF;

    IF LOWER(BTRIM(source_user.usr_login)) <> 'cmiranda' THEN
      RAISE EXCEPTION 'Se modifico login de cmiranda. Abortado.';
    END IF;
  END IF;

  IF (
    SELECT e.emp_updated_at
    FROM public.empresas e
    WHERE e.emp_id = source_company_id
  ) IS DISTINCT FROM snap.source_company_updated_at THEN
    RAISE EXCEPTION 'Se toco FG_TARJETA. Abortado.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN irvine_clone_meta t ON TRUE
    WHERE LOWER(BTRIM(u.usr_login)) = LOWER(BTRIM(t.admin_login))
      AND u.emp_id <> target_company_id
  ) THEN
    RAISE EXCEPTION 'cmiranda.irvine no quedo exclusivo de IRVINE.';
  END IF;
END;
$$;

-- Resultado para revision manual (sin credenciales ERP). Las tablas temp
-- viven hasta el COMMIT final.
SELECT
  source_company.emp_id AS emp_id_origen,
  source_company.emp_id_fiscal AS empresa_origen,
  target_company.emp_id AS emp_id_irvine,
  target_company.emp_id_fiscal AS empresa_irvine,
  target_company.emp_nombre,
  target_user.usr_id,
  target_user.usr_login AS login_irvine,
  target_user.usr_email AS email_irvine,
  target_user.usr_legajo,
  target_user.usr_activo,
  (
    SELECT u.usr_login
    FROM public.usuarios u
    WHERE LOWER(BTRIM(u.usr_login)) = 'cmiranda'
      AND u.emp_id = source_company.emp_id
  ) AS login_original_intacta,
  COALESCE((
    SELECT ARRAY_AGG(module.mod_codigo ORDER BY module.mod_codigo)
    FROM public.empresas_roles_modulos assignment
    JOIN public.modulos module ON module.mod_id = assignment.mod_id
    WHERE assignment.emp_id = target_company.emp_id
      AND assignment.rol_id = target_user.rol_id
      AND assignment.erm_habilitado = TRUE
  ), ARRAY[]::VARCHAR[]) AS pantallas_habilitadas,
  COALESCE((
    SELECT ARRAY_AGG(config.epc_codigo ORDER BY config.epc_codigo)
    FROM public.empresas_erp_configuraciones config
    WHERE config.emp_id = target_company.emp_id
      AND config.epc_activo = TRUE
  ), ARRAY[]::VARCHAR[]) AS erps_activas,
  (
    SELECT COUNT(*)
    FROM public.empresas_erp_configuraciones config
    WHERE config.emp_id = source_company.emp_id
  ) AS erps_origen,
  (
    SELECT COUNT(*)
    FROM public.empresas_erp_configuraciones config
    WHERE config.emp_id = target_company.emp_id
  ) AS erps_irvine,
  (
    SELECT COUNT(*)
    FROM public.bancos bank
    WHERE bank.empresa_id = target_company.emp_id
  ) AS bancos_irvine,
  (
    SELECT COUNT(*)
    FROM public.cuentas_bancarias account
    WHERE account.empresa_id = target_company.emp_id
  ) AS cuentas_irvine,
  (
    SELECT COUNT(*)
    FROM public.plantillas_conciliacion layout
    JOIN public.bancos bank ON bank.banco_id = layout.banco_id
    WHERE bank.empresa_id = target_company.emp_id
  ) AS plantillas_irvine
FROM irvine_clone_meta t
JOIN public.empresas source_company
  ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
JOIN public.usuarios target_user
  ON target_user.emp_id = target_company.emp_id
 AND LOWER(BTRIM(target_user.usr_login)) = LOWER(BTRIM(t.admin_login));

SELECT
  bank.banco_nombre,
  bank.banco_descripcion,
  bank.banco_sucursal,
  account.cuenta_bancaria_nombre,
  account.cuenta_bancaria_numero,
  account.cuenta_bancaria_numero_mayor,
  account.cuenta_bancaria_numero_pago,
  account.cuenta_bancaria_sucursal,
  account.cuenta_bancaria_tipo
FROM public.empresas company
JOIN public.bancos bank ON bank.empresa_id = company.emp_id
LEFT JOIN public.cuentas_bancarias account ON account.banco_id = bank.banco_id
WHERE LOWER(BTRIM(company.emp_id_fiscal)) = 'irvine'
ORDER BY bank.banco_nombre, account.cuenta_bancaria_id;

COMMIT;
