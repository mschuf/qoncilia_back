-- =============================================================================
-- 33_signed_split_sudameris.sql
-- Deja Sudameris (y cualquier banco con IMPORTE UNICO CON SIGNO) en modo 'signed'
-- tanto en PLANTILLAS BASE como en PLANTILLAS ASIGNADAS a usuarios, con:
--   - columna de importe UNICA con signo (negativo = debito, positivo = credito)
--   - columna "Saldo" SOLO-VISTA (banco sin sistema): se ve en el preview pero NO
--     entra al matching ni al envio a SAP.
--   - SIN mapeos 'debito'/'credito' activos (un layout signed no debe tenerlos).
--
-- La vista previa del extracto (front) divide esa columna de importe con signo en
-- dos columnas Debito (negativos) / Credito (positivos). Esa division es SOLO
-- visual; el dato guardado sigue siendo el importe unico con signo. El matching y
-- el envio a SAP (resolveBankPageAmounts) ya manejaban 'signed' por su cuenta.
--
-- NO crea columnas nuevas: plantilla_base_monto_modo / plantilla_monto_modo ya
-- existen desde sql/30_debito_credito_conciliacion.sql.
--
-- Idempotente y re-ejecutable. EJECUCION MANUAL en la base Postgres de la app.
--
-- >>> Para sumar OTRO banco con importe unico con signo: agregar una fila a la
--     lista _signed_fix de abajo:
--         (patron_nombre_ILIKE, columna_importe, columna_saldo_o_NULL, fila_inicio)
--     Ej: ('%nuevo banco%', 'E', 'F', 14). 'columna_saldo' puede ser NULL si el
--     extracto no trae saldo.
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0) Lista de bancos "signed" (parametrizable). Vive solo en esta transaccion.
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE _signed_fix (
  name_like   TEXT,
  importe_col TEXT,
  saldo_col   TEXT,   -- NULL si el extracto no trae saldo
  start_row   INTEGER
) ON COMMIT DROP;

INSERT INTO _signed_fix (name_like, importe_col, saldo_col, start_row) VALUES
  ('%sudameris%', 'E', 'F', 14);
  -- ('%otro banco%', 'E', 'F', 14);  -- <- sumar aca futuros bancos signed

-- ============================================================================
-- A) PLANTILLAS ASIGNADAS  (plantillas_conciliacion / *_mapeos)
-- ============================================================================

-- A.1) Modo = signed.
UPDATE public.plantillas_conciliacion p
SET plantilla_monto_modo = 'signed'
FROM _signed_fix f
WHERE p.plantilla_nombre ILIKE f.name_like
  AND (p.plantilla_monto_modo IS DISTINCT FROM 'signed');

-- A.2) Desactivar debito/credito (un layout signed usa importe unico, no separados).
UPDATE public.plantillas_conciliacion_mapeos m
SET mapeo_activo = FALSE
FROM public.plantillas_conciliacion p, _signed_fix f
WHERE p.plantilla_id = m.plantilla_id
  AND p.plantilla_nombre ILIKE f.name_like
  AND m.mapeo_clave_campo IN ('debito', 'credito')
  AND m.mapeo_activo = TRUE;

-- A.3) Asegurar la columna de importe UNICA (la del match: con columna de sistema)
--      activa, en la columna de banco indicada y como tipo amount.
UPDATE public.plantillas_conciliacion_mapeos m
SET mapeo_activo   = TRUE,
    banco_columna  = f.importe_col,
    banco_tipo_dato = 'amount'
FROM public.plantillas_conciliacion p, _signed_fix f
WHERE p.plantilla_id = m.plantilla_id
  AND p.plantilla_nombre ILIKE f.name_like
  AND m.mapeo_clave_campo IN ('monto', 'importe', 'amount')
  AND m.sistema_columna IS NOT NULL;

-- A.4) Columna "Saldo" SOLO-VISTA (banco sin sistema). Idempotente (NOT EXISTS).
--      Copia hoja/filas del primer mapeo de banco existente del layout.
INSERT INTO public.plantillas_conciliacion_mapeos (
  plantilla_id, mapeo_clave_campo, mapeo_etiqueta, mapeo_orden, mapeo_activo,
  mapeo_requerido, mapeo_operador_comparacion, mapeo_peso, mapeo_tolerancia,
  sistema_hoja, sistema_columna, sistema_fila_inicio, sistema_fila_fin, sistema_tipo_dato,
  banco_hoja, banco_columna, banco_fila_inicio, banco_fila_fin, banco_tipo_dato
)
SELECT
  p.plantilla_id, 'saldo', 'Saldo', 95, TRUE,
  FALSE, 'numeric_equals', 0, 0,
  NULL, NULL, NULL, NULL, 'amount',
  src.banco_hoja, f.saldo_col, src.banco_fila_inicio, src.banco_fila_fin, 'amount'
FROM public.plantillas_conciliacion p
JOIN _signed_fix f ON p.plantilla_nombre ILIKE f.name_like
LEFT JOIN LATERAL (
  SELECT banco_hoja, banco_fila_inicio, banco_fila_fin
  FROM public.plantillas_conciliacion_mapeos
  WHERE plantilla_id = p.plantilla_id AND banco_columna IS NOT NULL
  ORDER BY mapeo_orden
  LIMIT 1
) src ON TRUE
WHERE f.saldo_col IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.plantillas_conciliacion_mapeos d
    WHERE d.plantilla_id = p.plantilla_id AND d.mapeo_clave_campo = 'saldo'
  );

-- A.5) Si ya existia un 'saldo' pero desactivado o en otra columna, reactivarlo
--      y reapuntarlo a la columna indicada (sigue siendo solo-vista).
UPDATE public.plantillas_conciliacion_mapeos m
SET mapeo_activo    = TRUE,
    banco_columna   = f.saldo_col,
    sistema_columna = NULL,
    banco_tipo_dato = 'amount'
FROM public.plantillas_conciliacion p, _signed_fix f
WHERE p.plantilla_id = m.plantilla_id
  AND p.plantilla_nombre ILIKE f.name_like
  AND f.saldo_col IS NOT NULL
  AND m.mapeo_clave_campo = 'saldo';

-- ============================================================================
-- B) PLANTILLAS BASE  (plantillas_base / *_mapeos)
-- ============================================================================

-- B.1) Modo = signed.
UPDATE public.plantillas_base p
SET plantilla_base_monto_modo = 'signed'
FROM _signed_fix f
WHERE p.plantilla_base_nombre ILIKE f.name_like
  AND (p.plantilla_base_monto_modo IS DISTINCT FROM 'signed');

-- B.2) Desactivar debito/credito en la base.
UPDATE public.plantillas_base_mapeos m
SET mapeo_base_activo = FALSE
FROM public.plantillas_base p, _signed_fix f
WHERE p.plantilla_base_id = m.plantilla_base_id
  AND p.plantilla_base_nombre ILIKE f.name_like
  AND m.mapeo_base_clave_campo IN ('debito', 'credito')
  AND m.mapeo_base_activo = TRUE;

-- B.3) Asegurar columna de importe unica (con sistema) activa, columna y tipo.
UPDATE public.plantillas_base_mapeos m
SET mapeo_base_activo = TRUE,
    banco_columna     = f.importe_col,
    banco_tipo_dato   = 'amount'
FROM public.plantillas_base p, _signed_fix f
WHERE p.plantilla_base_id = m.plantilla_base_id
  AND p.plantilla_base_nombre ILIKE f.name_like
  AND m.mapeo_base_clave_campo IN ('monto', 'importe', 'amount')
  AND m.sistema_columna IS NOT NULL;

-- B.4) Columna "Saldo" SOLO-VISTA en la base. Idempotente (NOT EXISTS).
INSERT INTO public.plantillas_base_mapeos (
  plantilla_base_id, mapeo_base_clave_campo, mapeo_base_etiqueta, mapeo_base_orden,
  mapeo_base_activo, mapeo_base_requerido, mapeo_base_operador_comparacion,
  mapeo_base_peso, mapeo_base_tolerancia,
  sistema_hoja, sistema_columna, sistema_fila_inicio, sistema_fila_fin, sistema_tipo_dato,
  banco_hoja, banco_columna, banco_fila_inicio, banco_fila_fin, banco_tipo_dato
)
SELECT
  p.plantilla_base_id, 'saldo', 'Saldo', 95, TRUE,
  FALSE, 'numeric_equals', 0, 0,
  NULL, NULL, NULL, NULL, 'amount',
  src.banco_hoja, f.saldo_col, src.banco_fila_inicio, src.banco_fila_fin, 'amount'
FROM public.plantillas_base p
JOIN _signed_fix f ON p.plantilla_base_nombre ILIKE f.name_like
LEFT JOIN LATERAL (
  SELECT banco_hoja, banco_fila_inicio, banco_fila_fin
  FROM public.plantillas_base_mapeos
  WHERE plantilla_base_id = p.plantilla_base_id AND banco_columna IS NOT NULL
  ORDER BY mapeo_base_orden
  LIMIT 1
) src ON TRUE
WHERE f.saldo_col IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.plantillas_base_mapeos d
    WHERE d.plantilla_base_id = p.plantilla_base_id AND d.mapeo_base_clave_campo = 'saldo'
  );

-- B.5) Reactivar/reapuntar 'saldo' base si existia mal.
UPDATE public.plantillas_base_mapeos m
SET mapeo_base_activo = TRUE,
    banco_columna     = f.saldo_col,
    sistema_columna   = NULL,
    banco_tipo_dato   = 'amount'
FROM public.plantillas_base p, _signed_fix f
WHERE p.plantilla_base_id = m.plantilla_base_id
  AND p.plantilla_base_nombre ILIKE f.name_like
  AND f.saldo_col IS NOT NULL
  AND m.mapeo_base_clave_campo = 'saldo';

COMMIT;

-- ============================================================================
-- C) VERIFICACION (read-only). Correr despues del COMMIT.
-- ============================================================================

-- C.1) Plantillas ASIGNADAS en modo signed y sus mapeos de importe/saldo.
SELECT 'asignada' AS tipo, p.plantilla_id AS id, p.plantilla_nombre AS nombre,
       p.plantilla_monto_modo AS modo,
       m.mapeo_clave_campo AS campo, m.mapeo_activo AS activo,
       m.banco_columna AS col_banco, m.sistema_columna AS col_sistema
FROM public.plantillas_conciliacion p
JOIN public.plantillas_conciliacion_mapeos m ON m.plantilla_id = p.plantilla_id
WHERE p.plantilla_monto_modo = 'signed'
  AND m.mapeo_clave_campo IN ('monto', 'importe', 'amount', 'saldo', 'debito', 'credito')
ORDER BY p.plantilla_nombre, m.mapeo_orden, m.mapeo_id;

-- C.2) Plantillas BASE en modo signed y sus mapeos de importe/saldo.
SELECT 'base' AS tipo, p.plantilla_base_id AS id, p.plantilla_base_nombre AS nombre,
       p.plantilla_base_monto_modo AS modo,
       m.mapeo_base_clave_campo AS campo, m.mapeo_base_activo AS activo,
       m.banco_columna AS col_banco, m.sistema_columna AS col_sistema
FROM public.plantillas_base p
JOIN public.plantillas_base_mapeos m ON m.plantilla_base_id = p.plantilla_base_id
WHERE p.plantilla_base_monto_modo = 'signed'
  AND m.mapeo_base_clave_campo IN ('monto', 'importe', 'amount', 'saldo', 'debito', 'credito')
ORDER BY p.plantilla_base_nombre, m.mapeo_base_orden, m.mapeo_base_id;

-- C.3) DEBERIA DEVOLVER 0 FILAS: layouts signed que todavia tienen debito/credito
--      ACTIVOS (eso seria inconsistente con el modo signed).
SELECT 'asignada' AS tipo, p.plantilla_id AS id, p.plantilla_nombre AS nombre,
       m.mapeo_clave_campo AS campo
FROM public.plantillas_conciliacion p
JOIN public.plantillas_conciliacion_mapeos m ON m.plantilla_id = p.plantilla_id
WHERE p.plantilla_monto_modo = 'signed'
  AND m.mapeo_clave_campo IN ('debito', 'credito')
  AND m.mapeo_activo = TRUE
UNION ALL
SELECT 'base' AS tipo, p.plantilla_base_id AS id, p.plantilla_base_nombre AS nombre,
       m.mapeo_base_clave_campo AS campo
FROM public.plantillas_base p
JOIN public.plantillas_base_mapeos m ON m.plantilla_base_id = p.plantilla_base_id
WHERE p.plantilla_base_monto_modo = 'signed'
  AND m.mapeo_base_clave_campo IN ('debito', 'credito')
  AND m.mapeo_base_activo = TRUE;
