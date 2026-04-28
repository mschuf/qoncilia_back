-- Seed opcional de bancos, cuentas y plantillas GNB/Itau.
-- Reemplazar <<USER_LOGIN>> por el login del admin destino. Si queda sin reemplazar,
-- usa el primer usuario activo disponible.

DO $$
DECLARE
  requested_login TEXT := '<<USER_LOGIN>>';
  target_user_id INTEGER;
  target_user_login TEXT;
  target_company_id INTEGER;
  sistema_sap_id INTEGER;
  banco_gnb_id INTEGER;
  banco_itau_id INTEGER;
  plantilla_base_gnb_id INTEGER;
  plantilla_base_gnb_443_id INTEGER;
  plantilla_base_gnb3_id INTEGER;
  plantilla_base_itau_id INTEGER;
  plantilla_gnb_id INTEGER;
  plantilla_gnb_443_id INTEGER;
  plantilla_gnb3_id INTEGER;
  plantilla_itau_id INTEGER;
BEGIN
  IF requested_login IS NOT NULL
     AND btrim(requested_login) <> ''
     AND requested_login <> '<<USER_LOGIN>>' THEN
    SELECT usr_id, usr_login, emp_id
    INTO target_user_id, target_user_login, target_company_id
    FROM public.usuarios
    WHERE LOWER(usr_login) = LOWER(requested_login)
    ORDER BY usr_id ASC
    LIMIT 1;
  END IF;

  IF target_user_id IS NULL THEN
    SELECT usr_id, usr_login, emp_id
    INTO target_user_id, target_user_login, target_company_id
    FROM public.usuarios
    ORDER BY
      CASE WHEN usr_activo = TRUE THEN 1 ELSE 2 END,
      usr_id ASC
    LIMIT 1;
  END IF;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No existe ningun usuario en public.usuarios para aplicar el seed.';
  END IF;

  INSERT INTO public.sistemas (sistema_nombre, sistema_descripcion, sistema_activo)
  VALUES ('SAP', 'Sistema base creado automaticamente por seeds de Qoncilia.', TRUE)
  ON CONFLICT DO NOTHING;

  SELECT sistema_id INTO sistema_sap_id
  FROM public.sistemas
  WHERE LOWER(sistema_nombre) = LOWER('SAP')
  LIMIT 1;

  INSERT INTO public.bancos (
    empresa_id,
    usuario_id,
    banco_nombre,
    banco_alias,
    banco_descripcion,
    banco_activo
  )
  VALUES
    (target_company_id, target_user_id, 'GNB', 'GNB PYG', 'Extractos GNB PYG', TRUE),
    (target_company_id, target_user_id, 'Itau', 'Itau PYG', 'Extractos Itau PYG', TRUE)
  ON CONFLICT DO NOTHING;

  SELECT banco_id INTO banco_gnb_id
  FROM public.bancos
  WHERE usuario_id = target_user_id AND LOWER(banco_nombre) = LOWER('GNB')
  LIMIT 1;

  SELECT banco_id INTO banco_itau_id
  FROM public.bancos
  WHERE usuario_id = target_user_id AND LOWER(banco_nombre) = LOWER('Itau')
  LIMIT 1;

  INSERT INTO public.cuentas_bancarias (
    empresa_id,
    banco_id,
    cuenta_bancaria_nombre,
    moneda_codigo,
    cuenta_bancaria_numero,
    cuenta_bancaria_id_banco_erp,
    cuenta_bancaria_numero_mayor,
    cuenta_bancaria_numero_pago,
    cuenta_bancaria_activa
  )
  VALUES
    (target_company_id, banco_gnb_id, 'Cuenta corriente GNB PYG', 'PYG', 'GNB-PYG-001', 'GNB', '1110201', NULL, TRUE),
    (target_company_id, banco_itau_id, 'Cuenta corriente Itau PYG', 'PYG', 'ITAU-PYG-001', 'ITAU', '1110202', NULL, TRUE)
  ON CONFLICT ON CONSTRAINT uq_cuentas_bancarias_empresa_banco_numero DO NOTHING;

  INSERT INTO public.plantillas_base (
    plantilla_base_nombre,
    plantilla_base_descripcion,
    plantilla_base_banco_referencia,
    sistema_id,
    plantilla_base_etiqueta_sistema,
    plantilla_base_etiqueta_banco,
    plantilla_base_umbral_auto_match,
    plantilla_base_activa
  )
  VALUES
    ('Base GNB vs SAP B1', 'Plantilla base para hoja GNB.', 'GNB', sistema_sap_id, 'SAP B1', 'GNB', 0.75, TRUE),
    ('Base GNB-443 vs SAP B1', 'Plantilla base para hoja GNB-443.', 'GNB-443', sistema_sap_id, 'SAP B1', 'GNB-443', 0.75, TRUE),
    ('Base GNB3 vs SAP B1', 'Plantilla base para hoja GNB3.', 'GNB3', sistema_sap_id, 'SAP B1', 'GNB3', 0.75, TRUE),
    ('Base Itau vs SAP B1', 'Plantilla base para extractos Itau.', 'Itau CC', sistema_sap_id, 'SAP B1', 'Itau CC', 0.75, TRUE)
  ON CONFLICT DO NOTHING;

  SELECT plantilla_base_id INTO plantilla_base_gnb_id
  FROM public.plantillas_base
  WHERE LOWER(plantilla_base_nombre) = LOWER('Base GNB vs SAP B1')
  LIMIT 1;

  SELECT plantilla_base_id INTO plantilla_base_gnb_443_id
  FROM public.plantillas_base
  WHERE LOWER(plantilla_base_nombre) = LOWER('Base GNB-443 vs SAP B1')
  LIMIT 1;

  SELECT plantilla_base_id INTO plantilla_base_gnb3_id
  FROM public.plantillas_base
  WHERE LOWER(plantilla_base_nombre) = LOWER('Base GNB3 vs SAP B1')
  LIMIT 1;

  SELECT plantilla_base_id INTO plantilla_base_itau_id
  FROM public.plantillas_base
  WHERE LOWER(plantilla_base_nombre) = LOWER('Base Itau vs SAP B1')
  LIMIT 1;

  INSERT INTO public.plantillas_conciliacion (
    banco_id,
    plantilla_base_id,
    sistema_id,
    plantilla_nombre,
    plantilla_descripcion,
    plantilla_etiqueta_sistema,
    plantilla_etiqueta_banco,
    plantilla_umbral_auto_match,
    plantilla_activa
  )
  VALUES
    (banco_gnb_id, plantilla_base_gnb_id, sistema_sap_id, 'GNB vs SAP B1', 'Comparacion GNB contra SAP B1.', 'SAP B1', 'GNB', 0.75, TRUE),
    (banco_gnb_id, plantilla_base_gnb_443_id, sistema_sap_id, 'GNB-443 vs SAP B1', 'Comparacion GNB-443 contra SAP B1.', 'SAP B1', 'GNB-443', 0.75, FALSE),
    (banco_gnb_id, plantilla_base_gnb3_id, sistema_sap_id, 'GNB3 vs SAP B1', 'Comparacion GNB3 contra SAP B1.', 'SAP B1', 'GNB3', 0.75, FALSE),
    (banco_itau_id, plantilla_base_itau_id, sistema_sap_id, 'Itau vs SAP B1', 'Comparacion Itau contra SAP B1.', 'SAP B1', 'Itau CC', 0.75, TRUE)
  ON CONFLICT DO NOTHING;

  SELECT plantilla_id INTO plantilla_gnb_id
  FROM public.plantillas_conciliacion
  WHERE banco_id = banco_gnb_id AND LOWER(plantilla_nombre) = LOWER('GNB vs SAP B1')
  LIMIT 1;

  SELECT plantilla_id INTO plantilla_gnb_443_id
  FROM public.plantillas_conciliacion
  WHERE banco_id = banco_gnb_id AND LOWER(plantilla_nombre) = LOWER('GNB-443 vs SAP B1')
  LIMIT 1;

  SELECT plantilla_id INTO plantilla_gnb3_id
  FROM public.plantillas_conciliacion
  WHERE banco_id = banco_gnb_id AND LOWER(plantilla_nombre) = LOWER('GNB3 vs SAP B1')
  LIMIT 1;

  SELECT plantilla_id INTO plantilla_itau_id
  FROM public.plantillas_conciliacion
  WHERE banco_id = banco_itau_id AND LOWER(plantilla_nombre) = LOWER('Itau vs SAP B1')
  LIMIT 1;

  DELETE FROM public.plantillas_conciliacion_mapeos
  WHERE plantilla_id IN (plantilla_gnb_id, plantilla_gnb_443_id, plantilla_gnb3_id, plantilla_itau_id);

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
  VALUES
    (plantilla_gnb_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'GNB', 'C', 15, 5000, 'date'),
    (plantilla_gnb_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'H', 2, 5000, 'text', 'GNB', 'G', 15, 5000, 'text'),
    (plantilla_gnb_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'GNB', 'I', 15, 5000, 'amount'),
    (plantilla_gnb_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'GNB', 'E|D', 15, 5000, 'text'),
    (plantilla_gnb_443_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'GNB-443', 'C', 15, 5000, 'date'),
    (plantilla_gnb_443_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'H', 2, 5000, 'text', 'GNB-443', 'G', 15, 5000, 'text'),
    (plantilla_gnb_443_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'GNB-443', 'I', 15, 5000, 'amount'),
    (plantilla_gnb_443_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'GNB-443', 'E|D', 15, 5000, 'text'),
    (plantilla_gnb3_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'GNB3', 'C', 15, 5000, 'date'),
    (plantilla_gnb3_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'H', 2, 5000, 'text', 'GNB3', 'G', 15, 5000, 'text'),
    (plantilla_gnb3_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'GNB3', 'I', 15, 5000, 'amount'),
    (plantilla_gnb3_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'GNB3', 'E|D', 15, 5000, 'text'),
    (plantilla_itau_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'Itau CC', 'A', 10, 5000, 'date'),
    (plantilla_itau_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'H', 2, 5000, 'text', 'Itau CC', 'B', 10, 5000, 'text'),
    (plantilla_itau_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'Itau CC', 'E|F', 10, 5000, 'amount'),
    (plantilla_itau_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'Itau CC', 'C', 10, 5000, 'text');

  RAISE NOTICE 'Seed GNB/Itau aplicado sobre usr_id=% usr_login=%', target_user_id, target_user_login;
END;
$$;
