-- =============================================================================
-- Diagnostico SOLO LECTURA del acceso de los administradores QA de FG.
--
-- No inserta, actualiza ni elimina datos. No muestra hashes ni credenciales
-- ERP. Comprueba si la contrasena inicial configurada en 57/58 coincide con
-- el hash almacenado y si el usuario/empresa estan activos.
-- =============================================================================

-- La API de Qoncilia autentica por usr_login o usr_email; no por usr_legajo.
-- Deben devolverse exactamente dos filas y todas las comprobaciones deben ser
-- TRUE / OK. La columna hash_prefix debe comenzar con $2a$, $2b$ o $2y$.
WITH expected (company_code, login, initial_password) AS (
  VALUES
    ('5629621_QA', 'qa.conciliacion.admin', 'Qoncilia.QA.2026!'),
    ('FG_TARJETA_QA', 'qa.tarjetas.admin', 'Qoncilia.QA.2026!')
)
SELECT
  current_database() AS base_actual,
  expected.company_code AS empresa_esperada,
  expected.login AS login_esperado,
  company.emp_id_fiscal AS empresa_encontrada,
  user_account.usr_id AS usuario_id,
  user_account.usr_login AS usuario_encontrado,
  user_account.usr_email AS email,
  user_account.usr_activo AS usuario_activo,
  company.emp_activa AS empresa_activa,
  role.rol_codigo AS rol,
  role.rol_activo AS rol_activo,
  LEFT(COALESCE(user_account.usr_password_hash, ''), 4) AS hash_prefix,
  CASE
    WHEN user_account.usr_password_hash IS NULL
      OR BTRIM(user_account.usr_password_hash) = '' THEN FALSE
    ELSE crypt(expected.initial_password, user_account.usr_password_hash)
      = user_account.usr_password_hash
  END AS password_inicial_valida,
  CASE
    WHEN user_account.usr_id IS NULL THEN 'ERROR: usuario QA no existe'
    WHEN company.emp_id IS NULL THEN 'ERROR: empresa QA no existe'
    WHEN user_account.usr_activo IS NOT TRUE THEN 'ERROR: usuario inactivo'
    WHEN company.emp_activa IS NOT TRUE THEN 'ERROR: empresa inactiva'
    WHEN role.rol_activo IS NOT TRUE THEN 'ERROR: rol inactivo'
    WHEN user_account.usr_password_hash IS NULL
      OR BTRIM(user_account.usr_password_hash) = '' THEN 'ERROR: hash ausente'
    WHEN crypt(expected.initial_password, user_account.usr_password_hash)
      <> user_account.usr_password_hash THEN 'ERROR: la contrasena no coincide'
    ELSE 'OK'
  END AS resultado
FROM expected
LEFT JOIN public.empresas company
  ON LOWER(BTRIM(company.emp_id_fiscal)) = LOWER(expected.company_code)
LEFT JOIN public.usuarios user_account
  ON user_account.emp_id = company.emp_id
 AND LOWER(BTRIM(user_account.usr_login)) = LOWER(expected.login)
LEFT JOIN public.roles role ON role.rol_id = user_account.rol_id
ORDER BY expected.company_code;

-- Comprobacion de unicidad global: ningun usuario igual debe estar asociado a
-- otra empresa. Si devuelve filas, el login esta duplicado o apunta a otro
-- tenant y debe corregirse antes de probar nuevamente.
SELECT
  user_account.usr_id,
  user_account.usr_login,
  user_account.usr_email,
  company.emp_id_fiscal AS empresa,
  user_account.usr_activo AS usuario_activo
FROM public.usuarios user_account
JOIN public.empresas company ON company.emp_id = user_account.emp_id
WHERE LOWER(BTRIM(user_account.usr_login)) IN (
  'qa.conciliacion.admin',
  'qa.tarjetas.admin'
)
ORDER BY user_account.usr_login, company.emp_id_fiscal;
