-- =============================================================================
-- Copia AISLADA en Qoncilia de 5629621 hacia 5629621_QA.
--
-- Crea exactamente un usuario con rol `admin` y replica solamente la
-- configuracion necesaria para probar las pantallas:
--   * perfil de empresa;
--   * modulos/pantallas del rol admin;
--   * todas las configuraciones ERP, activas e inactivas, conservando cada
--     campo funcional (las credenciales se copian cifradas, sin mostrarlas ni
--     descifrarlas);
--   * bancos, cuentas, plantillas de conciliacion y sus mappings;
--   * disponibilidad de plantillas base para el nuevo administrador.
--
-- NO copia usuarios reales, sesiones ERP, extractos, filas de extractos ni
-- resultados/historial de conciliacion. NO hay UPDATE/DELETE sobre la empresa
-- origen ni sobre ningun otro registro preexistente.
--
-- Empresa nueva:
--   5629621 -> 5629621_QA / <nombre original> - QA Conciliacion
--
-- Usuario que crea (solo si no existia):
--   qa.conciliacion.admin / Qoncilia.QA.2026!
-- Cambiar la contrasena inmediatamente despues del primer inicio de sesion.
--
-- IMPORTANTE: las ERP clonadas apuntaran al MISMO SAP que las empresas origen y
-- conservaran sus estados activo/predeterminado. Consultar datos es aislado a
-- nivel Qoncilia, pero procesar BankPages, depositos de tarjetas,
-- conciliaciones externas o borrados puede escribir en SAP real. No ejecutar
-- este seed hasta desplegar el bloqueo backend de escrituras para 5629621_QA.
-- Este SQL por si solo no protege SAP productivo.
--
-- Seguridad operacional: la ejecucion es atomica y de una sola vez. Si el
-- codigo QA ya existe, se aborta antes de hacer cambios para no
-- sobreescribir configuracion de pruebas previa.
-- =============================================================================

BEGIN;

-- Esta instancia fue confirmada como la base de produccion. Las copias QA se
-- crean aqui, pero el script aborta si se ejecuta contra otra base.
DO $$
DECLARE
  expected_database CONSTANT TEXT := 'QONCILIA_BACK';
BEGIN
  IF current_database() <> expected_database THEN
    RAISE EXCEPTION 'Base incorrecta. Esperada %, actual %.', expected_database, current_database();
  END IF;
END;
$$;

CREATE TEMP TABLE qa_clone_targets (
  source_tax_id   VARCHAR(50)  PRIMARY KEY,
  target_tax_id   VARCHAR(50)  NOT NULL UNIQUE,
  name_suffix     VARCHAR(40)  NOT NULL,
  admin_login     VARCHAR(80)  NOT NULL UNIQUE,
  admin_legajo    VARCHAR(50)  NOT NULL UNIQUE,
  admin_name      VARCHAR(120) NOT NULL,
  admin_last_name VARCHAR(120) NOT NULL,
  initial_password TEXT        NOT NULL
) ON COMMIT DROP;

INSERT INTO qa_clone_targets (
  source_tax_id,
  target_tax_id,
  name_suffix,
  admin_login,
  admin_legajo,
  admin_name,
  admin_last_name,
  initial_password
) VALUES
  (
    '5629621',
    '5629621_QA',
    ' - QA Conciliacion',
    'qa.conciliacion.admin',
    'qa.conciliacion.admin',
    'Administrador',
    'QA Conciliacion',
    'Qoncilia.QA.2026!'
  );

-- Precondiciones y protecciones contra colisiones. No realiza modificaciones.
DO $$
DECLARE
  missing_tables TEXT;
  conflicting_login TEXT;
  duplicate_bank_names TEXT;
  missing_operational_config TEXT;
  missing_operational_screen TEXT;
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
      ('usuarios_plantillas_base_disponibles', to_regclass('public.usuarios_plantillas_base_disponibles') IS NULL)
  ) AS required(table_name, is_missing)
  WHERE required.is_missing;

  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan tablas requeridas: %. Ejecuta las migraciones hasta sql/39 antes de este script.', missing_tables;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cuentas_bancarias'
      AND column_name = 'cuenta_bancaria_sucursal'
  ) THEN
    RAISE EXCEPTION 'Falta cuentas_bancarias.cuenta_bancaria_sucursal. Ejecuta sql/39_add_sucursal_cuentas_bancarias.sql primero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'plantillas_conciliacion'
      AND column_name = 'plantilla_monto_modo'
  ) THEN
    RAISE EXCEPTION 'Falta plantillas_conciliacion.plantilla_monto_modo. Ejecuta sql/30_debito_credito_conciliacion.sql primero.';
  END IF;

  IF to_regprocedure('crypt(text,text)') IS NULL
     OR to_regprocedure('gen_salt(text,integer)') IS NULL THEN
    RAISE EXCEPTION 'No esta disponible pgcrypto (crypt/gen_salt). Ejecuta sql/01_create_extensions.sql primero.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM qa_clone_targets t
    LEFT JOIN public.empresas source_company
      ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
    WHERE source_company.emp_id IS NULL
       OR source_company.emp_activa IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'No existe o no esta activa la empresa origen 5629621.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM qa_clone_targets t
    JOIN public.empresas target_company
      ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
  ) THEN
    RAISE EXCEPTION 'Ya existe la empresa QA 5629621_QA. Este script no sobrescribe copias existentes.';
  END IF;

  IF (SELECT COUNT(*) FROM public.roles WHERE LOWER(BTRIM(rol_codigo)) = 'admin' AND rol_activo = TRUE) <> 1 THEN
    RAISE EXCEPTION 'Debe existir exactamente un rol activo con codigo admin.';
  END IF;

  SELECT u.usr_login
  INTO conflicting_login
  FROM qa_clone_targets t
  JOIN public.usuarios u
    ON LOWER(BTRIM(u.usr_login)) = LOWER(BTRIM(t.admin_login))
    OR LOWER(BTRIM(u.usr_legajo)) = LOWER(BTRIM(t.admin_legajo))
  LIMIT 1;

  IF conflicting_login IS NOT NULL THEN
    RAISE EXCEPTION 'El login o legajo de QA ya esta ocupado por el usuario %. Cambia los valores de qa_clone_targets antes de ejecutar.', conflicting_login;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM qa_clone_targets t
    JOIN public.empresas source_company
      ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
    LEFT JOIN public.empresas_erp_configuraciones cfg
      ON cfg.emp_id = source_company.emp_id
     AND cfg.epc_activo = TRUE
    GROUP BY t.source_tax_id
    HAVING COUNT(cfg.epc_id) = 0
  ) THEN
    RAISE EXCEPTION 'Una empresa origen no tiene configuracion ERP activa; no se generara una copia incompleta.';
  END IF;

  SELECT STRING_AGG(required.source_tax_id || ': ' || required.erp_code, ', ' ORDER BY required.source_tax_id)
  INTO missing_operational_config
  FROM (
    VALUES
      ('5629621'::VARCHAR, 'SAP_B1'::VARCHAR)
  ) AS required(source_tax_id, erp_code)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.empresas source_company
    JOIN public.empresas_erp_configuraciones config
      ON config.emp_id = source_company.emp_id
     AND config.epc_activo = TRUE
     AND LOWER(BTRIM(config.epc_codigo)) = LOWER(required.erp_code)
    WHERE LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(required.source_tax_id)
  );

  IF missing_operational_config IS NOT NULL THEN
    RAISE EXCEPTION 'Falta la ERP activa requerida en: %. No se generara una copia sin operativa.', missing_operational_config;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM qa_clone_targets t
    JOIN public.empresas source_company
      ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
    JOIN public.roles admin_role
      ON LOWER(BTRIM(admin_role.rol_codigo)) = 'admin'
     AND admin_role.rol_activo = TRUE
    LEFT JOIN public.empresas_roles_modulos erm
      ON erm.emp_id = source_company.emp_id
     AND erm.rol_id = admin_role.rol_id
    GROUP BY t.source_tax_id
    HAVING COUNT(erm.erm_id) = 0
  ) THEN
    RAISE EXCEPTION 'Una empresa origen no tiene pantallas configuradas para el rol admin.';
  END IF;

  SELECT STRING_AGG(required.source_tax_id || ': ' || required.module_code, ', ' ORDER BY required.source_tax_id)
  INTO missing_operational_screen
  FROM (
    VALUES
      ('5629621'::VARCHAR, 'bank_conciliation'::VARCHAR)
  ) AS required(source_tax_id, module_code)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.empresas source_company
    JOIN public.roles admin_role
      ON LOWER(BTRIM(admin_role.rol_codigo)) = 'admin'
     AND admin_role.rol_activo = TRUE
    JOIN public.empresas_roles_modulos assignment
      ON assignment.emp_id = source_company.emp_id
     AND assignment.rol_id = admin_role.rol_id
     AND assignment.erm_habilitado = TRUE
    JOIN public.modulos module
      ON module.mod_id = assignment.mod_id
     AND LOWER(BTRIM(module.mod_codigo)) = LOWER(required.module_code)
     AND module.mod_activo = TRUE
    WHERE LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(required.source_tax_id)
  );

  IF missing_operational_screen IS NOT NULL THEN
    RAISE EXCEPTION 'Falta la pantalla habilitada requerida en: %. Revisa la matriz de accesos de las empresas origen.', missing_operational_screen;
  END IF;

  -- Todos los bancos raiz seran del unico admin QA. Dos bancos raiz con el
  -- mismo nombre en el origen chocarian con la restriccion unica del destino.
  SELECT STRING_AGG(duplicate_name, ', ' ORDER BY duplicate_name)
  INTO duplicate_bank_names
  FROM (
    SELECT
      t.source_tax_id || ': ' || BTRIM(b.banco_nombre) AS duplicate_name
    FROM qa_clone_targets t
    JOIN public.empresas source_company
      ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
    JOIN public.bancos b
      ON b.empresa_id = source_company.emp_id
     AND b.banco_origen_id IS NULL
    GROUP BY t.source_tax_id, LOWER(BTRIM(b.banco_nombre)), BTRIM(b.banco_nombre)
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_bank_names IS NOT NULL THEN
    RAISE EXCEPTION 'Hay bancos raiz duplicados por nombre en el origen: %. Unificalos o adapta el script antes de clonar.', duplicate_bank_names;
  END IF;
END;
$$;

-- Perfil de las empresas. Los unicos cambios intencionales son el nuevo
-- identificador fiscal, el sufijo QA en el nombre y que permanezcan activas.
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
  source_company.emp_nombre || t.name_suffix,
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
FROM qa_clone_targets t
JOIN public.empresas source_company
  ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id));

-- Un solo administrador por empresa QA. No se copian personas ni credenciales
-- de los usuarios originales; solo se genera un hash bcrypt para el usuario QA.
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
  NULL,
  NULL,
  t.admin_login,
  t.admin_legajo,
  crypt(t.initial_password, gen_salt('bf', 12)),
  TRUE,
  NULL,
  target_company.emp_id,
  admin_role.rol_id
FROM qa_clone_targets t
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
JOIN public.roles admin_role
  ON LOWER(BTRIM(admin_role.rol_codigo)) = 'admin'
 AND admin_role.rol_activo = TRUE;

-- Replica exactamente las pantallas asignadas al rol admin de cada empresa
-- origen, incluidos los modulos que esten explicitamente deshabilitados.
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
FROM qa_clone_targets t
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

-- Copia todas las ERP, activas e inactivas, manteniendo exactamente estados,
-- codigo, conexiones, queries, settings y valores cifrados. Solamente cambian
-- el epc_id autogenerado, el emp_id de destino y los timestamps de la fila.
-- No se copian sesiones ERP: el admin QA debe iniciar su propia sesion SAP.
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
  source_config.epc_db_user,
  source_config.epc_db_password_enc,
  source_config.epc_service_layer_url,
  source_config.epc_tls_version,
  source_config.epc_allow_self_signed,
  source_config.epc_settings
FROM qa_clone_targets t
JOIN public.empresas source_company
  ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
JOIN public.empresas_erp_configuraciones source_config
  ON source_config.emp_id = source_company.emp_id;

-- Da al admin QA la union de plantillas base disponibles para los admins activos
-- de su empresa origen. No se duplican plantillas globales.
INSERT INTO public.usuarios_plantillas_base_disponibles (
  usuario_id,
  plantilla_base_id
)
SELECT DISTINCT
  target_user.usr_id,
  availability.plantilla_base_id
FROM qa_clone_targets t
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
  ON availability.usuario_id = source_admin.usr_id;

-- Bancos, cuentas, layouts y mappings. Se clonan unicamente bancos/cuentas
-- raiz (los que ve la operativa); el unico admin QA queda como propietario.
-- No se copian extractos ni filas historicas.
DO $$
DECLARE
  target RECORD;
  source_bank RECORD;
  source_layout RECORD;
  target_user_id INTEGER;
  target_bank_id INTEGER;
  target_layout_id INTEGER;
BEGIN
  FOR target IN
    SELECT
      t.source_tax_id,
      source_company.emp_id AS source_company_id,
      target_company.emp_id AS target_company_id,
      target_user.usr_id AS target_user_id
    FROM qa_clone_targets t
    JOIN public.empresas source_company
      ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
    JOIN public.empresas target_company
      ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
    JOIN public.usuarios target_user
      ON target_user.emp_id = target_company.emp_id
     AND LOWER(BTRIM(target_user.usr_login)) = LOWER(BTRIM(t.admin_login))
  LOOP
    target_user_id := target.target_user_id;

    FOR source_bank IN
      SELECT *
      FROM public.bancos
      WHERE empresa_id = target.source_company_id
        AND banco_origen_id IS NULL
      ORDER BY banco_id
    LOOP
      INSERT INTO public.bancos (
        empresa_id,
        usuario_id,
        banco_origen_id,
        banco_nombre,
        banco_descripcion,
        banco_sucursal,
        banco_activo
      ) VALUES (
        target.target_company_id,
        target_user_id,
        NULL,
        source_bank.banco_nombre,
        source_bank.banco_descripcion,
        source_bank.banco_sucursal,
        source_bank.banco_activo
      )
      RETURNING banco_id INTO target_bank_id;

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
        cuenta_bancaria_activa
      )
      SELECT
        target.target_company_id,
        target_bank_id,
        NULL,
        source_account.cuenta_bancaria_nombre,
        source_account.moneda_codigo,
        source_account.cuenta_bancaria_numero,
        source_account.cuenta_bancaria_id_banco_erp,
        source_account.cuenta_bancaria_numero_mayor,
        source_account.cuenta_bancaria_numero_pago,
        source_account.cuenta_bancaria_sucursal,
        source_account.cuenta_bancaria_activa
      FROM public.cuentas_bancarias source_account
      WHERE source_account.empresa_id = target.source_company_id
        AND source_account.banco_id = source_bank.banco_id
        AND source_account.cuenta_bancaria_origen_id IS NULL
      ORDER BY source_account.cuenta_bancaria_id;

      FOR source_layout IN
        SELECT *
        FROM public.plantillas_conciliacion
        WHERE banco_id = source_bank.banco_id
        ORDER BY plantilla_id
      LOOP
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
          source_layout.plantilla_base_id,
          source_layout.plantilla_nombre,
          source_layout.plantilla_descripcion,
          source_layout.plantilla_etiqueta_sistema,
          source_layout.plantilla_etiqueta_banco,
          source_layout.plantilla_umbral_auto_match,
          source_layout.plantilla_monto_modo,
          source_layout.plantilla_activa
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
          source_mapping.mapeo_clave_campo,
          source_mapping.mapeo_etiqueta,
          source_mapping.mapeo_orden,
          source_mapping.mapeo_activo,
          source_mapping.mapeo_requerido,
          source_mapping.mapeo_operador_comparacion,
          source_mapping.mapeo_peso,
          source_mapping.mapeo_tolerancia,
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
        FROM public.plantillas_conciliacion_mapeos source_mapping
        WHERE source_mapping.plantilla_id = source_layout.plantilla_id
        ORDER BY source_mapping.mapeo_orden, source_mapping.mapeo_id;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

-- Verificacion final (solo lectura y sin credenciales ERP).
SELECT
  source_company.emp_id_fiscal AS empresa_origen,
  target_company.emp_id_fiscal AS empresa_qa,
  target_company.emp_nombre AS nombre_qa,
  target_user.usr_login AS admin_qa,
  target_user.usr_activo AS admin_activo,
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
  (SELECT COUNT(*)
   FROM public.empresas_erp_configuraciones config
   WHERE config.emp_id = source_company.emp_id) AS erps_origen_totales,
  (SELECT COUNT(*)
   FROM public.empresas_erp_configuraciones config
   WHERE config.emp_id = target_company.emp_id) AS erps_totales,
  (
    NOT EXISTS (
      SELECT TO_JSONB(source_config)
        - 'epc_id'
        - 'emp_id'
        - 'epc_created_at'
        - 'epc_updated_at'
      FROM public.empresas_erp_configuraciones source_config
      WHERE source_config.emp_id = source_company.emp_id
      EXCEPT
      SELECT TO_JSONB(target_config)
        - 'epc_id'
        - 'emp_id'
        - 'epc_created_at'
        - 'epc_updated_at'
      FROM public.empresas_erp_configuraciones target_config
      WHERE target_config.emp_id = target_company.emp_id
    )
    AND NOT EXISTS (
      SELECT TO_JSONB(target_config)
        - 'epc_id'
        - 'emp_id'
        - 'epc_created_at'
        - 'epc_updated_at'
      FROM public.empresas_erp_configuraciones target_config
      WHERE target_config.emp_id = target_company.emp_id
      EXCEPT
      SELECT TO_JSONB(source_config)
        - 'epc_id'
        - 'emp_id'
        - 'epc_created_at'
        - 'epc_updated_at'
      FROM public.empresas_erp_configuraciones source_config
      WHERE source_config.emp_id = source_company.emp_id
    )
  ) AS erp_config_identica,
  (SELECT COUNT(*) FROM public.bancos bank WHERE bank.empresa_id = target_company.emp_id AND bank.banco_origen_id IS NULL) AS bancos_raiz,
  (SELECT COUNT(*) FROM public.cuentas_bancarias account WHERE account.empresa_id = target_company.emp_id AND account.cuenta_bancaria_origen_id IS NULL) AS cuentas_raiz,
  (SELECT COUNT(*) FROM public.plantillas_conciliacion layout JOIN public.bancos bank ON bank.banco_id = layout.banco_id WHERE bank.empresa_id = target_company.emp_id AND bank.banco_origen_id IS NULL) AS plantillas_conciliacion,
  (SELECT COUNT(*) FROM public.plantillas_conciliacion_mapeos mapping JOIN public.plantillas_conciliacion layout ON layout.plantilla_id = mapping.plantilla_id JOIN public.bancos bank ON bank.banco_id = layout.banco_id WHERE bank.empresa_id = target_company.emp_id AND bank.banco_origen_id IS NULL) AS mappings_conciliacion
FROM qa_clone_targets t
JOIN public.empresas source_company
  ON LOWER(BTRIM(source_company.emp_id_fiscal)) = LOWER(BTRIM(t.source_tax_id))
JOIN public.empresas target_company
  ON LOWER(BTRIM(target_company.emp_id_fiscal)) = LOWER(BTRIM(t.target_tax_id))
JOIN public.usuarios target_user
  ON target_user.emp_id = target_company.emp_id
 AND LOWER(BTRIM(target_user.usr_login)) = LOWER(BTRIM(t.admin_login))
ORDER BY t.source_tax_id;

COMMIT;
