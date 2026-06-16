-- =============================================================================
-- 31_actualizar_otros_bancos.sql
-- Aplica las mejoras de conciliacion a TODOS los bancos MENOS Conti/Continental.
-- (Conti ya esta funcionando perfecto, por eso se EXCLUYE en cada paso con
--  NOT ILIKE '%conti%'.)
--
-- Bancos objetivo y columnas VERIFICADAS en los Excel del proyecto:
--   Familiar  : Debito=E, Credito=F, Descripcion=D, Referencia=C, Saldo=G, datos fila 13+
--   Sudameris : importe UNICO con signo en E (F=Saldo) -> modo 'signed';
--               Descripcion=C, Referencia=D, Saldo=F, datos fila 14+
--   GNB (x3)  : Debito=H, Credito=I, Saldo=J, datos fila 15+
--   Itau      : Debito=D, Credito=E, Saldo=F, datos fila 10+
--
-- Idempotente: se puede correr varias veces sin duplicar ni romper.
-- EJECUCION MANUAL en la base Postgres de la app.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1) SUDAMERIS -> importe con signo (NO debito/credito; F es Saldo, no Credito).
--    Desactiva debito/credito, deja el importe como columna UNICA 'E', corrige
--    Descripcion=C / Referencia=D y pone el layout en modo 'signed'.
-- ----------------------------------------------------------------------------
BEGIN;

-- 1.a) Desactivar debito/credito en Sudameris (no aplican).
UPDATE public.plantillas_conciliacion_mapeos m
SET mapeo_activo = FALSE
FROM public.plantillas_conciliacion p
WHERE p.plantilla_id = m.plantilla_id
  AND p.plantilla_nombre ILIKE '%sudameris%'
  AND m.mapeo_clave_campo IN ('debito', 'credito');

-- 1.b) Reactivar la columna de importe (con sistema) como UNICA 'E'. Se toca SOLO
--      una columna por layout (la de menor orden) para no afectar a otra si existiera.
UPDATE public.plantillas_conciliacion_mapeos m
SET mapeo_activo = TRUE,
    banco_columna = 'E'
FROM public.plantillas_conciliacion p
WHERE p.plantilla_id = m.plantilla_id
  AND p.plantilla_nombre ILIKE '%sudameris%'
  AND m.mapeo_id = (
    SELECT c.mapeo_id
    FROM public.plantillas_conciliacion_mapeos c
    WHERE c.plantilla_id = p.plantilla_id
      AND c.banco_tipo_dato = 'amount'
      AND c.sistema_columna IS NOT NULL
      AND c.mapeo_clave_campo NOT IN ('debito', 'credito')
    ORDER BY c.mapeo_orden, c.mapeo_id
    LIMIT 1
  );

-- 1.c) Corregir columnas: Descripcion=C, Referencia=D (estaban cruzadas en el seed viejo).
UPDATE public.plantillas_conciliacion_mapeos m
SET banco_columna = 'C'
FROM public.plantillas_conciliacion p
WHERE p.plantilla_id = m.plantilla_id
  AND p.plantilla_nombre ILIKE '%sudameris%'
  AND m.mapeo_clave_campo = 'descripcion';

UPDATE public.plantillas_conciliacion_mapeos m
SET banco_columna = 'D'
FROM public.plantillas_conciliacion p
WHERE p.plantilla_id = m.plantilla_id
  AND p.plantilla_nombre ILIKE '%sudameris%'
  AND m.mapeo_clave_campo = 'referencia';

-- 1.d) Modo de importe = signed.
UPDATE public.plantillas_conciliacion p
SET plantilla_monto_modo = 'signed'
WHERE p.plantilla_nombre ILIKE '%sudameris%';

COMMIT;

-- ----------------------------------------------------------------------------
-- 2) FAMILIAR / GNB / ITAU -> agregar Debito/Credito separados (columnas
--    verificadas) y poner el layout en modo debit_credit. Idempotente (NOT EXISTS).
--    Copia hoja/filas del mapeo de importe existente.
-- ----------------------------------------------------------------------------
BEGIN;

WITH fix(name_like, debit_col, credit_col) AS (
  VALUES
    ('%gnb%',      'H', 'I'),  -- GNB / GNB-443 / GNB3 : Imp.Debito=H, Imp.Credito=I
    ('%itau%',     'D', 'E'),  -- Itau                 : Debitos=D, Creditos=E
    ('%familiar%', 'E', 'F')   -- Familiar             : Debito=E, Credito=F
)
INSERT INTO public.plantillas_conciliacion_mapeos (
  plantilla_id, mapeo_clave_campo, mapeo_etiqueta, mapeo_orden, mapeo_activo,
  mapeo_requerido, mapeo_operador_comparacion, mapeo_peso, mapeo_tolerancia,
  sistema_hoja, sistema_columna, sistema_fila_inicio, sistema_fila_fin, sistema_tipo_dato,
  banco_hoja, banco_columna, banco_fila_inicio, banco_fila_fin, banco_tipo_dato
)
SELECT
  p.plantilla_id, x.clave, x.etiqueta, 90 + x.ord, TRUE,
  FALSE, 'numeric_equals', 1, 0,
  NULL, NULL, NULL, NULL, 'amount',
  src.banco_hoja, x.col, src.banco_fila_inicio, src.banco_fila_fin, 'amount'
FROM public.plantillas_conciliacion p
JOIN fix f ON p.plantilla_nombre ILIKE f.name_like
LEFT JOIN LATERAL (
  SELECT banco_hoja, banco_fila_inicio, banco_fila_fin, TRUE AS found
  FROM public.plantillas_conciliacion_mapeos
  WHERE plantilla_id = p.plantilla_id AND banco_tipo_dato = 'amount'
  ORDER BY mapeo_orden
  LIMIT 1
) src ON TRUE
CROSS JOIN LATERAL (
  VALUES
    ('debito',  'Debito',  f.debit_col,  1),
    ('credito', 'Credito', f.credit_col, 2)
) AS x(clave, etiqueta, col, ord)
WHERE p.plantilla_nombre NOT ILIKE '%conti%'
  AND src.found
  AND NOT EXISTS (
    SELECT 1 FROM public.plantillas_conciliacion_mapeos d
    WHERE d.plantilla_id = p.plantilla_id AND d.mapeo_clave_campo = x.clave
  );

UPDATE public.plantillas_conciliacion p
SET plantilla_monto_modo = 'debit_credit'
WHERE p.plantilla_nombre NOT ILIKE '%conti%'
  AND (p.plantilla_nombre ILIKE '%gnb%'
       OR p.plantilla_nombre ILIKE '%itau%'
       OR p.plantilla_nombre ILIKE '%familiar%')
  AND (p.plantilla_monto_modo IS NULL OR p.plantilla_monto_modo <> 'debit_credit')
  AND EXISTS (
    SELECT 1 FROM public.plantillas_conciliacion_mapeos m
    WHERE m.plantilla_id = p.plantilla_id AND m.mapeo_clave_campo IN ('debito', 'credito')
      AND m.mapeo_activo = TRUE
  );

COMMIT;

-- ----------------------------------------------------------------------------
-- 3) Reubicar Debito/Credito en el lugar de la columna combinada (DEBE/HABER) y
--    OCULTAR esa columna combinada. Excluye Conti. Sudameris queda fuera solo
--    porque sus debito/credito estan inactivos (paso 1).
--    Idempotente: una vez oculta la combinada, una 2da corrida no la re-ancla.
-- ----------------------------------------------------------------------------
BEGIN;

CREATE TEMP TABLE _amt_anchor31 ON COMMIT DROP AS
SELECT DISTINCT ON (c.plantilla_id)
       c.plantilla_id,
       c.mapeo_id    AS anchor_id,
       c.mapeo_orden AS amt_orden
FROM public.plantillas_conciliacion_mapeos c
JOIN public.plantillas_conciliacion p ON p.plantilla_id = c.plantilla_id
WHERE c.banco_tipo_dato = 'amount'
  AND c.mapeo_activo = TRUE
  AND c.sistema_columna IS NOT NULL
  AND c.mapeo_clave_campo NOT IN ('debito', 'credito')
  AND p.plantilla_nombre NOT ILIKE '%conti%'
  AND EXISTS (
    SELECT 1 FROM public.plantillas_conciliacion_mapeos d
    WHERE d.plantilla_id = c.plantilla_id
      AND d.mapeo_clave_campo = 'debito' AND d.mapeo_activo = TRUE
  )
  AND EXISTS (
    SELECT 1 FROM public.plantillas_conciliacion_mapeos d
    WHERE d.plantilla_id = c.plantilla_id
      AND d.mapeo_clave_campo = 'credito' AND d.mapeo_activo = TRUE
  )
ORDER BY c.plantilla_id, c.mapeo_orden, c.mapeo_id;

-- 3.a) Hacer lugar: +2 a los mapeos desde la ancla en adelante (sin la ancla ni deb/cred).
UPDATE public.plantillas_conciliacion_mapeos t
SET mapeo_orden = t.mapeo_orden + 2
FROM _amt_anchor31 a
WHERE t.plantilla_id = a.plantilla_id
  AND t.mapeo_orden >= a.amt_orden
  AND t.mapeo_id <> a.anchor_id
  AND t.mapeo_clave_campo NOT IN ('debito', 'credito');

-- 3.b) Debito en el lugar de la combinada; Credito justo despues.
UPDATE public.plantillas_conciliacion_mapeos t
SET mapeo_orden = a.amt_orden
FROM _amt_anchor31 a
WHERE t.plantilla_id = a.plantilla_id AND t.mapeo_clave_campo = 'debito';

UPDATE public.plantillas_conciliacion_mapeos t
SET mapeo_orden = a.amt_orden + 1
FROM _amt_anchor31 a
WHERE t.plantilla_id = a.plantilla_id AND t.mapeo_clave_campo = 'credito';

-- 3.c) Ocultar la(s) columna(s) combinada(s) del match (amount, con sistema) de esos layouts.
UPDATE public.plantillas_conciliacion_mapeos t
SET mapeo_activo = FALSE
FROM _amt_anchor31 a
WHERE t.plantilla_id = a.plantilla_id
  AND t.banco_tipo_dato = 'amount'
  AND t.mapeo_activo = TRUE
  AND t.sistema_columna IS NOT NULL
  AND t.mapeo_clave_campo NOT IN ('debito', 'credito');

COMMIT;

-- ----------------------------------------------------------------------------
-- 4) Columna SOLO-VISUAL "Saldo" (bank-only, no afecta match ni BankPages).
--    Excluye Conti. Idempotente (NOT EXISTS sobre 'saldo').
-- ----------------------------------------------------------------------------
BEGIN;

WITH saldo_fix(name_like, saldo_col) AS (
  VALUES
    ('%familiar%',  'G'),
    ('%sudameris%', 'F'),
    ('%gnb%',       'J'),
    ('%itau%',      'F')
)
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
JOIN saldo_fix f ON p.plantilla_nombre ILIKE f.name_like
LEFT JOIN LATERAL (
  SELECT banco_hoja, banco_fila_inicio, banco_fila_fin, TRUE AS found
  FROM public.plantillas_conciliacion_mapeos
  WHERE plantilla_id = p.plantilla_id AND banco_columna IS NOT NULL
  ORDER BY mapeo_orden
  LIMIT 1
) src ON TRUE
WHERE p.plantilla_nombre NOT ILIKE '%conti%'
  AND src.found
  AND NOT EXISTS (
    SELECT 1 FROM public.plantillas_conciliacion_mapeos d
    WHERE d.plantilla_id = p.plantilla_id AND d.mapeo_clave_campo = 'saldo'
  );

COMMIT;

-- ----------------------------------------------------------------------------
-- 5) Corregir fila de inicio de datos por banco (Familiar=13, Sudameris=14,
--    GNB=15, Itau=10). Solo toca los mapeos que quedaron en la fila 2 por el seed
--    viejo (idempotente; no pisa filas ya correctas). DEBE ir AL FINAL para que
--    tambien arregle los mapeos debito/credito/saldo recien agregados (que copiaron
--    la fila de origen). GNB/Itau normalmente ya estan bien; el guard '=2' es por
--    si algun layout legacy quedo en 2.
-- ----------------------------------------------------------------------------
BEGIN;

UPDATE public.plantillas_conciliacion_mapeos m
SET banco_fila_inicio = 13
FROM public.plantillas_conciliacion p
WHERE p.plantilla_id = m.plantilla_id
  AND p.plantilla_nombre ILIKE '%familiar%'
  AND m.banco_fila_inicio = 2;

UPDATE public.plantillas_conciliacion_mapeos m
SET banco_fila_inicio = 14
FROM public.plantillas_conciliacion p
WHERE p.plantilla_id = m.plantilla_id
  AND p.plantilla_nombre ILIKE '%sudameris%'
  AND m.banco_fila_inicio = 2;

UPDATE public.plantillas_conciliacion_mapeos m
SET banco_fila_inicio = 15
FROM public.plantillas_conciliacion p
WHERE p.plantilla_id = m.plantilla_id
  AND p.plantilla_nombre ILIKE '%gnb%'
  AND m.banco_fila_inicio = 2;

UPDATE public.plantillas_conciliacion_mapeos m
SET banco_fila_inicio = 10
FROM public.plantillas_conciliacion p
WHERE p.plantilla_id = m.plantilla_id
  AND p.plantilla_nombre ILIKE '%itau%'
  AND m.banco_fila_inicio = 2;

COMMIT;

-- ----------------------------------------------------------------------------
-- 6) Verificacion (deberia devolver 0 filas): layouts NO-conti con Debito y
--    Credito activos que TODAVIA tienen activa una columna combinada con sistema
--    (no quedo oculta). Sudameris no aparece (deb/cred inactivos).
-- ----------------------------------------------------------------------------
SELECT p.plantilla_id, p.plantilla_nombre
FROM public.plantillas_conciliacion p
WHERE p.plantilla_nombre NOT ILIKE '%conti%'
  AND EXISTS (SELECT 1 FROM public.plantillas_conciliacion_mapeos m
              WHERE m.plantilla_id = p.plantilla_id
                AND m.mapeo_clave_campo = 'debito' AND m.mapeo_activo = TRUE)
  AND EXISTS (SELECT 1 FROM public.plantillas_conciliacion_mapeos m
              WHERE m.plantilla_id = p.plantilla_id
                AND m.mapeo_clave_campo = 'credito' AND m.mapeo_activo = TRUE)
  AND EXISTS (SELECT 1 FROM public.plantillas_conciliacion_mapeos m
              WHERE m.plantilla_id = p.plantilla_id
                AND m.banco_tipo_dato = 'amount'
                AND m.mapeo_activo = TRUE
                AND m.mapeo_clave_campo NOT IN ('debito', 'credito')
                AND m.sistema_columna IS NOT NULL)
ORDER BY p.plantilla_nombre;
