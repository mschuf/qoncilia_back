# Orden de ejecucion SQL (manual)

1. `01_create_extensions.sql`
2. `02_create_users_table.sql`
3. `03_users_updated_at_trigger.sql`
4. `04_seed_superadmin_template.sql` (opcional)
5. `05_drop_company_domain.sql` (si venis de la version con empresa)
6. `06_create_conciliation_tables.sql`
7. `07_seed_layout_templates_paraguay.sql` (opcional)
8. `08_seed_layout_templates_gnb_itau.sql` (opcional)
9. `09_rbac_empresas_roles_modulos.sql` (obligatorio para el nuevo modelo)
10. `10_seed_superadmin_template_rbac.sql` (opcional, solo si necesitas crear superadmin por SQL)
11. `11_create_usuarios_roles_table.sql` (recomendado para tabla puente usuario<->rol)
12. `12_create_template_layout_and_incremental_updates.sql` (recomendado para templates reutilizables e importaciones incrementales)
13. `13_seed_default_templates_from_existing_layouts.sql` (opcional, copia como templates los layouts que ya existen en tu base)
14. `14_create_erp_configs_and_shipments.sql` (recomendado para configuracion ERP por empresa y envios a SAP Service Layer)
15. `15_company_profile_and_admin_banking.sql` (recomendado para perfil extendido de empresa y ABM admin de bancos/cuentas)
16. `16_manual_alter_empresas_y_bancos.sql` (manual, para renombrar `emp_id_fiscal` y mover `sucursal` a `bancos` en bases ya existentes)
17. `17_manual_empresas_id_fiscal_sin_romper_fk.sql` (manual, alternativa mas segura para bases con datos: crea `emp_id_fiscal` sin borrar/recrear `empresas`)

## Notas

- El paso `05` es idempotente: si ya no existen `empresas` o `emp_id`, no falla.
- El paso `06` crea el modelo nuevo `usuario -> bancos -> layouts -> conciliaciones`.
- El paso `08` agrega templates para `GNB` e `Itau`, incluyendo 3 layouts para GNB
  (`GNB`, `GNB-443`, `GNB3`).
- El paso `09` crea tablas de `roles`, `empresas`, `modulos` y la matriz
  `empresas_roles_modulos`, y migra `usuarios` para requerir empresa + rol.
  Tambien elimina columnas legacy de permisos (`usr_is_admin`, `usr_is_super_admin`) y
  usa unicamente `rol_id`/`rol_codigo` para autorizacion.
- El paso `10` es el template de superadmin para el modelo RBAC nuevo.
- El paso `11` crea `usuarios_roles` como tabla puente para asignaciones de rol por usuario
  (incluye una marca de rol principal) y sincroniza automaticamente con `usuarios.rol_id`
  para mantener compatibilidad con el backend actual.
- El paso `12` agrega `template_layout`, sus mappings, la referencia opcional desde
  `conciliacion_layouts` hacia el template usado y el contador `con_update_count`
  para poder actualizar conciliaciones existentes sin duplicar lineas.
- El paso `13` toma los layouts actuales de `conciliacion_layouts` y sus mappings,
  y los inserta en `template_layout`/`template_layout_mapping` de forma idempotente.
- El paso `14` crea las tablas `empresas_erp_configuraciones` y
  `conciliaciones_erp_envios`, agrega el modulo `erp_management`
  y lo habilita por defecto para `admin` e `is_super_admin`.
- El paso `15` agrega campos ERP visibles en `empresas`, crea `bancos`
  y `empresas_cuentas_bancarias`, y habilita `layout_management`
  tambien para `admin`.
- El paso `16` es para ambientes ya creados: asegura que exista
  `empresas.emp_id_fiscal`, copia `ecb_sucursal` hacia `bancos.ban_sucursal`
  y elimina la columna vieja de cuentas.
- El paso `17` es la alternativa recomendada cuando ya hay datos y FKs activas:
  no borra ni recrea `empresas`, hace backup y crea `emp_id_fiscal`.
- En los mappings podes usar columnas alternativas con separador `|`.
  Ejemplo: `E|F` toma la primera columna con dato en esa fila, util para extractos con Debito/Credito separados.
