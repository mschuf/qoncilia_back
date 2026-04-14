# Orden de ejecucion SQL (manual)

1. `01_create_extensions.sql`
2. `02_create_users_table.sql`
3. `03_users_updated_at_trigger.sql`
4. `04_seed_superadmin_template.sql` (opcional)
5. `05_drop_company_domain.sql` (si venis de la version con empresa)
6. `06_create_conciliation_tables.sql`
7. `07_seed_layout_templates_paraguay.sql` (opcional)
8. `08_seed_layout_templates_gnb_itau.sql` (opcional)

## Notas

- El paso `05` es idempotente: si ya no existen `empresas` o `emp_id`, no falla.
- El paso `06` crea el modelo nuevo `usuario -> bancos -> layouts -> conciliaciones`.
- El paso `08` agrega templates para `GNB` e `Itau`, incluyendo 3 layouts para GNB
  (`GNB`, `GNB-443`, `GNB3`).
- En los mappings podes usar columnas alternativas con separador `|`.
  Ejemplo: `E|F` toma la primera columna con dato en esa fila, util para extractos con Debito/Credito separados.
