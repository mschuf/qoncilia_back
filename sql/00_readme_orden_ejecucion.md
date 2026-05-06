# Orden de ejecucion SQL (recreacion desde cero)

Estos scripts estan pensados para un `DROP`/recreacion limpia. Los scripts principales eliminan estructuras legacy antes de crear las tablas actuales, por lo que no dependen de migraciones TypeORM.

## Orden recomendado

1. `01_create_extensions.sql`
2. `02_create_users_table.sql`
3. `03_users_updated_at_trigger.sql`
4. `04_seed_superadmin_template.sql` (opcional)
5. `05_rbac_empresas_roles_modulos.sql`
6. `06_seed_superadmin_template_rbac.sql` (opcional recomendado)
7. `07_create_usuarios_roles_table.sql` (limpieza legacy: elimina `usuarios_roles`)
8. `08_company_profile_and_admin_banking.sql`
9. `09_create_conciliation_tables.sql`
10. `10_create_template_layout_and_incremental_updates.sql` (marcador informativo)
11. `11_seed_layout_templates_paraguay.sql` (opcional)
12. `12_seed_layout_templates_gnb_itau.sql` (opcional)
13. `14_create_erp_configs_and_shipments.sql` (opcional recomendado para ERP)
14. `15_create_bank_template_availability.sql` (compatibilidad con habilitaciones legacy por banco)
15. `16_seed_sap_b1_config.sql` (opcional, configurar empresa destino antes de ejecutar)
16. `17_create_erp_sessions_and_gestor_access.sql`
17. `18_create_user_template_availability.sql` (habilitaciones globales por usuario admin)

## Notas

- `08_company_profile_and_admin_banking.sql` crea `monedas`, `bancos` y `cuentas_bancarias`.
- El rol unico del usuario vive en `usuarios.rol_id`. `usuarios_roles` fue eliminado para evitar inconsistencias en login y permisos.
- `04_seed_superadmin_template.sql` crea el usuario `morteira`; `05` lo enlaza con empresa Qoncilia y rol `is_super_admin`.
- `09_create_conciliation_tables.sql` crea `sistemas`, `plantillas_base`, `plantillas_conciliacion`, `extractos_bancarios` y `extractos_bancarios_filas`.
- Los extractos bancarios requieren `cuenta_bancaria_id` y `plantilla_id`; ya no se crean tablas para guardar Excel del sistema ni resultados de comparacion.
- `lyt_source_layout_id` fue eliminado. La sincronizacion de plantillas admin -> gestor se hace por empresa, banco, sistema y plantilla base.
- `conciliaciones`, `conciliacion_resultados` y `conciliaciones_erp_envios` fueron eliminadas del esquema operativo porque la comparacion ya es temporal.
- `13_seed_default_templates_from_existing_layouts.sql` y `15_upgrade_conciliation_accounts_systems_and_gestors.sql` fueron retirados porque este flujo ya no migra estructuras intermedias.
- Los seeds `11` y `12` cargan bancos, cuentas, sistemas y plantillas sobre el esquema nuevo.
- Desde `18`, las plantillas base habilitadas por superadmin son globales por usuario admin; el script migra lo que exista en la tabla legacy por banco.
