BEGIN;

DROP TRIGGER IF EXISTS trg_extractos_bancarios_touch_actualizado_en ON public.extractos_bancarios;
DROP TRIGGER IF EXISTS trg_conciliacion_resultados_touch_actualizado_en ON public.conciliacion_resultados;
DROP TRIGGER IF EXISTS trg_conciliaciones_touch_actualizado_en ON public.conciliaciones;
DROP TRIGGER IF EXISTS trg_plantillas_conciliacion_mapeos_touch_actualizado_en ON public.plantillas_conciliacion_mapeos;
DROP TRIGGER IF EXISTS trg_plantillas_conciliacion_touch_actualizado_en ON public.plantillas_conciliacion;
DROP TRIGGER IF EXISTS trg_plantillas_base_mapeos_touch_actualizado_en ON public.plantillas_base_mapeos;
DROP TRIGGER IF EXISTS trg_plantillas_base_touch_actualizado_en ON public.plantillas_base;
DROP TRIGGER IF EXISTS trg_sistemas_touch_actualizado_en ON public.sistemas;

DROP TRIGGER IF EXISTS trg_conciliacion_matches_touch_updated_at ON public.conciliacion_matches;
DROP TRIGGER IF EXISTS trg_conciliaciones_touch_updated_at ON public.conciliaciones;
DROP TRIGGER IF EXISTS trg_conciliacion_layout_mappings_touch_updated_at ON public.conciliacion_layout_mappings;
DROP TRIGGER IF EXISTS trg_conciliacion_layouts_touch_updated_at ON public.conciliacion_layouts;
DROP TRIGGER IF EXISTS trg_template_layout_mapping_touch_updated_at ON public.template_layout_mapping;
DROP TRIGGER IF EXISTS trg_template_layout_touch_updated_at ON public.template_layout;
DROP TRIGGER IF EXISTS trg_conciliation_systems_touch_updated_at ON public.conciliation_systems;

DROP TABLE IF EXISTS public.extractos_bancarios_filas CASCADE;
DROP TABLE IF EXISTS public.extractos_bancarios CASCADE;
DROP TABLE IF EXISTS public.conciliacion_resultados CASCADE;
DROP TABLE IF EXISTS public.conciliacion_matches CASCADE;
DROP TABLE IF EXISTS public.conciliaciones CASCADE;
DROP TABLE IF EXISTS public.plantillas_conciliacion_mapeos CASCADE;
DROP TABLE IF EXISTS public.conciliacion_layout_mappings CASCADE;
DROP TABLE IF EXISTS public.plantillas_conciliacion CASCADE;
DROP TABLE IF EXISTS public.conciliacion_layouts CASCADE;
DROP TABLE IF EXISTS public.plantillas_base_mapeos CASCADE;
DROP TABLE IF EXISTS public.template_layout_mapping CASCADE;
DROP TABLE IF EXISTS public.plantillas_base CASCADE;
DROP TABLE IF EXISTS public.template_layout CASCADE;
DROP TABLE IF EXISTS public.sistemas CASCADE;
DROP TABLE IF EXISTS public.conciliation_systems CASCADE;
DROP TABLE IF EXISTS public.migrations CASCADE;

CREATE TABLE public.sistemas (
  sistema_id SERIAL PRIMARY KEY,
  sistema_nombre VARCHAR(120) NOT NULL,
  sistema_descripcion VARCHAR(255) NULL,
  sistema_activo BOOLEAN NOT NULL DEFAULT TRUE,
  sistema_creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sistema_actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sistemas_nombre_not_blank CHECK (length(trim(sistema_nombre)) > 0)
);

CREATE UNIQUE INDEX uq_sistemas_nombre
  ON public.sistemas ((LOWER(sistema_nombre)));

CREATE TABLE public.plantillas_base (
  plantilla_base_id SERIAL PRIMARY KEY,
  plantilla_base_nombre VARCHAR(120) NOT NULL,
  plantilla_base_descripcion VARCHAR(255) NULL,
  plantilla_base_banco_referencia VARCHAR(120) NULL,
  sistema_id INTEGER NOT NULL,
  plantilla_base_etiqueta_sistema VARCHAR(120) NOT NULL DEFAULT 'Sistema',
  plantilla_base_etiqueta_banco VARCHAR(120) NOT NULL DEFAULT 'Banco',
  plantilla_base_umbral_auto_match DOUBLE PRECISION NOT NULL DEFAULT 1,
  plantilla_base_activa BOOLEAN NOT NULL DEFAULT TRUE,
  plantilla_base_creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  plantilla_base_actualizada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_plantillas_base_nombre_not_blank CHECK (length(trim(plantilla_base_nombre)) > 0),
  CONSTRAINT chk_plantillas_base_threshold_range CHECK (
    plantilla_base_umbral_auto_match >= 0 AND plantilla_base_umbral_auto_match <= 1
  ),
  CONSTRAINT fk_plantillas_base_sistemas FOREIGN KEY (sistema_id)
    REFERENCES public.sistemas (sistema_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX uq_plantillas_base_nombre
  ON public.plantillas_base ((LOWER(plantilla_base_nombre)));

CREATE INDEX idx_plantillas_base_sistema_id
  ON public.plantillas_base (sistema_id);

CREATE TABLE public.plantillas_base_mapeos (
  mapeo_base_id SERIAL PRIMARY KEY,
  plantilla_base_id INTEGER NOT NULL,
  mapeo_base_clave_campo VARCHAR(60) NOT NULL,
  mapeo_base_etiqueta VARCHAR(120) NOT NULL,
  mapeo_base_orden INTEGER NOT NULL DEFAULT 0,
  mapeo_base_activo BOOLEAN NOT NULL DEFAULT TRUE,
  mapeo_base_requerido BOOLEAN NOT NULL DEFAULT FALSE,
  mapeo_base_operador_comparacion VARCHAR(40) NOT NULL DEFAULT 'equals',
  mapeo_base_peso DOUBLE PRECISION NOT NULL DEFAULT 1,
  mapeo_base_tolerancia DOUBLE PRECISION NULL,
  sistema_hoja VARCHAR(120) NULL,
  sistema_columna VARCHAR(30) NULL,
  sistema_fila_inicio INTEGER NULL,
  sistema_fila_fin INTEGER NULL,
  sistema_tipo_dato VARCHAR(20) NOT NULL DEFAULT 'text',
  banco_hoja VARCHAR(120) NULL,
  banco_columna VARCHAR(30) NULL,
  banco_fila_inicio INTEGER NULL,
  banco_fila_fin INTEGER NULL,
  banco_tipo_dato VARCHAR(20) NOT NULL DEFAULT 'text',
  mapeo_base_creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mapeo_base_actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_plantillas_base_mapeos_field_not_blank CHECK (length(trim(mapeo_base_clave_campo)) > 0),
  CONSTRAINT chk_plantillas_base_mapeos_label_not_blank CHECK (length(trim(mapeo_base_etiqueta)) > 0),
  CONSTRAINT chk_plantillas_base_mapeos_weight_non_negative CHECK (mapeo_base_peso >= 0),
  CONSTRAINT fk_plantillas_base_mapeos_plantillas_base FOREIGN KEY (plantilla_base_id)
    REFERENCES public.plantillas_base (plantilla_base_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_plantillas_base_mapeos_campo
  ON public.plantillas_base_mapeos (plantilla_base_id, LOWER(mapeo_base_clave_campo));

CREATE INDEX idx_plantillas_base_mapeos_plantilla_base_id
  ON public.plantillas_base_mapeos (plantilla_base_id);

CREATE TABLE public.plantillas_conciliacion (
  plantilla_id SERIAL PRIMARY KEY,
  banco_id INTEGER NOT NULL,
  plantilla_base_id INTEGER NULL,
  sistema_id INTEGER NOT NULL,
  plantilla_nombre VARCHAR(120) NOT NULL,
  plantilla_descripcion VARCHAR(255) NULL,
  plantilla_etiqueta_sistema VARCHAR(120) NOT NULL DEFAULT 'Sistema',
  plantilla_etiqueta_banco VARCHAR(120) NOT NULL DEFAULT 'Banco',
  plantilla_umbral_auto_match DOUBLE PRECISION NOT NULL DEFAULT 1,
  plantilla_activa BOOLEAN NOT NULL DEFAULT FALSE,
  plantilla_creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  plantilla_actualizada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_plantillas_conciliacion_nombre_not_blank CHECK (length(trim(plantilla_nombre)) > 0),
  CONSTRAINT chk_plantillas_conciliacion_threshold_range CHECK (plantilla_umbral_auto_match >= 0 AND plantilla_umbral_auto_match <= 1),
  CONSTRAINT fk_plantillas_conciliacion_bancos FOREIGN KEY (banco_id) REFERENCES public.bancos (banco_id) ON DELETE CASCADE,
  CONSTRAINT fk_plantillas_conciliacion_sistemas FOREIGN KEY (sistema_id)
    REFERENCES public.sistemas (sistema_id) ON DELETE RESTRICT,
  CONSTRAINT fk_plantillas_conciliacion_plantillas_base FOREIGN KEY (plantilla_base_id)
    REFERENCES public.plantillas_base (plantilla_base_id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX uq_plantillas_conciliacion_activa
  ON public.plantillas_conciliacion (banco_id)
  WHERE plantilla_activa = TRUE;

CREATE UNIQUE INDEX uq_plantillas_conciliacion_banco_base
  ON public.plantillas_conciliacion (banco_id, plantilla_base_id)
  WHERE plantilla_base_id IS NOT NULL;

CREATE INDEX idx_plantillas_conciliacion_banco_id
  ON public.plantillas_conciliacion (banco_id);

CREATE INDEX idx_plantillas_conciliacion_sistema_id
  ON public.plantillas_conciliacion (sistema_id);

CREATE INDEX idx_plantillas_conciliacion_plantilla_base_id
  ON public.plantillas_conciliacion (plantilla_base_id);

CREATE TABLE public.plantillas_conciliacion_mapeos (
  mapeo_id SERIAL PRIMARY KEY,
  plantilla_id INTEGER NOT NULL,
  mapeo_clave_campo VARCHAR(60) NOT NULL,
  mapeo_etiqueta VARCHAR(120) NOT NULL,
  mapeo_orden INTEGER NOT NULL DEFAULT 0,
  mapeo_activo BOOLEAN NOT NULL DEFAULT TRUE,
  mapeo_requerido BOOLEAN NOT NULL DEFAULT FALSE,
  mapeo_operador_comparacion VARCHAR(40) NOT NULL DEFAULT 'equals',
  mapeo_peso DOUBLE PRECISION NOT NULL DEFAULT 1,
  mapeo_tolerancia DOUBLE PRECISION NULL,
  sistema_hoja VARCHAR(120) NULL,
  sistema_columna VARCHAR(30) NULL,
  sistema_fila_inicio INTEGER NULL,
  sistema_fila_fin INTEGER NULL,
  sistema_tipo_dato VARCHAR(20) NOT NULL DEFAULT 'text',
  banco_hoja VARCHAR(120) NULL,
  banco_columna VARCHAR(30) NULL,
  banco_fila_inicio INTEGER NULL,
  banco_fila_fin INTEGER NULL,
  banco_tipo_dato VARCHAR(20) NOT NULL DEFAULT 'text',
  mapeo_creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  mapeo_actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_plantillas_conciliacion_mapeos_field_not_blank CHECK (length(trim(mapeo_clave_campo)) > 0),
  CONSTRAINT chk_plantillas_conciliacion_mapeos_label_not_blank CHECK (length(trim(mapeo_etiqueta)) > 0),
  CONSTRAINT chk_plantillas_conciliacion_mapeos_weight_non_negative CHECK (mapeo_peso >= 0),
  CONSTRAINT fk_plantillas_conciliacion_mapeos_plantillas FOREIGN KEY (plantilla_id)
    REFERENCES public.plantillas_conciliacion (plantilla_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX uq_plantillas_conciliacion_mapeos_campo
  ON public.plantillas_conciliacion_mapeos (plantilla_id, LOWER(mapeo_clave_campo));

CREATE INDEX idx_plantillas_conciliacion_mapeos_plantilla_id
  ON public.plantillas_conciliacion_mapeos (plantilla_id);

CREATE TABLE public.extractos_bancarios (
  extracto_id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  banco_id INTEGER NOT NULL,
  cuenta_bancaria_id INTEGER NOT NULL,
  plantilla_id INTEGER NOT NULL,
  extracto_nombre VARCHAR(160) NOT NULL,
  extracto_archivo VARCHAR(255) NOT NULL,
  extracto_estado VARCHAR(40) NOT NULL DEFAULT 'saved',
  extracto_total_filas INTEGER NOT NULL DEFAULT 0,
  extracto_metadata JSONB NULL,
  extracto_creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  extracto_actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_extractos_bancarios_nombre_not_blank CHECK (length(trim(extracto_nombre)) > 0),
  CONSTRAINT chk_extractos_bancarios_archivo_not_blank CHECK (length(trim(extracto_archivo)) > 0),
  CONSTRAINT chk_extractos_bancarios_total_non_negative CHECK (extracto_total_filas >= 0),
  CONSTRAINT fk_extractos_bancarios_usuarios FOREIGN KEY (usuario_id)
    REFERENCES public.usuarios (usr_id) ON DELETE CASCADE,
  CONSTRAINT fk_extractos_bancarios_bancos FOREIGN KEY (banco_id)
    REFERENCES public.bancos (banco_id) ON DELETE CASCADE,
  CONSTRAINT fk_extractos_bancarios_cuentas_bancarias FOREIGN KEY (cuenta_bancaria_id)
    REFERENCES public.cuentas_bancarias (cuenta_bancaria_id) ON DELETE RESTRICT,
  CONSTRAINT fk_extractos_bancarios_plantillas FOREIGN KEY (plantilla_id)
    REFERENCES public.plantillas_conciliacion (plantilla_id) ON DELETE RESTRICT
);

CREATE INDEX idx_extractos_bancarios_usuario_id
  ON public.extractos_bancarios (usuario_id);

CREATE INDEX idx_extractos_bancarios_banco_id
  ON public.extractos_bancarios (banco_id);

CREATE INDEX idx_extractos_bancarios_cuenta_bancaria_id
  ON public.extractos_bancarios (cuenta_bancaria_id);

CREATE INDEX idx_extractos_bancarios_plantilla_id
  ON public.extractos_bancarios (plantilla_id);

CREATE INDEX idx_extractos_bancarios_creado_en
  ON public.extractos_bancarios (extracto_creado_en DESC);

CREATE TABLE public.extractos_bancarios_filas (
  extracto_fila_id SERIAL PRIMARY KEY,
  extracto_id INTEGER NOT NULL,
  extracto_fila_origen_id VARCHAR(120) NOT NULL,
  extracto_numero_fila INTEGER NOT NULL,
  extracto_valores JSONB NOT NULL,
  extracto_normalizados JSONB NOT NULL,
  extracto_fila_creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_extractos_bancarios_filas_origen_not_blank CHECK (length(trim(extracto_fila_origen_id)) > 0),
  CONSTRAINT chk_extractos_bancarios_filas_numero_positive CHECK (extracto_numero_fila > 0),
  CONSTRAINT fk_extractos_bancarios_filas_extractos FOREIGN KEY (extracto_id)
    REFERENCES public.extractos_bancarios (extracto_id) ON DELETE CASCADE
);

CREATE INDEX idx_extractos_bancarios_filas_extracto_id
  ON public.extractos_bancarios_filas (extracto_id);

CREATE UNIQUE INDEX uq_extractos_bancarios_filas_origen
  ON public.extractos_bancarios_filas (extracto_id, extracto_fila_origen_id);

INSERT INTO public.sistemas (
  sistema_nombre,
  sistema_descripcion,
  sistema_activo
)
VALUES (
  'SAP',
  'Sistema base para seeds y plantillas iniciales de conciliacion.',
  TRUE
)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_touch_sistemas_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.sistema_actualizado_en = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_touch_plantillas_base_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.plantilla_base_actualizada_en = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_touch_plantillas_base_mapeos_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mapeo_base_actualizado_en = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_touch_plantillas_conciliacion_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.plantilla_actualizada_en = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_touch_plantillas_conciliacion_mapeos_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.mapeo_actualizado_en = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_touch_extractos_bancarios_actualizado_en()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.extracto_actualizado_en = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sistemas_touch_actualizado_en
BEFORE UPDATE ON public.sistemas
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_sistemas_actualizado_en();

CREATE TRIGGER trg_plantillas_base_touch_actualizado_en
BEFORE UPDATE ON public.plantillas_base
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_plantillas_base_actualizado_en();

CREATE TRIGGER trg_plantillas_base_mapeos_touch_actualizado_en
BEFORE UPDATE ON public.plantillas_base_mapeos
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_plantillas_base_mapeos_actualizado_en();

CREATE TRIGGER trg_plantillas_conciliacion_touch_actualizado_en
BEFORE UPDATE ON public.plantillas_conciliacion
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_plantillas_conciliacion_actualizado_en();

CREATE TRIGGER trg_plantillas_conciliacion_mapeos_touch_actualizado_en
BEFORE UPDATE ON public.plantillas_conciliacion_mapeos
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_plantillas_conciliacion_mapeos_actualizado_en();

CREATE TRIGGER trg_extractos_bancarios_touch_actualizado_en
BEFORE UPDATE ON public.extractos_bancarios
FOR EACH ROW
EXECUTE FUNCTION public.fn_touch_extractos_bancarios_actualizado_en();

COMMIT;
