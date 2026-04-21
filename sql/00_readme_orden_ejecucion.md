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
- En los mappings podes usar columnas alternativas con separador `|`.
  Ejemplo: `E|F` toma la primera columna con dato en esa fila, util para extractos con Debito/Credito separados.
