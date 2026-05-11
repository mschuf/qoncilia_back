-- Indices y optimizaciones para paginar y filtrar la tabla extractos_bancarios
-- y acelerar las KPIs de conciliacion. Se asume que pg_trgm ya esta instalado
-- por la migracion 23.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indice compuesto para listados paginados ordenados por fecha (DESC).
-- Cubre los filtros mas comunes del workbench: usuario, banco, cuenta, plantilla.
CREATE INDEX IF NOT EXISTS idx_extractos_bancarios_listado
  ON public.extractos_bancarios (
    usuario_id,
    banco_id,
    cuenta_bancaria_id,
    plantilla_id,
    extracto_creado_en DESC,
    extracto_id DESC
  );

-- Indice para ordenar/filtrar por fecha cuando solo se aplica
-- el scope de empresa (admin/superadmin).
CREATE INDEX IF NOT EXISTS idx_extractos_bancarios_creado_en_id
  ON public.extractos_bancarios (extracto_creado_en DESC, extracto_id DESC);

-- Busqueda por alias del extracto (ILIKE %...%) sin sequential scan.
CREATE INDEX IF NOT EXISTS idx_extractos_bancarios_nombre_trgm
  ON public.extractos_bancarios USING GIN (LOWER(extracto_nombre) gin_trgm_ops);

-- Busqueda por nombre de archivo (ILIKE %...%) sin sequential scan.
CREATE INDEX IF NOT EXISTS idx_extractos_bancarios_archivo_trgm
  ON public.extractos_bancarios USING GIN (LOWER(extracto_archivo) gin_trgm_ops);

-- Cubre la query de detalle de filas de un extracto ordenado por numero de fila.
CREATE INDEX IF NOT EXISTS idx_extractos_bancarios_filas_extracto_orden
  ON public.extractos_bancarios_filas (extracto_id, extracto_numero_fila ASC);

COMMIT;
