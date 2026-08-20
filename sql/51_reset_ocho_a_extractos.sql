-- Reinicio exclusivo de los extractos bancarios de OCHO_A.
--
-- Alcance:
--   * elimina cabeceras de public.extractos_bancarios;
--   * PostgreSQL elimina automáticamente sus filas de
--     public.extractos_bancarios_filas (FK ON DELETE CASCADE);
--   * no elimina conciliaciones, resultados, bancos, cuentas ni plantillas.
--
-- Primero ejecute solo el SELECT de verificación. Debe mostrar únicamente los
-- extractos de OCHO_A que se desea reiniciar. Luego ejecute el DELETE.

WITH empresa_objetivo AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(TRIM(emp_id_fiscal)) = 'ocho_a'
)
SELECT
  eb.extracto_id,
  eb.extracto_nombre,
  b.banco_nombre,
  eb.extracto_total_filas,
  eb.extracto_creado_en
FROM public.extractos_bancarios AS eb
JOIN public.cuentas_bancarias AS cb
  ON cb.cuenta_bancaria_id = eb.cuenta_bancaria_id
JOIN public.bancos AS b
  ON b.banco_id = eb.banco_id
JOIN empresa_objetivo AS eo
  ON eo.emp_id = cb.empresa_id
 AND eo.emp_id = b.empresa_id
ORDER BY eb.extracto_creado_en, eb.extracto_id;

-- Ejecutar esta segunda sentencia solo después de validar el SELECT anterior.
-- RETURNING deja constancia de cada extracto eliminado.
WITH empresa_objetivo AS (
  SELECT emp_id
  FROM public.empresas
  WHERE LOWER(TRIM(emp_id_fiscal)) = 'ocho_a'
),
extractos_objetivo AS (
  SELECT eb.extracto_id
  FROM public.extractos_bancarios AS eb
  JOIN public.cuentas_bancarias AS cb
    ON cb.cuenta_bancaria_id = eb.cuenta_bancaria_id
  JOIN public.bancos AS b
    ON b.banco_id = eb.banco_id
  JOIN empresa_objetivo AS eo
    ON eo.emp_id = cb.empresa_id
   AND eo.emp_id = b.empresa_id
)
DELETE FROM public.extractos_bancarios AS eb
USING extractos_objetivo AS eo
WHERE eb.extracto_id = eo.extracto_id
RETURNING eb.extracto_id, eb.extracto_nombre, eb.extracto_total_filas;
