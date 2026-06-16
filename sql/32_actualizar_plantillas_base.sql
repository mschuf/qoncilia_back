-- =============================================================================
-- 32_actualizar_plantillas_base.sql
-- Actualiza las PLANTILLAS BASE (catalogo) y sus mapeos para que, al aplicar una
-- plantilla base a un layout nuevo, ya nazca con Debito/Credito + Saldo + modo,
-- igual que los layouts. EXCLUYE Continental (NOT ILIKE '%conti%').
--
-- Tablas:
--   public.plantillas_base         (plantilla_base_id, plantilla_base_nombre,
--                                   plantilla_base_monto_modo, ...)
--   public.plantillas_base_mapeos  (mapeo_base_id, plantilla_base_id,
--                                   mapeo_base_clave_campo, mapeo_base_etiqueta,
--                                   mapeo_base_orden, mapeo_base_activo, ...,
--                                   sistema_*, banco_*)
--
-- Estado verificado en la BD (no hace falta corregir columnas/filas, ya estan bien):
--   Familiar  : monto=E|F@13 -> Debito=E, Credito=F, Saldo=G
--   GNB (x3)  : monto=H|I@15 -> Debito=H, Credito=I, Saldo=J
--   Itau      : monto=D|E@10 -> Debito=D, Credito=E, Saldo=F
--   Sudameris : monto=E@14 (UNICA con signo) -> modo signed, Saldo=F (NO deb/cred)
--
-- Idempotente. EJECUCION MANUAL en la base Postgres de la app.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1) SUDAMERIS base -> modo signed (su monto ya es columna unica 'E').
-- ----------------------------------------------------------------------------
BEGIN;
UPDATE public.plantillas_base
SET plantilla_base_monto_modo = 'signed'
WHERE plantilla_base_nombre ILIKE '%sudameris%';
COMMIT;

-- ----------------------------------------------------------------------------
-- 2) FAMILIAR / GNB / ITAU base -> agregar Debito/Credito separados + modo
--    debit_credit. Copia hoja/filas del mapeo de importe existente. Idempotente.
-- ----------------------------------------------------------------------------
BEGIN;

WITH fix(name_like, debit_col, credit_col) AS (
  VALUES
    ('%gnb%',      'H', 'I'),
    ('%itau%',     'D', 'E'),
    ('%familiar%', 'E', 'F')
)
INSERT INTO public.plantillas_base_mapeos (
  plantilla_base_id, mapeo_base_clave_campo, mapeo_base_etiqueta, mapeo_base_orden,
  mapeo_base_activo, mapeo_base_requerido, mapeo_base_operador_comparacion,
  mapeo_base_peso, mapeo_base_tolerancia,
  sistema_hoja, sistema_columna, sistema_fila_inicio, sistema_fila_fin, sistema_tipo_dato,
  banco_hoja, banco_columna, banco_fila_inicio, banco_fila_fin, banco_tipo_dato
)
SELECT
  p.plantilla_base_id, x.clave, x.etiqueta, 90 + x.ord, TRUE,
  FALSE, 'numeric_equals', 1, 0,
  NULL, NULL, NULL, NULL, 'amount',
  src.banco_hoja, x.col, src.banco_fila_inicio, src.banco_fila_fin, 'amount'
FROM public.plantillas_base p
JOIN fix f ON p.plantilla_base_nombre ILIKE f.name_like
LEFT JOIN LATERAL (
  SELECT banco_hoja, banco_fila_inicio, banco_fila_fin, TRUE AS found
  FROM public.plantillas_base_mapeos
  WHERE plantilla_base_id = p.plantilla_base_id AND banco_tipo_dato = 'amount'
  ORDER BY mapeo_base_orden
  LIMIT 1
) src ON TRUE
CROSS JOIN LATERAL (
  VALUES
    ('debito',  'Debito',  f.debit_col,  1),
    ('credito', 'Credito', f.credit_col, 2)
) AS x(clave, etiqueta, col, ord)
WHERE p.plantilla_base_nombre NOT ILIKE '%conti%'
  AND src.found
  AND NOT EXISTS (
    SELECT 1 FROM public.plantillas_base_mapeos d
    WHERE d.plantilla_base_id = p.plantilla_base_id AND d.mapeo_base_clave_campo = x.clave
  );

UPDATE public.plantillas_base p
SET plantilla_base_monto_modo = 'debit_credit'
WHERE p.plantilla_base_nombre NOT ILIKE '%conti%'
  AND (p.plantilla_base_nombre ILIKE '%gnb%'
       OR p.plantilla_base_nombre ILIKE '%itau%'
       OR p.plantilla_base_nombre ILIKE '%familiar%')
  AND (p.plantilla_base_monto_modo IS NULL OR p.plantilla_base_monto_modo <> 'debit_credit')
  AND EXISTS (
    SELECT 1 FROM public.plantillas_base_mapeos m
    WHERE m.plantilla_base_id = p.plantilla_base_id
      AND m.mapeo_base_clave_campo IN ('debito', 'credito') AND m.mapeo_base_activo = TRUE
  );

COMMIT;

-- ----------------------------------------------------------------------------
-- 3) Reubicar Debito/Credito en el lugar de la columna combinada y OCULTARLA.
--    Excluye Conti. Sudameris queda fuera (no tiene debito/credito).
--    Idempotente (una vez oculta la combinada, no se re-ancla).
-- ----------------------------------------------------------------------------
BEGIN;

CREATE TEMP TABLE _amt_anchor_base ON COMMIT DROP AS
SELECT DISTINCT ON (c.plantilla_base_id)
       c.plantilla_base_id,
       c.mapeo_base_id    AS anchor_id,
       c.mapeo_base_orden AS amt_orden
FROM public.plantillas_base_mapeos c
JOIN public.plantillas_base p ON p.plantilla_base_id = c.plantilla_base_id
WHERE c.banco_tipo_dato = 'amount'
  AND c.mapeo_base_activo = TRUE
  AND c.sistema_columna IS NOT NULL
  AND c.mapeo_base_clave_campo NOT IN ('debito', 'credito')
  AND p.plantilla_base_nombre NOT ILIKE '%conti%'
  AND EXISTS (
    SELECT 1 FROM public.plantillas_base_mapeos d
    WHERE d.plantilla_base_id = c.plantilla_base_id
      AND d.mapeo_base_clave_campo = 'debito' AND d.mapeo_base_activo = TRUE
  )
  AND EXISTS (
    SELECT 1 FROM public.plantillas_base_mapeos d
    WHERE d.plantilla_base_id = c.plantilla_base_id
      AND d.mapeo_base_clave_campo = 'credito' AND d.mapeo_base_activo = TRUE
  )
ORDER BY c.plantilla_base_id, c.mapeo_base_orden, c.mapeo_base_id;

-- 3.a) Hacer lugar: +2 desde la ancla en adelante (sin la ancla ni debito/credito).
UPDATE public.plantillas_base_mapeos t
SET mapeo_base_orden = t.mapeo_base_orden + 2
FROM _amt_anchor_base a
WHERE t.plantilla_base_id = a.plantilla_base_id
  AND t.mapeo_base_orden >= a.amt_orden
  AND t.mapeo_base_id <> a.anchor_id
  AND t.mapeo_base_clave_campo NOT IN ('debito', 'credito');

-- 3.b) Debito en el lugar de la combinada; Credito justo despues.
UPDATE public.plantillas_base_mapeos t
SET mapeo_base_orden = a.amt_orden
FROM _amt_anchor_base a
WHERE t.plantilla_base_id = a.plantilla_base_id AND t.mapeo_base_clave_campo = 'debito';

UPDATE public.plantillas_base_mapeos t
SET mapeo_base_orden = a.amt_orden + 1
FROM _amt_anchor_base a
WHERE t.plantilla_base_id = a.plantilla_base_id AND t.mapeo_base_clave_campo = 'credito';

-- 3.c) Ocultar la(s) columna(s) combinada(s) del match (amount, con sistema).
UPDATE public.plantillas_base_mapeos t
SET mapeo_base_activo = FALSE
FROM _amt_anchor_base a
WHERE t.plantilla_base_id = a.plantilla_base_id
  AND t.banco_tipo_dato = 'amount'
  AND t.mapeo_base_activo = TRUE
  AND t.sistema_columna IS NOT NULL
  AND t.mapeo_base_clave_campo NOT IN ('debito', 'credito');

COMMIT;

-- ----------------------------------------------------------------------------
-- 4) Columna SOLO-VISUAL "Saldo" (bank-only). Excluye Conti. Idempotente.
-- ----------------------------------------------------------------------------
BEGIN;

WITH saldo_fix(name_like, saldo_col) AS (
  VALUES
    ('%familiar%',  'G'),
    ('%sudameris%', 'F'),
    ('%gnb%',       'J'),
    ('%itau%',      'F')
)
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
JOIN saldo_fix f ON p.plantilla_base_nombre ILIKE f.name_like
LEFT JOIN LATERAL (
  SELECT banco_hoja, banco_fila_inicio, banco_fila_fin, TRUE AS found
  FROM public.plantillas_base_mapeos
  WHERE plantilla_base_id = p.plantilla_base_id AND banco_columna IS NOT NULL
  ORDER BY mapeo_base_orden
  LIMIT 1
) src ON TRUE
WHERE p.plantilla_base_nombre NOT ILIKE '%conti%'
  AND src.found
  AND NOT EXISTS (
    SELECT 1 FROM public.plantillas_base_mapeos d
    WHERE d.plantilla_base_id = p.plantilla_base_id AND d.mapeo_base_clave_campo = 'saldo'
  );

COMMIT;

-- ----------------------------------------------------------------------------
-- 5) Verificacion (deberia devolver 0 filas): plantillas base NO-conti con
--    Debito/Credito activos que TODAVIA tienen activa una columna combinada con
--    sistema (no quedo oculta).
-- ----------------------------------------------------------------------------
SELECT p.plantilla_base_id, p.plantilla_base_nombre
FROM public.plantillas_base p
WHERE p.plantilla_base_nombre NOT ILIKE '%conti%'
  AND EXISTS (SELECT 1 FROM public.plantillas_base_mapeos m
              WHERE m.plantilla_base_id = p.plantilla_base_id
                AND m.mapeo_base_clave_campo = 'debito' AND m.mapeo_base_activo = TRUE)
  AND EXISTS (SELECT 1 FROM public.plantillas_base_mapeos m
              WHERE m.plantilla_base_id = p.plantilla_base_id
                AND m.mapeo_base_clave_campo = 'credito' AND m.mapeo_base_activo = TRUE)
  AND EXISTS (SELECT 1 FROM public.plantillas_base_mapeos m
              WHERE m.plantilla_base_id = p.plantilla_base_id
                AND m.banco_tipo_dato = 'amount'
                AND m.mapeo_base_activo = TRUE
                AND m.mapeo_base_clave_campo NOT IN ('debito', 'credito')
                AND m.sistema_columna IS NOT NULL)
ORDER BY p.plantilla_base_nombre;
