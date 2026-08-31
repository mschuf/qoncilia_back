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
18. `19_seed_template_base_mappings.sql` (completa campos en plantillas base y copias existentes)
19. `v20_add_company_details.sql`
20. `21_drop_bank_alias.sql` (elimina `banco_alias` de bases existentes)
21. `22_add_company_region_country.sql` (agrega region y pais a empresas)
22. `23_optimize_company_banking_pagination.sql` (indices para paginado y busqueda bancaria)
23. `24_optimize_bank_statements_pagination.sql` (indices para paginado de extractos)
24. `25_remove_systems_and_update_erp_config.sql` (migracion manual para bases ya existentes)
25. `26_create_erp_config_templates.sql` (plantillas ERP globales y relacion con copias por empresa)
26. `27_drop_cmp_name_columns.sql` (quita columnas legacy de compania SAP)
27. `28_add_erp_queries_and_server_node_length.sql` (agrega queries ERP y amplia server node)
28. `29_make_bank_erp_id_optional.sql` (hace opcional el identificador ERP legacy de cuentas bancarias)

## Notas

- `08_company_profile_and_admin_banking.sql` crea `monedas`, `bancos` y `cuentas_bancarias`.
- El rol unico del usuario vive en `usuarios.rol_id`. `usuarios_roles` fue eliminado para evitar inconsistencias en login y permisos.
- `04_seed_superadmin_template.sql` crea el usuario `morteira`; `05` lo enlaza con empresa Qoncilia y rol `is_super_admin`.
- `09_create_conciliation_tables.sql` crea `plantillas_base`, `plantillas_conciliacion`, `extractos_bancarios` y `extractos_bancarios_filas`.
- Los extractos bancarios requieren `cuenta_bancaria_id` y `plantilla_id`; ya no se crean tablas para guardar Excel del sistema ni resultados de comparacion.
- `lyt_source_layout_id` fue eliminado. La sincronizacion de plantillas admin -> gestor se hace por empresa, banco y plantilla base.
- `conciliaciones`, `conciliacion_resultados` y `conciliaciones_erp_envios` fueron eliminadas del esquema operativo porque la comparacion ya es temporal.
- `13_seed_default_templates_from_existing_layouts.sql` y `15_upgrade_conciliation_accounts_systems_and_gestors.sql` fueron retirados porque este flujo ya no migra estructuras intermedias.
- Los seeds `11` y `12` cargan bancos, cuentas y plantillas sobre el esquema nuevo.
- Desde `18`, las plantillas base habilitadas por superadmin son globales por usuario admin; el script migra lo que exista en la tabla legacy por banco.
- `19` es incremental e idempotente: agrega mappings faltantes a plantillas base y plantillas ya copiadas a usuarios.
- `21` es incremental e idempotente: elimina solo la columna `banco_alias` de `public.bancos`.
- `22` es incremental e idempotente: agrega `emp_region` y `emp_pais` a `public.empresas`.
- `23` es incremental e idempotente: agrega `pg_trgm` e indices para busquedas paginadas de bancos y cuentas bancarias.
- `25` es incremental e idempotente: elimina `sistemas`, quita `sistema_id` de plantillas y ajusta `empresas_erp_configuraciones` al contrato nuevo.
- `26` es incremental e idempotente: crea plantillas ERP sin empresa y agrega `ept_id` nullable a las copias por empresa.
- `29` es incremental e idempotente: permite `cuenta_bancaria_id_banco_erp` nulo y elimina el check legacy de no vacio.

### Conciliacion de tarjetas (SAP_TARJETAS)

- `36_add_template_erp_queries.sql` (incremental/idempotente): agrega `query_banco`/`query_sistema` a las plantillas ERP para que una plantilla pueda llevar el query y propagarlo al copiarse a una empresa. Ejecutar ANTES de `37`.
- `37_seed_sap_tarjetas_template.sql` (idempotente): crea la PLANTILLA ERP global `SAP_TARJETAS` con el query OCRH final (`Canceled='N'` + `PayDate BETWEEN $2 AND $3`). Desde ERP Management se completa (credenciales HANA) y se copia a las empresas elegidas.
- `34_seed_sap_tarjetas_config.sql` / `35_seed_sap_tarjetas_config_empresa4.sql`: alternativas que crean la config `SAP_TARJETAS` directamente por empresa (sin pasar por plantilla). `35` esta acotado a `emp_id = 4`.
- El modo tarjetas se activa cuando la config ERP seleccionada tiene `code = 'SAP_TARJETAS'`; el query del sistema trae OCRH crudo (`AbsId`, `VoucherNum`, `PayDate`, `CreditSum`, `CreditCurr`) y el backend lo aliasa en memoria para el matching. Si una config ya asignada quedo con el query viejo SIN `$2/$3`, re-correr el seed que corresponda o editar el query por la UI (el rango de fechas de la pantalla solo filtra si el query usa `$2/$3`).
- `38_seed_modulos_banco_tarjetas.sql` (idempotente): registra los modulos por pantalla `bank_conciliation` ("Conciliacion de Banco", `/conciliacion-banco`, workbench SAP_B1) y `card_payment` ("Pago de Tarjeta", `/pago-tarjeta`, workbench SAP_TARJETAS) y los habilita para todas las empresas y roles la primera vez (el grant usa ON CONFLICT DO NOTHING: re-correrlo NO pisa lo que el superadmin haya apagado). Los checkboxes aparecen solos en `/access-control` (la matriz del superadmin es generica); desde ahi se apagan por empresa/rol. Requiere el backend/front con los codigos nuevos (enum `AppModuleCode` + `APP_MODULE_VALUES`).
- `39_add_sucursal_cuentas_bancarias.sql` (incremental/idempotente): agrega `cuentas_bancarias.cuenta_bancaria_sucursal` — la sucursal POR CUENTA (distinta de `bancos.banco_sucursal`) que viaja como `BankBranch` en la cabecera del deposito SAP de tarjetas; `Bank` sale de `bancos.banco_descripcion`. Se carga por la UI de Cuentas Bancarias.
- `52_fix_ocho_a_continental_debit_credit_layout.sql` (incremental/idempotente, solo OCHO_A): asegura que Continental procese `DEBE` (columna E) como `DebitAmount` y `HABER` (columna F) como `CreditAmount` al crear BankPages en SAP B1. No modifica las plantillas de otras empresas.
- `53_clone_5629621_and_fg_tarjeta_for_qa.sql` queda como alternativa combinada de referencia. Replica todas las ERP activas e inactivas; no usar junto con `57`/`58`.
- `54_fix_ocho_a_sudameris_usd_signed_layout.sql` (incremental/idempotente, solo OCHO_A): crea o reactiva la copia local de `Base Sudameris vs SAP B1` para `SUDAMERIS CTA 0003000003592029 USD` (banco 14 / empresa 6 / usuario 21, cuenta 24), y la adapta al extracto con encabezado en fila 8 y datos desde fila 9. Lee `Importe` (E) como importe firmado: negativo=`DebitAmount`, positivo=`CreditAmount`; `Saldo` (F) es solo visual. No modifica plantillas base ni otras empresas.
- `55_seed_ocho_a_remaining_bank_layouts.sql` (manual, atomico e idempotente, solo OCHO_A): configura BASA, Familiar, GNB e Itaú desde los extractos de `EXTRACTOS BANCOS`, exclusivamente cuando esos bancos de la empresa 6 no tengan ninguna plantilla, activa ni inactiva. Verifica además que `emp_id_fiscal = 'OCHO_A'`, crea layouts locales con modo `debit_credit` y no actualiza layouts existentes, Sudameris, Continental, plantillas base, otros bancos ni otras empresas.
- `67_fix_ocho_a_itau_debit_credit_absolute_layout.sql` (manual, atomico e idempotente, solo OCHO_A): despues de desplegar el backend, cambia exclusivamente la plantilla activa de Itaú de OCHO_A al modo `debit_credit_abs`. Itaú informa Débitos negativos: el modo conserva D como `DebitAmount` y solo quita el signo, sin moverlo a `CreditAmount`. El SQL exige base `QONCILIA_BACK`, empresa 6/OCHO_A, un banco Itaú activo y una unica plantilla activa antes de modificarla.

### Migracion FG aislada con empresas QA

Estos scripts son manuales y no forman parte de una recreacion automatica. El agente no los ejecuta. Orden:

1. `56_preflight_fg_qa_clone.sql`: solo lectura; valida origenes, ERP, modulos, inventario y colisiones.
2. `57_clone_5629621_to_qa.sql`: crea solamente `5629621_QA` y `qa.conciliacion.admin`.
3. `58_clone_fg_tarjeta_to_qa.sql`: crea solamente `FG_TARJETA_QA` y `qa.tarjetas.admin`.
4. `59_verify_fg_qa_erp_parity.sql`: solo lectura; exige copia exacta de todas las configuraciones ERP.
5. Desplegar backend/frontend FG con `FG_QA_SAP_WRITES_ENABLED=false` (ausente tambien significa bloqueado).
6. `60_seed_fg_qa_modules.sql`: crea/asigna los tres modulos FG solamente a los admins QA y deshabilita sus modulos operativos heredados.
7. `61_verify_fg_qa_isolation.sql`: solo lectura; comprueba permisos, propiedad, ausencia de cruces y paridad ERP.

La base confirmada para esta migracion es `QONCILIA_BACK`. Los SQL de escritura ya incluyen `expected_database = 'QONCILIA_BACK'` y abortan si `current_database()` no coincide. No cambiar esa constante sin una revision explicita del entorno.

`62_enable_fg_modules_production.sql` se reserva para una promocion posterior aprobada. No modifica bancos, cuentas, layouts ni ERP productivos. `63_rollback_fg_module_assignments.sql` es recuperable: deshabilita modulos FG y ERP QA sin borrar datos.

### Cuenta de comision de tarjetas de credito FG

`64_seed_fg_credit_card_commission_accounts.sql` crea una tabla de configuracion por ERP y agrega un placeholder solo para `FG_TARJETA` y `FG_TARJETA_QA`. El backend rechaza ese placeholder: antes de enviar un deposito de credito hay que actualizar la cuenta real en el bloque comentado del mismo archivo. No afecta bancos, cuentas bancarias, layouts ni configuraciones de otras empresas.

`65_seed_ocho_a_credit_card_commission_account.sql` requiere primero el `64` y guarda la cuenta actual de OCHO_A (`1111000104`) solamente en su ERP `SAP_TARJETAS`. Despues del despliegue, OCHO_A y FG leen la cuenta desde esta tabla por ERP.
