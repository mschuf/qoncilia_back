-- Seed opcional de bancos, cuentas y plantillas de conciliacion para Paraguay.
-- Reemplazar <<USER_LOGIN>> por el login del admin destino. Si queda sin reemplazar,
-- usa el primer usuario activo disponible.

DO $$
DECLARE
  requested_login TEXT := '<<USER_LOGIN>>';
  target_user_id INTEGER;
  target_user_login TEXT;
  target_company_id INTEGER;
  sistema_sap_id INTEGER;
  banco_familiar_id INTEGER;
  banco_sudameris_id INTEGER;
  banco_continental_id INTEGER;
  plantilla_base_familiar_id INTEGER;
  plantilla_base_sudameris_id INTEGER;
  plantilla_base_continental_id INTEGER;
  plantilla_familiar_id INTEGER;
  plantilla_sudameris_id INTEGER;
  plantilla_continental_id INTEGER;
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
    (target_company_id, target_user_id, 'Banco Familiar', 'Familiar PYG', 'Extracto Banco Familiar PYG', TRUE),
    (target_company_id, target_user_id, 'Sudameris', 'Sudameris PYG', 'Extracto Sudameris PYG', TRUE),
    (target_company_id, target_user_id, 'Continental', 'Continental PYG', 'Extracto Continental PYG', TRUE)
  ON CONFLICT DO NOTHING;

  SELECT banco_id INTO banco_familiar_id
  FROM public.bancos
  WHERE usuario_id = target_user_id AND LOWER(banco_nombre) = LOWER('Banco Familiar')
  LIMIT 1;

  SELECT banco_id INTO banco_sudameris_id
  FROM public.bancos
  WHERE usuario_id = target_user_id AND LOWER(banco_nombre) = LOWER('Sudameris')
  LIMIT 1;

  SELECT banco_id INTO banco_continental_id
  FROM public.bancos
  WHERE usuario_id = target_user_id AND LOWER(banco_nombre) = LOWER('Continental')
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
    (target_company_id, banco_familiar_id, 'Cuenta corriente Familiar PYG', 'PYG', 'FAMILIAR-PYG-001', 'FAMILIAR', '1110101', NULL, TRUE),
    (target_company_id, banco_sudameris_id, 'Cuenta corriente Sudameris PYG', 'PYG', 'SUDAMERIS-PYG-001', 'SUDAMERIS', '1110102', NULL, TRUE),
    (target_company_id, banco_continental_id, 'Cuenta corriente Continental PYG', 'PYG', 'CONTINENTAL-PYG-001', 'CONTINENTAL', '1110103', NULL, TRUE)
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
    ('Base Familiar vs SAP B1', 'Plantilla base para extractos Banco Familiar PYG.', 'Banco Familiar', sistema_sap_id, 'SAP B1', 'Banco Familiar', 0.60, TRUE),
    ('Base Sudameris vs SAP B1', 'Plantilla base para extractos Sudameris PYG.', 'Sudameris', sistema_sap_id, 'SAP B1', 'Sudameris', 0.60, TRUE),
    ('Base Continental vs SAP B1', 'Plantilla base para extractos Continental PYG.', 'Continental', sistema_sap_id, 'SAP B1', 'Continental', 0.60, TRUE)
  ON CONFLICT DO NOTHING;

  SELECT plantilla_base_id INTO plantilla_base_familiar_id
  FROM public.plantillas_base
  WHERE LOWER(plantilla_base_nombre) = LOWER('Base Familiar vs SAP B1')
  LIMIT 1;

  SELECT plantilla_base_id INTO plantilla_base_sudameris_id
  FROM public.plantillas_base
  WHERE LOWER(plantilla_base_nombre) = LOWER('Base Sudameris vs SAP B1')
  LIMIT 1;

  SELECT plantilla_base_id INTO plantilla_base_continental_id
  FROM public.plantillas_base
  WHERE LOWER(plantilla_base_nombre) = LOWER('Base Continental vs SAP B1')
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
    (banco_familiar_id, plantilla_base_familiar_id, sistema_sap_id, 'Familiar vs SAP B1', 'Comparacion Banco Familiar contra SAP B1.', 'SAP B1', 'Banco Familiar', 0.60, TRUE),
    (banco_sudameris_id, plantilla_base_sudameris_id, sistema_sap_id, 'Sudameris vs SAP B1', 'Comparacion Sudameris contra SAP B1.', 'SAP B1', 'Sudameris', 0.60, TRUE),
    (banco_continental_id, plantilla_base_continental_id, sistema_sap_id, 'Continental vs SAP B1', 'Comparacion Continental contra SAP B1.', 'SAP B1', 'Continental', 0.60, TRUE)
  ON CONFLICT DO NOTHING;

  SELECT plantilla_id INTO plantilla_familiar_id
  FROM public.plantillas_conciliacion
  WHERE banco_id = banco_familiar_id AND LOWER(plantilla_nombre) = LOWER('Familiar vs SAP B1')
  LIMIT 1;

  SELECT plantilla_id INTO plantilla_sudameris_id
  FROM public.plantillas_conciliacion
  WHERE banco_id = banco_sudameris_id AND LOWER(plantilla_nombre) = LOWER('Sudameris vs SAP B1')
  LIMIT 1;

  SELECT plantilla_id INTO plantilla_continental_id
  FROM public.plantillas_conciliacion
  WHERE banco_id = banco_continental_id AND LOWER(plantilla_nombre) = LOWER('Continental vs SAP B1')
  LIMIT 1;

  DELETE FROM public.plantillas_conciliacion_mapeos
  WHERE plantilla_id IN (plantilla_familiar_id, plantilla_sudameris_id, plantilla_continental_id);

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
    (plantilla_familiar_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'Familiar', 'A', 2, 5000, 'date'),
    (plantilla_familiar_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 1, NULL, 'SAP', 'H', 2, 5000, 'text', 'Familiar', 'D', 2, 5000, 'text'),
    (plantilla_familiar_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'Familiar', 'E|F', 2, 5000, 'amount'),
    (plantilla_familiar_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'Familiar', 'C', 2, 5000, 'text'),
    (plantilla_sudameris_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'Sudameris', 'A', 2, 5000, 'date'),
    (plantilla_sudameris_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 1, NULL, 'SAP', 'H', 2, 5000, 'text', 'Sudameris', 'D', 2, 5000, 'text'),
    (plantilla_sudameris_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'Sudameris', 'E|F', 2, 5000, 'amount'),
    (plantilla_sudameris_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'Sudameris', 'C', 2, 5000, 'text'),
    (plantilla_continental_id, 'fecha', 'Fecha', 1, TRUE, TRUE, 'date_equals', 2, NULL, 'SAP', 'B', 2, 5000, 'date', 'Continental', 'A', 2, 5000, 'date'),
    (plantilla_continental_id, 'descripcion', 'Descripcion', 2, TRUE, FALSE, 'contains', 1, NULL, 'SAP', 'H', 2, 5000, 'text', 'Continental', 'D', 2, 5000, 'text'),
    (plantilla_continental_id, 'monto', 'Monto', 3, TRUE, TRUE, 'numeric_equals', 4, 0, 'SAP', 'G', 2, 5000, 'amount', 'Continental', 'E|F', 2, 5000, 'amount'),
    (plantilla_continental_id, 'referencia', 'Referencia', 4, TRUE, FALSE, 'contains', 2, NULL, 'SAP', 'F', 2, 5000, 'text', 'Continental', 'C', 2, 5000, 'text');

  RAISE NOTICE 'Seed Paraguay aplicado sobre usr_id=% usr_login=%', target_user_id, target_user_login;
END;
$$;
