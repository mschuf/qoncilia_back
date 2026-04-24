# Orden de ejecucion SQL (recreacion desde cero)

Todos los scripts de creacion relevantes ya arrancan con `DROP TABLE IF EXISTS` para que puedas reconstruir el esquema sin depender de migraciones TypeORM ni del modelo legacy `usuarios_bancos`.

## Orden recomendado

1. `01_create_extensions.sql`
2. `02_create_users_table.sql`
3. `03_users_updated_at_trigger.sql`
4. `04_seed_superadmin_template.sql` (opcional, si queres dejar un `superadmin` base antes del modelo RBAC)
5. `09_rbac_empresas_roles_modulos.sql`
6. `10_seed_superadmin_template_rbac.sql` (opcional, recomendado si queres crear el superadmin ya con RBAC)
7. `11_create_usuarios_roles_table.sql`
8. `15_company_profile_and_admin_banking.sql`
9. `06_create_conciliation_tables.sql`
10. `12_create_template_layout_and_incremental_updates.sql`
11. `07_seed_layout_templates_paraguay.sql` (opcional)
12. `08_seed_layout_templates_gnb_itau.sql` (opcional)
13. `13_seed_default_templates_from_existing_layouts.sql` (opcional)
14. `14_create_erp_configs_and_shipments.sql` (opcional pero recomendado)

## Notas

- `15_company_profile_and_admin_banking.sql` crea el banco unificado en `bancos` con vínculo a empresa y usuario responsable, y deja `empresas_cuentas_bancarias` como tabla hija de ese banco.
- `06_create_conciliation_tables.sql` ya no crea `usuarios_bancos`. Los layouts y conciliaciones quedan relacionados con `bancos` por `ban_id`.
- `06_create_conciliation_tables.sql` también elimina `public.migrations`, porque el proyecto ya no depende de la tabla de migraciones de TypeORM.
- `12_create_template_layout_and_incremental_updates.sql` recrea `template_layout` y `template_layout_mapping`, y vuelve a enlazar `conciliacion_layouts.tpl_id`.
- `07` y `08` fueron adaptados al nuevo esquema y cargan bancos/layouts sobre `bancos`.
- `13` sigue siendo opcional: toma los layouts ya existentes y los copia como templates por defecto.
- Los scripts manuales viejos orientados a migrar desde estructuras intermedias (`05`, `16`, `17`) fueron eliminados porque ya no aplican al flujo actual de recreacion limpia.
