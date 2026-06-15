-- =============================================================================
-- 30_debito_credito_conciliacion.sql
-- Soporte de Debito Y Credito (ambos sentidos) en la conciliacion SAP_B1.
--
-- EJECUCION MANUAL (este archivo corre en la base Postgres de la app).
-- Notas:
--   - Las queries van a HANA por SQL directo, asi que usan los nombres TECNICOS
--     de la tabla OBNK: credito = "CredAmnt", debito = "DebAmount" (confirmados),
--     NO los del Service Layer (CreditAmount/DebitAmount). En JDT1: "Debit" y
--     "Credit".
--   - Antes de correr, ajustar el WHERE del UPDATE para acotar a la(s)
--     configuracion(es) ERP correcta(s) (por emp_id y/o epc_codigo).
--
-- Convencion de signo (estandar SAP B1, cuenta de banco = debito-normal):
--   Ingreso  -> banco "Credito" (CredAmnt)  <->  sistema "Debito"  (Debit)
--   Egreso   -> banco "Debito"  (DebAmount)   <->  sistema "Credito" (Credit)
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) DDL: modo de importe por plantilla (NULL = autodeteccion / comportamiento
--    actual). Idempotente.
-- ----------------------------------------------------------------------------
ALTER TABLE public.plantillas_base
  ADD COLUMN IF NOT EXISTS plantilla_base_monto_modo VARCHAR(24) NULL;

ALTER TABLE public.plantillas_conciliacion
  ADD COLUMN IF NOT EXISTS plantilla_monto_modo VARCHAR(24) NULL;

COMMENT ON COLUMN public.plantillas_base.plantilla_base_monto_modo IS
  'Modo de importe para BankPages: debit_credit | signed | single_credit | single_debit | NULL (auto).';
COMMENT ON COLUMN public.plantillas_conciliacion.plantilla_monto_modo IS
  'Modo de importe para BankPages: debit_credit | signed | single_credit | single_debit | NULL (auto).';

-- ----------------------------------------------------------------------------
-- 2) Queries SAP_B1 con Debito y Credito en columnas separadas.
--    Reemplazar/acotar el WHERE segun corresponda.
--
--    NOTA DECIMALES: se usa TO_BIGINT(...) (entero, como las queries originales)
--    porque las cuentas son en Guaranies (PYG, sin decimales). Para monedas con
--    decimales (USD, EUR, etc.) TO_BIGINT REDONDEA y pierde centavos. En ese
--    caso reemplazar por el numerico crudo o decimal, p.ej.:
--        TO_VARCHAR(T0."DebAmount")              -- crudo (el back normaliza)
--        TO_VARCHAR(TO_DECIMAL(T0."DebAmount", 19, 2))
-- ----------------------------------------------------------------------------
UPDATE public.empresas_erp_configuraciones SET
  query_banco = $BANCO$
SELECT
    T0."Ref"                                AS "Referencia",
    TO_VARCHAR(T0."DueDate", 'YYYY-MM-DD')   AS "Fecha",
    TO_VARCHAR(TO_BIGINT(T0."DebAmount"))      AS "Debito",
    TO_VARCHAR(TO_BIGINT(T0."CredAmnt"))     AS "Credito",
    T0."Sequence"                           AS "Sequence"
FROM "${CompanyDB}".OBNK T0
WHERE
    T0."AcctCode" = $1
    AND T0."BankMatch" = 0
    AND T0."DueDate" BETWEEN $2 AND $3
ORDER BY T0."DueDate" DESC
$BANCO$,
  query_sistema = $SIS$
SELECT
    T0."Ref3Line"                           AS "Referencia",
    TO_VARCHAR(T0."RefDate", 'YYYY-MM-DD')   AS "Fecha",
    TO_VARCHAR(TO_BIGINT(T0."Debit"))        AS "Debito",
    TO_VARCHAR(TO_BIGINT(T0."Credit"))       AS "Credito",
    T0."TransId"                            AS "TransactionNumber",
    T0."Line_ID"                            AS "LineNumber"
FROM "${CompanyDB}".JDT1 T0
WHERE
    T0."Account" = $1
    AND T0."ExtrMatch" = 0
    AND T0."RefDate" BETWEEN $2 AND $3
ORDER BY T0."RefDate" DESC
$SIS$,
  epc_updated_at = NOW()
WHERE LOWER(epc_codigo) LIKE 'sap_b1%';

COMMIT;

-- ----------------------------------------------------------------------------
-- 3) Arreglo de plantillas donde el importe del banco viene en DEBE/HABER pero
--    esta mapeado como UNA sola columna (combinada 'E|F' o una sola), por lo que
--    se perdia el signo y TODO se cargaba como credito.
--
--    La solucion: agregar mapeos SEPARADOS debito/credito (solo-banco, sin
--    columna de sistema para NO afectar el matching Excel) y poner la plantilla
--    en modo debit_credit.
--
--    OJO: las columnas DIFIEREN por banco y NO siempre es izquierda=debito. Hay
--    que confirmarlas en el Excel de cada banco. Columnas verificadas en los
--    ejemplos del proyecto:
--      Conti / ExtractoDeCuenta : DEBE = E,  HABER = F
--      GNB                      : Importe Debito = H, Importe Credito = I
--      Itau                     : Debitos = D, Creditos = E
--      (Familiar / Sudameris    : confirmar en el Excel; el seed usa E|F)
--
--    NO se hace un split automatico de 'E|F' porque en algunos bancos (ej. Itau)
--    esa columna combinada no es DEBE|HABER. En su lugar se mapea por NOMBRE de
--    layout con las columnas YA verificadas (lista 'fix' abajo). Asi tambien el
--    "Visualizar" del extracto muestra 2 columnas (Debito / Credito) en vez de una
--    sola "Monto". El mapeo 'monto' existente se conserva (lo usa el match Excel).
--
--    Para ver/ajustar los nombres de layout y sus columnas de importe:
--      SELECT p.plantilla_id, p.plantilla_nombre, m.banco_columna
--      FROM public.plantillas_conciliacion p
--      JOIN public.plantillas_conciliacion_mapeos m ON m.plantilla_id = p.plantilla_id
--      WHERE m.banco_tipo_dato = 'amount'
--      ORDER BY p.plantilla_nombre;
--    Si tu layout tiene otro nombre, agregalo a la lista 'fix' con su patron ILIKE.
-- ----------------------------------------------------------------------------
BEGIN;

-- 3.a) Agregar mapeos SEPARADOS debito/credito a los layouts conocidos, por NOMBRE
--      (no hace falta buscar ids). Copia hoja/filas del mapeo de importe existente.
--      Idempotente: no duplica si el layout ya tiene 'debito'/'credito'.
WITH fix(name_like, debit_col, credit_col) AS (
  VALUES
    ('%conti%',     'E', 'F'),  -- Continental/Conti    : DEBE=E,  HABER=F             (verificado)
    ('%gnb%',       'H', 'I'),  -- GNB / GNB-443 / GNB3  : Imp.Debito=H, Imp.Credito=I (verificado)
    ('%itau%',      'D', 'E'),  -- Itau                  : Debitos=D, Creditos=E       (verificado)
    ('%familiar%',  'E', 'F')   -- Familiar              : Debito=E, Credito=F         (verificado en el Excel)
    -- Sudameris NO va aca: tiene importe UNICO con signo en col E (F=Saldo, no credito).
    -- Debe usar modo 'signed' con una sola columna de importe (col E), NO debito/credito.
    -- Si ya le agregaste debito/credito a un layout de Sudameris, ver la nota de correccion abajo.
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
  SELECT banco_hoja, banco_fila_inicio, banco_fila_fin
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
WHERE NOT EXISTS (
  SELECT 1 FROM public.plantillas_conciliacion_mapeos d
  WHERE d.plantilla_id = p.plantilla_id AND d.mapeo_clave_campo = x.clave
);

-- 3.b) Poner esos layouts en modo debit_credit (solo si estaban en NULL/auto).
UPDATE public.plantillas_conciliacion p
SET plantilla_monto_modo = 'debit_credit'
WHERE p.plantilla_monto_modo IS NULL
  AND EXISTS (
    SELECT 1 FROM public.plantillas_conciliacion_mapeos m
    WHERE m.plantilla_id = p.plantilla_id AND m.mapeo_clave_campo IN ('debito', 'credito')
  );

COMMIT;

-- ----------------------------------------------------------------------------
-- 4) Mostrar Debito/Credito EN EL LUGAR de la columna combinada (DEBE/HABER) y
--    OCULTAR esa columna combinada del "Visualizar".
--
--    El orden de columnas del preview se rige por mapeo_orden (asc, desempate por
--    id). Aca se reubica Debito/Credito en la posicion de la columna de importe
--    combinada del match y se DESACTIVA esa columna (las de importe CON columna de
--    sistema; una columna bank-only tipo "saldo" no se toca).
--
--    Que cuenta como "columna combinada a reemplazar": el/los mapeo(s) de importe
--    (banco_tipo_dato='amount') ACTIVOS, con columna de sistema (sistema_columna
--    IS NOT NULL = la del match Excel) y que NO son debito/credito. Una columna
--    bank-only tipo "saldo" (sistema NULL) NO se elige ni se oculta. La POSICION de
--    Debito/Credito se toma de la combinada de menor orden. NO depende del orden de
--    debito/credito (sirve esten al final o ya en cualquier posicion).
--
--    Idempotente: 4.c oculta la(s) columna(s) combinada(s). En una 2da corrida ya
--    no hay combinada ACTIVA, asi que el ancla queda vacia y no hace nada (sin drift
--    ni colisiones, ni aunque el layout tenga otra columna de importe tipo saldo).
--
--    Match Excel-vs-SAP: la columna combinada es la que aporta el importe a ese
--    match (tiene columna de sistema). Al ocultarla se pierde esa comparacion en
--    el match por Excel; para el flujo SAP_B1 (BankPages + conciliacion externa
--    por HANA) NO afecta. Si preferis conservar el match por Excel, simplemente
--    NO corras la seccion 4 (Debito/Credito quedan visibles al final y la
--    columna combinada se mantiene).
-- ----------------------------------------------------------------------------
BEGIN;

-- Ancla (para POSICIONAR): por cada layout con Debito y Credito ACTIVOS, la
-- columna de importe combinada del match (amount, activa, con columna de sistema)
-- de MENOR orden. Su id solo se usa para no auto-moverla en 4.a.
CREATE TEMP TABLE _amt_anchor ON COMMIT DROP AS
SELECT DISTINCT ON (c.plantilla_id)
       c.plantilla_id,
       c.mapeo_id    AS anchor_id,
       c.mapeo_orden AS amt_orden
FROM public.plantillas_conciliacion_mapeos c
WHERE c.banco_tipo_dato = 'amount'
  AND c.mapeo_activo = TRUE
  AND c.sistema_columna IS NOT NULL                      -- combinada del match (no un saldo bank-only)
  AND c.mapeo_clave_campo NOT IN ('debito', 'credito')
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

-- 4.a) Hacer lugar: +2 a los mapeos desde la posicion de la ancla en adelante,
--      salvo la propia ancla (por id) y debito/credito (se ubican en 4.b).
UPDATE public.plantillas_conciliacion_mapeos t
SET mapeo_orden = t.mapeo_orden + 2
FROM _amt_anchor a
WHERE t.plantilla_id = a.plantilla_id
  AND t.mapeo_orden >= a.amt_orden
  AND t.mapeo_id <> a.anchor_id
  AND t.mapeo_clave_campo NOT IN ('debito', 'credito');

-- 4.b) Colocar Debito (en el lugar de la combinada) y Credito (justo despues).
UPDATE public.plantillas_conciliacion_mapeos t
SET mapeo_orden = a.amt_orden
FROM _amt_anchor a
WHERE t.plantilla_id = a.plantilla_id AND t.mapeo_clave_campo = 'debito';

UPDATE public.plantillas_conciliacion_mapeos t
SET mapeo_orden = a.amt_orden + 1
FROM _amt_anchor a
WHERE t.plantilla_id = a.plantilla_id AND t.mapeo_clave_campo = 'credito';

-- 4.c) Ocultar TODAS las columnas de importe combinadas del match (amount, con
--      sistema) de esos layouts. Una columna bank-only tipo "saldo" (sistema NULL)
--      NO se toca. Esto es lo que hace re-ejecutable la seccion (no quedan
--      combinadas activas para una 2da corrida).
UPDATE public.plantillas_conciliacion_mapeos t
SET mapeo_activo = FALSE
FROM _amt_anchor a
WHERE t.plantilla_id = a.plantilla_id
  AND t.banco_tipo_dato = 'amount'
  AND t.mapeo_activo = TRUE
  AND t.sistema_columna IS NOT NULL
  AND t.mapeo_clave_campo NOT IN ('debito', 'credito');

COMMIT;

-- 4.d) Verificacion (deberia devolver 0 filas tras correr la seccion 4): layouts
--      con Debito Y Credito ACTIVOS que TODAVIA tienen activa una columna de
--      importe combinada (la del match Excel, con columna de sistema) => no quedo
--      oculta. Independiente del orden. Si aparece alguno, revisarlo a mano.
SELECT p.plantilla_id, p.plantilla_nombre
FROM public.plantillas_conciliacion p
WHERE EXISTS (
        SELECT 1 FROM public.plantillas_conciliacion_mapeos m
        WHERE m.plantilla_id = p.plantilla_id
          AND m.mapeo_clave_campo = 'debito' AND m.mapeo_activo = TRUE
      )
  AND EXISTS (
        SELECT 1 FROM public.plantillas_conciliacion_mapeos m
        WHERE m.plantilla_id = p.plantilla_id
          AND m.mapeo_clave_campo = 'credito' AND m.mapeo_activo = TRUE
      )
  AND EXISTS (
        SELECT 1 FROM public.plantillas_conciliacion_mapeos m
        WHERE m.plantilla_id = p.plantilla_id
          AND m.banco_tipo_dato = 'amount'
          AND m.mapeo_activo = TRUE
          AND m.mapeo_clave_campo NOT IN ('debito', 'credito')
          AND m.sistema_columna IS NOT NULL
      )
ORDER BY p.plantilla_nombre;

-- ----------------------------------------------------------------------------
-- 5) (OPCIONAL, correr SOLO si usas Sudameris) Revertir Sudameris a importe con
--    signo. Verificado en "Extracto de cuenta Sudameris Gs.xlsx": el importe va
--    con signo en UNA sola columna (E); F es el Saldo (NO es credito). Por eso
--    Sudameris NO debe usar debito/credito (eso cargaria el saldo como credito).
--    Si ya corriste las secciones 3 y 4 sobre un layout de Sudameris, esto lo
--    corrige: desactiva debito/credito, reactiva la columna de importe como UNICA
--    'E' y pone el layout en modo 'signed'. Acotado por nombre, idempotente.
--
--    NOTA: si tus columnas de descripcion/referencia/filas tambien quedaron mal,
--    lo mas limpio es borrar el layout de Sudameris y recrearlo desde la plantilla
--    ya corregida (seed 11). El seed correcto: Fecha=A, Descripcion=C, Importe=E
--    (signed), Referencia=D, datos desde fila 14.
-- ----------------------------------------------------------------------------
BEGIN;

-- 5.a) Desactivar debito/credito (no aplican a Sudameris: el importe es unico).
UPDATE public.plantillas_conciliacion_mapeos m
SET mapeo_activo = FALSE
FROM public.plantillas_conciliacion p
WHERE p.plantilla_id = m.plantilla_id
  AND p.plantilla_nombre ILIKE '%sudameris%'
  AND m.mapeo_clave_campo IN ('debito', 'credito');

-- 5.b) Reactivar la columna de importe (la del match, con sistema) y dejarla como
--      columna UNICA 'E' (importe con signo).
UPDATE public.plantillas_conciliacion_mapeos m
SET mapeo_activo = TRUE,
    banco_columna = 'E'
FROM public.plantillas_conciliacion p
WHERE p.plantilla_id = m.plantilla_id
  AND p.plantilla_nombre ILIKE '%sudameris%'
  AND m.banco_tipo_dato = 'amount'
  AND m.sistema_columna IS NOT NULL
  AND m.mapeo_clave_campo NOT IN ('debito', 'credito');

-- 5.c) Modo de importe = signed (+ = credito/ingreso, - = debito/egreso).
UPDATE public.plantillas_conciliacion p
SET plantilla_monto_modo = 'signed'
WHERE p.plantilla_nombre ILIKE '%sudameris%';

COMMIT;
