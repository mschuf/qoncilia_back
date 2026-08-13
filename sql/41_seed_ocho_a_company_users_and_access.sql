-- =============================================================================
-- Provisionamiento manual de OCHO A.
--
-- Crea/actualiza la empresa OCHO A (codigo fiscal/interno: OCHO_A), sus tres
-- usuarios administradores y los accesos operativos solicitados:
--   * Cargar extractos        -> conciliation
--   * Conciliacion de banco   -> bank_conciliation
--   * Pago de tarjeta         -> card_payment
--
-- Tambien deja disponible para toda la empresa la plantilla base existente
-- "Base Continental vs SAP B1".
--
-- No crea banco ni cuenta bancaria: para ello se requieren el numero de cuenta
-- real y la cuenta mayor SAP, datos que no fueron proporcionados. Una vez que
-- se cree el banco Continental desde la aplicacion, la plantilla ya aparecera
-- habilitada para OCHO A.
--
-- Requisitos: esquema hasta sql/39 y la plantilla Continental ya cargada.
-- El script es idempotente. En reejecuciones NO restablece contrasenas de
-- usuarios existentes; 12345678 se asigna solamente al crear cada usuario.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TEMP TABLE seed_ocho_a_usuarios (
  nombre VARCHAR(120) NOT NULL,
  apellido VARCHAR(120) NOT NULL,
  login VARCHAR(80) PRIMARY KEY,
  legajo VARCHAR(50) NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO seed_ocho_a_usuarios (nombre, apellido, login, legajo)
VALUES
  ('Amalia', 'Ochoa', 'amalia.ochoa', 'amalia.ochoa'),
  ('Lorena', 'Ochoa', 'lorena.ochoa', 'lorena.ochoa'),
  ('Daysi',  'Ochoa', 'daysi.ochoa',  'daysi.ochoa');

-- Validaciones previas para no asociar registros existentes de otra empresa
-- ni aplicar una plantilla equivocada.
DO $$
DECLARE
  missing_modules TEXT;
  continental_template_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(TRIM(emp_nombre)) = LOWER('OCHO A')
      AND LOWER(TRIM(emp_id_fiscal)) <> LOWER('OCHO_A')
  ) THEN
    RAISE EXCEPTION
      'Ya existe una empresa llamada OCHO A con otro ID fiscal. Revisa OCHO_A antes de ejecutar.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('OCHO_A')
      AND LOWER(TRIM(emp_nombre)) <> LOWER('OCHO A')
  ) THEN
    RAISE EXCEPTION
      'El ID fiscal OCHO_A ya pertenece a otra empresa. Revisa el codigo antes de ejecutar.';
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
      ('card_payment')
  ) AS required(mod_codigo)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.modulos m
    WHERE LOWER(m.mod_codigo) = required.mod_codigo
      AND m.mod_activo = TRUE
  );

  IF missing_modules IS NOT NULL THEN
    RAISE EXCEPTION
      'Faltan modulos activos requeridos: %. Ejecuta primero el seed de modulos correspondiente.',
      missing_modules;
  END IF;

  IF to_regclass('public.usuarios_plantillas_base_disponibles') IS NULL THEN
    RAISE EXCEPTION
      'No existe usuarios_plantillas_base_disponibles. Ejecuta antes sql/18_create_user_template_availability.sql.';
  END IF;

  SELECT COUNT(*)
  INTO continental_template_count
  FROM public.plantillas_base
  WHERE LOWER(TRIM(plantilla_base_nombre)) = LOWER('Base Continental vs SAP B1')
    AND plantilla_base_activa = TRUE;

  IF continental_template_count <> 1 THEN
    RAISE EXCEPTION
      'Debe existir exactamente una plantilla base activa "Base Continental vs SAP B1"; encontradas: %.',
      continental_template_count;
  END IF;
END;
$$;

INSERT INTO public.empresas (
  emp_id_fiscal,
  emp_nombre,
  emp_activa
)
VALUES (
  'OCHO_A',
  'OCHO A',
  TRUE
)
ON CONFLICT ((LOWER(emp_id_fiscal))) DO UPDATE
SET
  emp_nombre = EXCLUDED.emp_nombre,
  emp_activa = EXCLUDED.emp_activa,
  emp_updated_at = NOW();

-- Detecta conflictos de login o legajo antes del UPSERT de usuarios.
DO $$
DECLARE
  target_company_id INTEGER;
  collision RECORD;
BEGIN
  SELECT emp_id
  INTO STRICT target_company_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('OCHO_A');

  SELECT
    u.usr_login AS existing_login,
    i.login AS requested_login
  INTO collision
  FROM public.usuarios u
  JOIN seed_ocho_a_usuarios i
    ON LOWER(u.usr_login) = LOWER(i.login)
    OR LOWER(u.usr_legajo) = LOWER(i.legajo)
  WHERE u.emp_id <> target_company_id
     OR LOWER(u.usr_login) <> LOWER(i.login)
     OR LOWER(u.usr_legajo) <> LOWER(i.legajo)
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Conflicto de usuario: el registro existente % colisiona con el usuario solicitado %.',
      collision.existing_login,
      collision.requested_login;
  END IF;
END;
$$;

-- Usuarios activos con rol admin. El email y celular quedan NULL porque no se
-- proporcionaron; son campos opcionales en el esquema.
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('OCHO_A')
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
  NULL,
  NULL,
  i.login,
  i.legajo,
  crypt('12345678', gen_salt('bf', 12)),
  TRUE,
  NULL,
  c.emp_id,
  r.rol_id
FROM seed_ocho_a_usuarios i
CROSS JOIN target_company c
CROSS JOIN target_role r
ON CONFLICT ((LOWER(usr_login))) DO UPDATE
SET
  usr_nombre = EXCLUDED.usr_nombre,
  usr_apellido = EXCLUDED.usr_apellido,
  usr_activo = TRUE,
  emp_id = EXCLUDED.emp_id,
  rol_id = EXCLUDED.rol_id,
  usr_updated_at = NOW();

-- Los permisos se guardan por empresa y rol. Home y Perfil se incluyen como
-- navegacion basica; los otros tres son exactamente los modulos solicitados.
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
    'card_payment'
  )
 AND m.mod_activo = TRUE
WHERE LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
ON CONFLICT (emp_id, rol_id, mod_id) DO UPDATE
SET
  erm_habilitado = TRUE,
  erm_updated_at = NOW();

-- En el modelo vigente esta disponibilidad se persiste por usuario, pero el
-- backend la consume por empresa. Se habilita para los tres usuarios de OCHO A.
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('OCHO_A')
),
target_template AS (
  SELECT plantilla_base_id
  FROM public.plantillas_base
  WHERE LOWER(TRIM(plantilla_base_nombre)) = LOWER('Base Continental vs SAP B1')
    AND plantilla_base_activa = TRUE
)
INSERT INTO public.usuarios_plantillas_base_disponibles (
  usuario_id,
  plantilla_base_id
)
SELECT
  u.usr_id,
  t.plantilla_base_id
FROM public.usuarios u
JOIN target_company c
  ON c.emp_id = u.emp_id
JOIN seed_ocho_a_usuarios i
  ON LOWER(i.login) = LOWER(u.usr_login)
CROSS JOIN target_template t
ON CONFLICT (usuario_id, plantilla_base_id) DO NOTHING;

-- Verificacion posterior (solo lectura).
SELECT
  e.emp_id_fiscal AS empresa_codigo,
  e.emp_nombre AS empresa_nombre,
  u.usr_login AS usuario,
  r.rol_codigo AS rol,
  ARRAY_AGG(DISTINCT m.mod_codigo ORDER BY m.mod_codigo)
    FILTER (WHERE erm.erm_habilitado) AS modulos_habilitados,
  BOOL_OR(
    LOWER(TRIM(t.plantilla_base_nombre)) = LOWER('Base Continental vs SAP B1')
  ) AS plantilla_continental_habilitada
FROM public.empresas e
JOIN public.usuarios u
  ON u.emp_id = e.emp_id
JOIN public.roles r
  ON r.rol_id = u.rol_id
LEFT JOIN public.empresas_roles_modulos erm
  ON erm.emp_id = e.emp_id
 AND erm.rol_id = r.rol_id
LEFT JOIN public.modulos m
  ON m.mod_id = erm.mod_id
LEFT JOIN public.usuarios_plantillas_base_disponibles availability
  ON availability.usuario_id = u.usr_id
LEFT JOIN public.plantillas_base t
  ON t.plantilla_base_id = availability.plantilla_base_id
WHERE LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
  AND LOWER(u.usr_login) IN (
    'amalia.ochoa',
    'lorena.ochoa',
    'daysi.ochoa'
  )
GROUP BY e.emp_id_fiscal, e.emp_nombre, u.usr_login, r.rol_codigo
ORDER BY u.usr_login;

COMMIT;
