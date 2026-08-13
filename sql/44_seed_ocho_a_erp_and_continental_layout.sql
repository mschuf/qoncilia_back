-- =============================================================================
-- ERP y plantilla Continental operativa para OCHO A.
--
-- 1) Copia a OCHO A las configuraciones ERP SAP ACTIVAS de FG TARJETA
--    (SAP_B1 y/o SAP_TARJETAS), incluidos los valores cifrados ya existentes.
--    No inserta ni expone contrasenas en texto plano.
--
-- 2) Habilita la plantilla base Continental para los usuarios activos de OCHO A
--    y crea/activa el layout operativo Continental en el banco de OCHO A,
--    copiando todos los mapeos de la plantilla base.
--
-- Ejecutar DESPUES de 43_seed_ocho_a_continental_accounts.sql.
-- El script es idempotente. Solo reemplaza una configuracion ERP de OCHO A si
-- esta inactiva; una configuracion activa existente no se sobrescribe.
-- =============================================================================

BEGIN;

-- Validaciones previas para evitar usar una empresa, banco o plantilla ambiguos.
DO $$
DECLARE
  continental_bank_count INTEGER;
  continental_template_count INTEGER;
  continental_mapping_count INTEGER;
  active_source_erp_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('OCHO_A')
      AND LOWER(TRIM(emp_nombre)) = LOWER('OCHO A')
      AND emp_activa = TRUE
  ) THEN
    RAISE EXCEPTION 'No existe la empresa activa OCHO A (OCHO_A).';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE LOWER(TRIM(emp_id_fiscal)) = LOWER('FG_TARJETA')
      AND emp_activa = TRUE
  ) THEN
    RAISE EXCEPTION 'No existe la empresa activa FG_TARJETA para usarla como origen ERP.';
  END IF;

  SELECT COUNT(*)
  INTO continental_bank_count
  FROM public.bancos b
  JOIN public.empresas e ON e.emp_id = b.empresa_id
  WHERE LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
    AND b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental');

  IF continental_bank_count <> 1 THEN
    RAISE EXCEPTION
      'Se espera exactamente un banco Continental origen para OCHO A; encontrados: %. Ejecuta primero el script 43 o revisa los bancos.',
      continental_bank_count;
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

  SELECT COUNT(*)
  INTO continental_mapping_count
  FROM public.plantillas_base_mapeos m
  JOIN public.plantillas_base p ON p.plantilla_base_id = m.plantilla_base_id
  WHERE LOWER(TRIM(p.plantilla_base_nombre)) = LOWER('Base Continental vs SAP B1');

  IF continental_mapping_count = 0 THEN
    RAISE EXCEPTION
      'La plantilla base Continental no tiene mapeos. Ejecuta antes el seed de plantillas correspondiente.';
  END IF;

  SELECT COUNT(*)
  INTO active_source_erp_count
  FROM public.empresas_erp_configuraciones cfg
  JOIN public.empresas e ON e.emp_id = cfg.emp_id
  WHERE LOWER(e.emp_id_fiscal) = LOWER('FG_TARJETA')
    AND cfg.epc_activo = TRUE
    AND LOWER(cfg.epc_codigo) LIKE 'sap%';

  IF active_source_erp_count = 0 THEN
    RAISE EXCEPTION 'FG_TARJETA no tiene una configuracion ERP SAP activa para copiar.';
  END IF;
END;
$$;

-- La disponibilidad se persiste por usuario; el backend la utiliza a nivel de
-- empresa. Se asegura para todos los usuarios activos actuales de OCHO A.
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('OCHO_A')
),
continental_template AS (
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
JOIN target_company c ON c.emp_id = u.emp_id
CROSS JOIN continental_template t
WHERE u.usr_activo = TRUE
ON CONFLICT (usuario_id, plantilla_base_id) DO NOTHING;

-- Solo un layout puede estar activo por banco. Continental pasa a ser el layout
-- activo del banco de OCHO A.
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('OCHO_A')
),
target_bank AS (
  SELECT b.banco_id
  FROM public.bancos b
  JOIN target_company c ON c.emp_id = b.empresa_id
  WHERE b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental')
)
UPDATE public.plantillas_conciliacion l
SET
  plantilla_activa = FALSE,
  plantilla_actualizada_en = NOW()
FROM target_bank b
WHERE l.banco_id = b.banco_id
  AND l.plantilla_activa = TRUE;

-- Actualiza un layout Continental existente o crea uno nuevo desde la plantilla
-- base global. La plantilla base es comun a todas las empresas; contiene los
-- mismos mapeos que se aplican a Continental en otras empresas.
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('OCHO_A')
),
target_bank AS (
  SELECT b.banco_id, b.banco_nombre
  FROM public.bancos b
  JOIN target_company c ON c.emp_id = b.empresa_id
  WHERE b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental')
),
continental_template AS (
  SELECT *
  FROM public.plantillas_base
  WHERE LOWER(TRIM(plantilla_base_nombre)) = LOWER('Base Continental vs SAP B1')
    AND plantilla_base_activa = TRUE
)
UPDATE public.plantillas_conciliacion l
SET
  plantilla_nombre = 'Continental vs SAP B1',
  plantilla_descripcion = COALESCE(t.plantilla_base_descripcion, 'Plantilla Continental para conciliacion bancaria.'),
  plantilla_etiqueta_sistema = t.plantilla_base_etiqueta_sistema,
  plantilla_etiqueta_banco = b.banco_nombre,
  plantilla_umbral_auto_match = t.plantilla_base_umbral_auto_match,
  plantilla_monto_modo = t.plantilla_base_monto_modo,
  plantilla_activa = TRUE,
  plantilla_actualizada_en = NOW()
FROM target_bank b
CROSS JOIN continental_template t
WHERE l.banco_id = b.banco_id
  AND l.plantilla_base_id = t.plantilla_base_id;

WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('OCHO_A')
),
target_bank AS (
  SELECT b.banco_id, b.banco_nombre
  FROM public.bancos b
  JOIN target_company c ON c.emp_id = b.empresa_id
  WHERE b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental')
),
continental_template AS (
  SELECT *
  FROM public.plantillas_base
  WHERE LOWER(TRIM(plantilla_base_nombre)) = LOWER('Base Continental vs SAP B1')
    AND plantilla_base_activa = TRUE
)
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
)
SELECT
  b.banco_id,
  t.plantilla_base_id,
  'Continental vs SAP B1',
  COALESCE(t.plantilla_base_descripcion, 'Plantilla Continental para conciliacion bancaria.'),
  t.plantilla_base_etiqueta_sistema,
  b.banco_nombre,
  t.plantilla_base_umbral_auto_match,
  t.plantilla_base_monto_modo,
  TRUE
FROM target_bank b
CROSS JOIN continental_template t
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plantillas_conciliacion l
  WHERE l.banco_id = b.banco_id
    AND l.plantilla_base_id = t.plantilla_base_id
);

-- Agrega los mapeos que falten al layout Continental sin sobrescribir cambios
-- manuales que ya hubieran sido realizados sobre mapeos existentes.
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('OCHO_A')
),
target_bank AS (
  SELECT b.banco_id
  FROM public.bancos b
  JOIN target_company c ON c.emp_id = b.empresa_id
  WHERE b.banco_origen_id IS NULL
    AND REGEXP_REPLACE(LOWER(b.banco_nombre), '[^a-z0-9]+', '', 'g')
      IN ('continental', 'bancocontinental')
),
continental_template AS (
  SELECT plantilla_base_id
  FROM public.plantillas_base
  WHERE LOWER(TRIM(plantilla_base_nombre)) = LOWER('Base Continental vs SAP B1')
    AND plantilla_base_activa = TRUE
),
target_layout AS (
  SELECT l.plantilla_id, l.plantilla_base_id
  FROM public.plantillas_conciliacion l
  JOIN target_bank b ON b.banco_id = l.banco_id
  JOIN continental_template t ON t.plantilla_base_id = l.plantilla_base_id
)
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
  l.plantilla_id,
  m.mapeo_base_clave_campo,
  m.mapeo_base_etiqueta,
  m.mapeo_base_orden,
  m.mapeo_base_activo,
  m.mapeo_base_requerido,
  m.mapeo_base_operador_comparacion,
  m.mapeo_base_peso,
  m.mapeo_base_tolerancia,
  m.sistema_hoja,
  m.sistema_columna,
  m.sistema_fila_inicio,
  m.sistema_fila_fin,
  m.sistema_tipo_dato,
  m.banco_hoja,
  m.banco_columna,
  m.banco_fila_inicio,
  m.banco_fila_fin,
  m.banco_tipo_dato
FROM target_layout l
JOIN public.plantillas_base_mapeos m
  ON m.plantilla_base_id = l.plantilla_base_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.plantillas_conciliacion_mapeos existing
  WHERE existing.plantilla_id = l.plantilla_id
    AND LOWER(existing.mapeo_clave_campo) = LOWER(m.mapeo_base_clave_campo)
);

-- Copia las configuraciones SAP activas de FG TARJETA. Las credenciales ya
-- cifradas se trasladan tal cual; nunca se descifran ni se escriben en claro.
WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('OCHO_A')
),
source_configs AS (
  SELECT cfg.*
  FROM public.empresas_erp_configuraciones cfg
  JOIN public.empresas source_company ON source_company.emp_id = cfg.emp_id
  WHERE LOWER(source_company.emp_id_fiscal) = LOWER('FG_TARJETA')
    AND source_company.emp_activa = TRUE
    AND cfg.epc_activo = TRUE
    AND LOWER(cfg.epc_codigo) LIKE 'sap%'
)
UPDATE public.empresas_erp_configuraciones target
SET
  ept_id = source.ept_id,
  epc_nombre = source.epc_nombre,
  epc_activo = TRUE,
  epc_user_system = source.epc_user_system,
  epc_user_pass = source.epc_user_pass,
  epc_db_name = source.epc_db_name,
  epc_server_node = source.epc_server_node,
  query_banco = source.query_banco,
  query_sistema = source.query_sistema,
  epc_db_user = source.epc_db_user,
  epc_db_password_enc = source.epc_db_password_enc,
  epc_service_layer_url = source.epc_service_layer_url,
  epc_tls_version = source.epc_tls_version,
  epc_allow_self_signed = source.epc_allow_self_signed,
  epc_settings = source.epc_settings,
  epc_updated_at = NOW()
FROM target_company company
JOIN source_configs source ON TRUE
WHERE target.emp_id = company.emp_id
  AND LOWER(target.epc_codigo) = LOWER(source.epc_codigo)
  AND target.epc_activo IS NOT TRUE;

WITH target_company AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(emp_id_fiscal) = LOWER('OCHO_A')
),
source_configs AS (
  SELECT cfg.*
  FROM public.empresas_erp_configuraciones cfg
  JOIN public.empresas source_company ON source_company.emp_id = cfg.emp_id
  WHERE LOWER(source_company.emp_id_fiscal) = LOWER('FG_TARJETA')
    AND source_company.emp_activa = TRUE
    AND cfg.epc_activo = TRUE
    AND LOWER(cfg.epc_codigo) LIKE 'sap%'
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
  source.ept_id,
  company.emp_id,
  source.epc_codigo,
  source.epc_nombre,
  TRUE,
  FALSE,
  source.epc_user_system,
  source.epc_user_pass,
  source.epc_db_name,
  source.epc_server_node,
  source.query_banco,
  source.query_sistema,
  source.epc_db_user,
  source.epc_db_password_enc,
  source.epc_service_layer_url,
  source.epc_tls_version,
  source.epc_allow_self_signed,
  source.epc_settings
FROM target_company company
CROSS JOIN source_configs source
WHERE NOT EXISTS (
  SELECT 1
  FROM public.empresas_erp_configuraciones target
  WHERE target.emp_id = company.emp_id
    AND LOWER(target.epc_codigo) = LOWER(source.epc_codigo)
);

-- Verificacion posterior (solo lectura): ERP activas, layout Continental y sus
-- mapeos para confirmar que la pantalla ya no quede sin plantilla.
SELECT
  'ERP' AS tipo,
  cfg.epc_codigo AS codigo,
  cfg.epc_nombre AS nombre,
  cfg.epc_activo AS activo,
  NULL::INTEGER AS cantidad_mapeos
FROM public.empresas_erp_configuraciones cfg
JOIN public.empresas e ON e.emp_id = cfg.emp_id
WHERE LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
  AND cfg.epc_activo = TRUE

UNION ALL

SELECT
  'PLANTILLA_CONTINENTAL' AS tipo,
  l.plantilla_id::TEXT AS codigo,
  l.plantilla_nombre AS nombre,
  l.plantilla_activa AS activo,
  COUNT(m.mapeo_id)::INTEGER AS cantidad_mapeos
FROM public.plantillas_conciliacion l
JOIN public.bancos b ON b.banco_id = l.banco_id
JOIN public.empresas e ON e.emp_id = b.empresa_id
LEFT JOIN public.plantillas_conciliacion_mapeos m ON m.plantilla_id = l.plantilla_id
WHERE LOWER(e.emp_id_fiscal) = LOWER('OCHO_A')
  AND LOWER(l.plantilla_nombre) = LOWER('Continental vs SAP B1')
GROUP BY l.plantilla_id, l.plantilla_nombre, l.plantilla_activa;

COMMIT;
