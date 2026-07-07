-- Agrega los queries ERP (banco/sistema) a las PLANTILLAS ERP globales, para que
-- una plantilla pueda llevar el query y propagarlo al copiarse a una empresa.
-- Incremental e idempotente. No afecta plantillas existentes (columnas nullables).

ALTER TABLE public.erp_configuraciones_plantillas
  ADD COLUMN IF NOT EXISTS query_banco TEXT,
  ADD COLUMN IF NOT EXISTS query_sistema TEXT;
