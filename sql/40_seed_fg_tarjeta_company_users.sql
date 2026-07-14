-- =============================================================================
-- Provisionamiento de la empresa FG TARJETA, sus usuarios y SAP_TARJETAS.
-- Si una ejecucion anterior quedo en estado abortado, ejecutar ROLLBACK; una vez
-- en esa misma sesion antes de volver a ejecutar este archivo completo.
--
-- Decisiones de este seed:
--   * emp_id_fiscal: FG_TARJETA (no se recibio un RUC; si corresponde, reemplazar
--     todas las apariciones de ese codigo por el RUC real antes de ejecutar).
--   * password inicial de los 9 usuarios: 123456.
--   * rol: admin para los 9 usuarios. No se asigna is_super_admin a ninguno.
--   * usr_legajo: se usa el usuario SAP, porque el sistema exige un legajo unico.
--   * "Puesto de trabajo" no se persiste: public.usuarios no tiene ese campo.
--   * la configuracion ERP usa la plantilla global SAP_TARJETAS. Si esa plantilla
--     no tiene credenciales HANA, intenta reutilizar una configuracion SAP activa
--     del mismo Service Layer. Nunca se insertan passwords ERP en texto plano.
--
-- El script es atomico. Si falta la plantilla SAP_TARJETAS, la transaccion se
-- aborta. Si existe pero no hay ninguna fuente de credenciales operativa, se crea
-- SAP_TARJETAS INACTIVA para completarla despues desde Gestion ERP, sin impedir
-- la creacion de la empresa y los usuarios.
-- Al reejecutarlo actualiza datos generales, pero NO vuelve a cambiar passwords
-- de usuarios ni sobrescribe una configuracion ERP que ya sea operativa. Una
-- copia inactiva solo se promociona si aparece una fuente operativa compatible.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TEMP TABLE seed_fg_tarjeta_usuarios (
  nombre VARCHAR(120) NOT NULL,
  apellido VARCHAR(120) NOT NULL,
  login VARCHAR(80) PRIMARY KEY,
  email VARCHAR(160) NOT NULL UNIQUE,
  legajo VARCHAR(50) NOT NULL UNIQUE,
  puesto VARCHAR(160) NOT NULL,
  rol_codigo VARCHAR(50) NOT NULL
) ON COMMIT DROP;

INSERT INTO seed_fg_tarjeta_usuarios (
  nombre,
  apellido,
  login,
  email,
  legajo,
  puesto,
  rol_codigo
) VALUES
  ('Yanina',    'Mendoza',    'ymendoza',        'yanina.mendoza@fguarani.com.py',   'ymendoza',        'Oficinas Corporativas',                         'admin'),
  ('Victor',    'González',   'vgonzalez',       'victor.gonzalez@fguarani.com.py',  'vgonzalez',       'Oficinas Corporativas',                         'admin'),
  ('Cintia',    'Miranda',    'cmiranda',        'cintia.miranda@fguarani.com.py',   'cmiranda',        'Itaugua - IRVINE',                              'admin'),
  ('Raquel',    'Rojas',      'rrojas',          'raquel.rojas@fguarani.com.py',     'rrojas',          'Tiendas de Carne - Campestres Limpio',          'admin'),
  ('Araceli',   'Sosa',       'araceli.sosa',    'araceli.sosa@fguarani.com.py',     'araceli.sosa',    'Tiendas de Carne - Campestres Fdo.',            'admin'),
  ('Erika',     'Caballero',  'erika.caballero', 'erika.caballero@fguarani.com.py',  'erika.caballero', 'Tiendas de Carne - Campestres Fdo.',            'admin'),
  ('Francisco', 'Velazquez',  'lsosa',           'adminpc@fguarani.com.py',           'lsosa',           'Tiendas de Carne - Punto Carne',                'admin'),
  ('Roberto',   'González',   'rgonzalez',       'roberto.gonzalez@fguarani.com.py', 'rgonzalez',       'BACKUP',                                        'admin'),
  ('Liz',       'Taboada',    'ltaboada',        'liz.taboada@fguarani.com.py',       'ltaboada',        'Itaugua',                                       'admin');

-- Validaciones previas: evitan duplicar una empresa con otro ID o provisionar
-- una configuracion SAP_TARJETAS que no pueda ejecutar el query HANA.
DO $$
DECLARE
  template_count INTEGER;
  missing_modules TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(TRIM(emp_nombre)) = LOWER('FG TARJETA')
      AND LOWER(TRIM(emp_id_fiscal)) <> LOWER('FG_TARJETA')
  ) THEN
    RAISE EXCEPTION
      'Ya existe una empresa FG TARJETA con otro ID fiscal. Revisa FG_TARJETA antes de ejecutar.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('FG_TARJETA')
      AND LOWER(TRIM(emp_nombre)) <> LOWER('FG TARJETA')
  ) THEN
    RAISE EXCEPTION
      'El ID fiscal FG_TARJETA ya pertenece a otra empresa. Reemplazalo por el RUC real antes de ejecutar.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('FG_TARJETA')
      AND emp_id_fiscal <> TRIM(emp_id_fiscal)
  ) THEN
    RAISE EXCEPTION
      'Ya existe el ID fiscal FG_TARJETA con espacios al inicio/final. Corrigelo antes de ejecutar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.roles
    WHERE LOWER(rol_codigo) = 'admin'
      AND rol_activo = TRUE
  ) THEN
    RAISE EXCEPTION 'No existe el rol activo admin.';
  END IF;

  SELECT STRING_AGG(required.mod_codigo, ', ' ORDER BY required.mod_codigo)
  INTO missing_modules
  FROM (
    VALUES
      ('home'),
      ('profile'),
      ('conciliation'),
      ('bank_conciliation'),
      ('card_payment'),
      ('users'),
      ('layout_management'),
      ('erp_management')
  ) AS required(mod_codigo)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.modulos m
    WHERE LOWER(m.mod_codigo) = required.mod_codigo
      AND m.mod_activo = TRUE
  );

  IF missing_modules IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan modulos activos requeridos: %.', missing_modules;
  END IF;

  SELECT COUNT(*)
  INTO template_count
  FROM public.erp_configuraciones_plantillas
  WHERE LOWER(ept_codigo) = 'sap_tarjetas';

  IF template_count <> 1 THEN
    RAISE EXCEPTION
      'Debe existir exactamente una plantilla ERP SAP_TARJETAS; encontradas: %.',
      template_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.erp_configuraciones_plantillas
    WHERE LOWER(ept_codigo) = 'sap_tarjetas'
      AND (
        ept_activo IS NOT TRUE
        OR NULLIF(TRIM(ept_db_name), '') IS NULL
        OR NULLIF(TRIM(ept_server_node), '') IS NULL
        OR NULLIF(TRIM(ept_db_user), '') IS NULL
        OR NULLIF(TRIM(ept_db_password_enc), '') IS NULL
        OR NULLIF(TRIM(ept_service_layer_url), '') IS NULL
        OR NULLIF(TRIM(ept_tls_version), '') IS NULL
        OR NULLIF(TRIM(query_sistema), '') IS NULL
      )
  ) THEN
    RAISE NOTICE
      'La plantilla SAP_TARJETAS esta incompleta. Se buscara una configuracion SAP activa del mismo Service Layer; si no existe, la copia quedara inactiva.';
  END IF;
END;
$$;

-- Empresa. FG_TARJETA funciona como ID fiscal/codigo interno provisional.
INSERT INTO public.empresas (
  emp_id_fiscal,
  emp_nombre,
  emp_activa
)
VALUES (
  'FG_TARJETA',
  'FG TARJETA',
  TRUE
)
ON CONFLICT ((LOWER(emp_id_fiscal))) DO UPDATE
SET
  emp_nombre = EXCLUDED.emp_nombre,
  emp_activa = EXCLUDED.emp_activa,
  emp_updated_at = NOW();

-- Evita apropiarse accidentalmente de logins, emails o legajos de otra empresa,
-- y tambien detecta cruces entre usuarios distintos dentro de FG TARJETA.
DO $$
DECLARE
  target_company_id INTEGER;
  collision RECORD;
BEGIN
  SELECT emp_id
  INTO STRICT target_company_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('FG_TARJETA');

  SELECT
    u.usr_login AS existing_login,
    i.login AS requested_login
  INTO collision
  FROM public.usuarios u
  JOIN seed_fg_tarjeta_usuarios i
    ON LOWER(u.usr_login) = LOWER(i.login)
    OR LOWER(u.usr_email) = LOWER(i.email)
    OR LOWER(u.usr_legajo) = LOWER(i.legajo)
  WHERE u.emp_id <> target_company_id
     OR LOWER(u.usr_login) <> LOWER(i.login)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Conflicto de usuario: el registro existente % colisiona con el usuario solicitado %.',
      collision.existing_login,
      collision.requested_login;
  END IF;
END;
$$;

-- Usuarios activos. pgcrypto genera una sal bcrypt distinta por usuario (costo 12).
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('FG_TARJETA')
),
target_role AS (
  SELECT rol_id
  FROM public.roles
  WHERE LOWER(rol_codigo) = 'admin'
    AND rol_activo = TRUE
)
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
  i.nombre,
  i.apellido,
  i.email,
  NULL,
  i.login,
  i.legajo,
  crypt('123456', gen_salt('bf', 12)),
  TRUE,
  NULL,
  c.emp_id,
  r.rol_id
FROM seed_fg_tarjeta_usuarios i
CROSS JOIN target_company c
CROSS JOIN target_role r
ON CONFLICT ((LOWER(usr_login))) DO UPDATE
SET
  usr_nombre = EXCLUDED.usr_nombre,
  usr_apellido = EXCLUDED.usr_apellido,
  usr_email = EXCLUDED.usr_email,
  usr_legajo = EXCLUDED.usr_legajo,
  usr_activo = TRUE,
  emp_id = EXCLUDED.emp_id,
  rol_id = EXCLUDED.rol_id,
  usr_updated_at = NOW();

-- Habilita los modulos administrativos normales, incluido Pago de Tarjeta.
INSERT INTO public.empresas_roles_modulos (
  emp_id,
  rol_id,
  mod_id,
  erm_habilitado
)
SELECT
  e.emp_id,
  r.rol_id,
  m.mod_id,
  TRUE
FROM public.empresas e
JOIN public.roles r
  ON LOWER(r.rol_codigo) = 'admin'
 AND r.rol_activo = TRUE
JOIN public.modulos m
  ON LOWER(m.mod_codigo) IN (
    'home',
    'profile',
    'conciliation',
    'bank_conciliation',
    'card_payment',
    'users',
    'layout_management',
    'erp_management'
  )
 AND m.mod_activo = TRUE
WHERE LOWER(e.emp_id_fiscal) = LOWER('FG_TARJETA')
ON CONFLICT (emp_id, rol_id, mod_id) DO UPDATE
SET
  erm_habilitado = TRUE,
  erm_updated_at = NOW();

-- Prepara la conexion ERP con este orden:
--   1) plantilla SAP_TARJETAS, si ya esta completa;
--   2) configuracion SAP activa del mismo Service Layer, reutilizando solo sus
--      datos de conexion ya cifrados;
--   3) plantilla incompleta, pero con la copia INACTIVA para completarla por UI.
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('FG_TARJETA')
),
target_template AS (
  SELECT *
  FROM public.erp_configuraciones_plantillas
  WHERE LOWER(ept_codigo) = 'sap_tarjetas'
),
connection_candidates AS (
  SELECT
    1 AS source_priority,
    TRUE AS source_is_default,
    NULL::INTEGER AS source_config_id,
    t.ept_updated_at AS source_updated_at,
    t.ept_user_system AS user_system,
    t.ept_user_pass AS user_pass,
    t.ept_db_name AS db_name,
    t.ept_server_node AS server_node,
    t.ept_db_user AS db_user,
    t.ept_db_password_enc AS db_password_enc,
    t.ept_service_layer_url AS service_layer_url,
    t.ept_tls_version AS tls_version,
    t.ept_allow_self_signed AS allow_self_signed,
    t.ept_settings AS settings
  FROM target_template t
  WHERE t.ept_activo = TRUE
    AND NULLIF(TRIM(t.ept_db_name), '') IS NOT NULL
    AND NULLIF(TRIM(t.ept_server_node), '') IS NOT NULL
    AND NULLIF(TRIM(t.ept_db_user), '') IS NOT NULL
    AND NULLIF(TRIM(t.ept_db_password_enc), '') IS NOT NULL
    AND NULLIF(TRIM(t.ept_service_layer_url), '') IS NOT NULL
    AND NULLIF(TRIM(t.ept_tls_version), '') IS NOT NULL

  UNION ALL

  SELECT
    CASE
      WHEN LOWER(cfg.epc_codigo) = 'sap_tarjetas' THEN 2
      WHEN LOWER(cfg.epc_codigo) LIKE 'sap_b1%' THEN 3
      ELSE 4
    END AS source_priority,
    cfg.epc_es_predeterminado AS source_is_default,
    cfg.epc_id AS source_config_id,
    cfg.epc_updated_at AS source_updated_at,
    cfg.epc_user_system AS user_system,
    cfg.epc_user_pass AS user_pass,
    cfg.epc_db_name AS db_name,
    cfg.epc_server_node AS server_node,
    cfg.epc_db_user AS db_user,
    cfg.epc_db_password_enc AS db_password_enc,
    cfg.epc_service_layer_url AS service_layer_url,
    cfg.epc_tls_version AS tls_version,
    cfg.epc_allow_self_signed AS allow_self_signed,
    cfg.epc_settings AS settings
  FROM target_template t
  JOIN public.empresas_erp_configuraciones cfg
    ON cfg.epc_activo = TRUE
   AND LOWER(cfg.epc_codigo) LIKE 'sap%'
   AND NULLIF(TRIM(t.ept_service_layer_url), '') IS NOT NULL
   AND LOWER(RTRIM(BTRIM(cfg.epc_service_layer_url), '/')) =
       LOWER(RTRIM(BTRIM(t.ept_service_layer_url), '/'))
  JOIN public.empresas source_company
    ON source_company.emp_id = cfg.emp_id
   AND source_company.emp_activa = TRUE
  WHERE NULLIF(TRIM(cfg.epc_db_name), '') IS NOT NULL
    AND NULLIF(TRIM(cfg.epc_server_node), '') IS NOT NULL
    AND NULLIF(TRIM(cfg.epc_db_user), '') IS NOT NULL
    AND NULLIF(TRIM(cfg.epc_db_password_enc), '') IS NOT NULL
    AND NULLIF(TRIM(cfg.epc_service_layer_url), '') IS NOT NULL
    AND NULLIF(TRIM(cfg.epc_tls_version), '') IS NOT NULL
    AND LOWER(TRIM(cfg.epc_db_name)) = LOWER(TRIM(t.ept_db_name))
),
connection_source AS (
  SELECT *
  FROM connection_candidates
  ORDER BY
    source_priority,
    source_is_default DESC,
    source_updated_at DESC NULLS LAST,
    source_config_id ASC NULLS FIRST
  LIMIT 1
)
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
  t.ept_id,
  e.emp_id,
  'SAP_TARJETAS',
  t.ept_nombre,
  (s.source_priority IS NOT NULL),
  FALSE,
  CASE WHEN s.source_priority IS NOT NULL THEN s.user_system ELSE t.ept_user_system END,
  CASE WHEN s.source_priority IS NOT NULL THEN s.user_pass ELSE t.ept_user_pass END,
  CASE WHEN s.source_priority IS NOT NULL THEN s.db_name ELSE t.ept_db_name END,
  CASE WHEN s.source_priority IS NOT NULL THEN s.server_node ELSE t.ept_server_node END,
  t.query_banco,
  CASE
    WHEN NULLIF(TRIM(t.query_sistema), '') IS NOT NULL THEN t.query_sistema
    ELSE $SIS$
SELECT
  T0."AbsId",
  T0."VoucherNum",
  T0."PayDate",
  T0."CreditSum",
  T0."CreditCurr"
FROM "${CompanyDB}"."OCRH" T0
WHERE T0."Canceled" = 'N'
  AND T0."PayDate" BETWEEN $2 AND $3
$SIS$
  END,
  CASE WHEN s.source_priority IS NOT NULL THEN s.db_user ELSE t.ept_db_user END,
  CASE WHEN s.source_priority IS NOT NULL THEN s.db_password_enc ELSE t.ept_db_password_enc END,
  CASE WHEN s.source_priority IS NOT NULL THEN s.service_layer_url ELSE t.ept_service_layer_url END,
  CASE WHEN s.source_priority IS NOT NULL THEN s.tls_version ELSE t.ept_tls_version END,
  CASE
    WHEN s.source_priority IS NOT NULL THEN s.allow_self_signed
    ELSE COALESCE(t.ept_allow_self_signed, FALSE)
  END,
  COALESCE(s.settings, '{}'::jsonb) || COALESCE(t.ept_settings, '{}'::jsonb)
FROM target_company e
CROSS JOIN target_template t
LEFT JOIN connection_source s ON TRUE
ON CONFLICT (emp_id, LOWER(epc_codigo)) DO UPDATE
SET
  ept_id = EXCLUDED.ept_id,
  epc_nombre = EXCLUDED.epc_nombre,
  epc_activo = EXCLUDED.epc_activo,
  epc_es_predeterminado = EXCLUDED.epc_es_predeterminado,
  epc_user_system = EXCLUDED.epc_user_system,
  epc_user_pass = EXCLUDED.epc_user_pass,
  epc_db_name = EXCLUDED.epc_db_name,
  epc_server_node = EXCLUDED.epc_server_node,
  query_banco = EXCLUDED.query_banco,
  query_sistema = EXCLUDED.query_sistema,
  epc_db_user = EXCLUDED.epc_db_user,
  epc_db_password_enc = EXCLUDED.epc_db_password_enc,
  epc_service_layer_url = EXCLUDED.epc_service_layer_url,
  epc_tls_version = EXCLUDED.epc_tls_version,
  epc_allow_self_signed = EXCLUDED.epc_allow_self_signed,
  epc_settings = EXCLUDED.epc_settings,
  epc_updated_at = NOW()
WHERE empresas_erp_configuraciones.epc_activo IS NOT TRUE
  AND EXCLUDED.epc_activo = TRUE;

-- Verificaciones dentro de la misma transaccion.
DO $$
DECLARE
  inserted_user_count INTEGER;
  inserted_config_count INTEGER;
  enabled_module_count INTEGER;
  incomplete_config_fields TEXT;
  config_is_active BOOLEAN;
BEGIN
  SELECT COUNT(*)
  INTO inserted_user_count
  FROM public.usuarios u
  JOIN public.empresas e ON e.emp_id = u.emp_id
  JOIN seed_fg_tarjeta_usuarios i ON LOWER(i.login) = LOWER(u.usr_login)
  WHERE LOWER(e.emp_id_fiscal) = LOWER('FG_TARJETA')
    AND u.usr_activo = TRUE;

  IF inserted_user_count <> 9 THEN
    RAISE EXCEPTION 'Se esperaban 9 usuarios activos y se encontraron %.', inserted_user_count;
  END IF;

  SELECT COUNT(*)
  INTO inserted_config_count
  FROM public.empresas_erp_configuraciones c
  JOIN public.empresas e ON e.emp_id = c.emp_id
  WHERE LOWER(e.emp_id_fiscal) = LOWER('FG_TARJETA')
    AND LOWER(c.epc_codigo) = 'sap_tarjetas';

  IF inserted_config_count <> 1 THEN
    RAISE EXCEPTION
      'Se esperaba una configuracion SAP_TARJETAS y se encontraron %.',
      inserted_config_count;
  END IF;

  SELECT c.epc_activo
  INTO STRICT config_is_active
  FROM public.empresas_erp_configuraciones c
  JOIN public.empresas e ON e.emp_id = c.emp_id
  WHERE LOWER(e.emp_id_fiscal) = LOWER('FG_TARJETA')
    AND LOWER(c.epc_codigo) = 'sap_tarjetas';

  SELECT STRING_AGG(fields.field_name, ', ' ORDER BY fields.field_name)
  INTO incomplete_config_fields
  FROM public.empresas_erp_configuraciones c
  JOIN public.empresas e ON e.emp_id = c.emp_id
  CROSS JOIN LATERAL (
    VALUES
      ('epc_activo', c.epc_activo IS NOT TRUE),
      ('epc_db_name', NULLIF(TRIM(c.epc_db_name), '') IS NULL),
      ('epc_server_node', NULLIF(TRIM(c.epc_server_node), '') IS NULL),
      ('epc_db_user', NULLIF(TRIM(c.epc_db_user), '') IS NULL),
      ('epc_db_password_enc', NULLIF(TRIM(c.epc_db_password_enc), '') IS NULL),
      ('epc_service_layer_url', NULLIF(TRIM(c.epc_service_layer_url), '') IS NULL),
      ('epc_tls_version', NULLIF(TRIM(c.epc_tls_version), '') IS NULL),
      ('query_sistema', NULLIF(TRIM(c.query_sistema), '') IS NULL)
  ) AS fields(field_name, is_missing)
  WHERE LOWER(e.emp_id_fiscal) = LOWER('FG_TARJETA')
    AND LOWER(c.epc_codigo) = 'sap_tarjetas'
    AND fields.is_missing;

  IF config_is_active AND incomplete_config_fields IS NOT NULL THEN
    RAISE EXCEPTION
      'SAP_TARJETAS esta activa pero incompleta. Corregir desde Gestion ERP: %.',
      incomplete_config_fields;
  ELSIF NOT config_is_active THEN
    RAISE NOTICE
      'SAP_TARJETAS fue creada, pero queda inactiva/incompleta. Completar desde Gestion ERP: %.',
      COALESCE(incomplete_config_fields, 'epc_activo');
  END IF;

  SELECT COUNT(*)
  INTO enabled_module_count
  FROM public.empresas_roles_modulos erm
  JOIN public.empresas e ON e.emp_id = erm.emp_id
  JOIN public.roles r ON r.rol_id = erm.rol_id
  JOIN public.modulos m ON m.mod_id = erm.mod_id
  WHERE LOWER(e.emp_id_fiscal) = LOWER('FG_TARJETA')
    AND LOWER(r.rol_codigo) = 'admin'
    AND LOWER(m.mod_codigo) IN (
      'home',
      'profile',
      'conciliation',
      'bank_conciliation',
      'card_payment',
      'users',
      'layout_management',
      'erp_management'
    )
    AND erm.erm_habilitado = TRUE;

  IF enabled_module_count <> 8 THEN
    RAISE EXCEPTION 'Se esperaban 8 modulos admin habilitados y se encontraron %.', enabled_module_count;
  END IF;
END;
$$;

COMMIT;

-- Resultado final para revision manual.
SELECT
  e.emp_id,
  e.emp_id_fiscal,
  e.emp_nombre,
  u.usr_id,
  u.usr_nombre,
  u.usr_apellido,
  u.usr_login,
  u.usr_email,
  u.usr_legajo,
  r.rol_codigo,
  u.usr_activo
FROM public.empresas e
JOIN public.usuarios u ON u.emp_id = e.emp_id
JOIN public.roles r ON r.rol_id = u.rol_id
WHERE LOWER(e.emp_id_fiscal) = LOWER('FG_TARJETA')
ORDER BY u.usr_nombre, u.usr_apellido;

SELECT
  e.emp_id,
  e.emp_nombre,
  c.epc_id,
  c.epc_codigo,
  c.epc_nombre,
  c.epc_activo,
  c.epc_es_predeterminado,
  c.ept_id,
  c.epc_db_name,
  c.epc_server_node,
  c.epc_service_layer_url,
  (
    c.epc_activo = TRUE
    AND NULLIF(TRIM(c.epc_db_name), '') IS NOT NULL
    AND NULLIF(TRIM(c.epc_server_node), '') IS NOT NULL
    AND NULLIF(TRIM(c.epc_db_user), '') IS NOT NULL
    AND NULLIF(TRIM(c.epc_db_password_enc), '') IS NOT NULL
    AND NULLIF(TRIM(c.epc_service_layer_url), '') IS NOT NULL
    AND NULLIF(TRIM(c.epc_tls_version), '') IS NOT NULL
    AND NULLIF(TRIM(c.query_sistema), '') IS NOT NULL
  ) AS configuracion_operativa,
  (c.epc_db_user IS NOT NULL) AS tiene_usuario_hana,
  (c.epc_db_password_enc IS NOT NULL) AS tiene_password_hana,
  (c.query_sistema IS NOT NULL) AS tiene_query_sistema
FROM public.empresas e
JOIN public.empresas_erp_configuraciones c ON c.emp_id = e.emp_id
WHERE LOWER(e.emp_id_fiscal) = LOWER('FG_TARJETA')
  AND LOWER(c.epc_codigo) = 'sap_tarjetas';
