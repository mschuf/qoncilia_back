-- =============================================================================
-- Modulos por pantalla para el workbench separado:
--   * bank_conciliation -> pagina "Conciliacion de banco" (/conciliacion-banco, SAP_B1)
--   * card_payment      -> pagina "Pago de tarjeta"       (/pago-tarjeta, SAP_TARJETAS)
--
-- La pantalla del superadmin "Modulos por Empresa y Rol" (/access-control) es
-- generica: con este INSERT los checkboxes nuevos aparecen solos, sin tocar codigo.
-- Ademas se habilitan de entrada para todas las empresas y los 4 roles; el
-- superadmin puede apagarlos por empresa/rol desde /access-control. El grant usa
-- ON CONFLICT DO NOTHING a proposito: re-correr el seed NO pisa lo que el
-- superadmin haya apagado (a diferencia de los seeds 14/17 con erp_management).
--
-- Nota: los items del menu ("Cargar Extractos" sigue con el modulo conciliation)
-- y las rutas del front gatean con estos codigos; el backend los exige en los
-- endpoints del workbench (semantica OR con conciliation/erp_management).
-- =============================================================================

BEGIN;

INSERT INTO public.modulos (
  mod_codigo,
  mod_nombre,
  mod_ruta,
  mod_descripcion,
  mod_activo
) VALUES
  (
    'bank_conciliation',
    'Conciliacion de Banco',
    '/conciliacion-banco',
    'Workbench de conciliacion bancaria contra SAP B1 (config ERP SAP_B1).',
    TRUE
  ),
  (
    'card_payment',
    'Pago de Tarjeta',
    '/pago-tarjeta',
    'Conciliacion de liquidaciones de tarjeta debito y credito contra OCRH (config ERP SAP_TARJETAS).',
    TRUE
  )
ON CONFLICT (mod_codigo) DO UPDATE
SET
  mod_nombre = EXCLUDED.mod_nombre,
  mod_ruta = EXCLUDED.mod_ruta,
  mod_descripcion = EXCLUDED.mod_descripcion,
  mod_activo = EXCLUDED.mod_activo;

INSERT INTO public.empresas_roles_modulos (
  emp_id,
  rol_id,
  mod_id,
  erm_habilitado
)
SELECT
  e.emp_id,
  r.rol_id,
  m.mod_id,
  TRUE
FROM public.empresas e
JOIN public.roles r
  ON r.rol_codigo IN ('is_super_admin', 'admin', 'gestor_cobranza', 'gestor_pagos')
JOIN public.modulos m
  ON m.mod_codigo IN ('bank_conciliation', 'card_payment')
ON CONFLICT (emp_id, rol_id, mod_id) DO NOTHING;

COMMIT;
