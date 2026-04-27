# Tablas del proyecto

Este documento resume las tablas vigentes del proyecto despues del refactor que unifica bancos, layouts y cuentas sobre `public.bancos`.

## Seguridad y usuarios

### `public.usuarios`

Usuarios del sistema. Guarda credenciales, datos basicos, empresa, rol principal y el campo `usr_created_by` para identificar que admin creo a cada gestor.

### `public.roles`

Catalogo de roles funcionales (`is_super_admin`, `admin`, `gestor_cobranza`, `gestor_pagos`).

### `public.empresas`

Empresas del sistema. Centraliza identidad fiscal, nombre y configuraciones visibles de ERP.

### `public.modulos`

Catalogo de modulos/pantallas habilitables en la aplicacion.

### `public.empresas_roles_modulos`

Matriz de acceso por empresa + rol + modulo. Define que modulo queda habilitado en cada contexto.

### `public.usuarios_roles`

Tabla puente de asignaciones de roles por usuario. Mantiene compatibilidad con `usuarios.rol_id` y permite marcar un rol principal.

## Bancos y cuentas

### `public.bancos`

Tabla raiz del dominio bancario operativo. Cada banco queda asociado a una empresa y a un usuario responsable. Desde esta tabla cuelgan:

- layouts de conciliacion
- cuentas bancarias de empresa
- conciliaciones guardadas

Campos funcionales principales:

- `emp_id`: empresa del banco
- `usr_id`: usuario responsable
- `ban_source_bank_id`: banco origen cuando el registro fue espejado a un gestor
- `ban_nombre`: nombre del banco
- `ban_alias`: alias operativo
- `ban_descripcion`: descripcion interna
- `ban_sucursal`: sucursal

### `public.empresas_cuentas_bancarias`

Cuentas bancarias operativas de una empresa dentro de un banco. Guarda moneda, numero de cuenta, datos de integracion ERP y `ecb_source_account_id` cuando la cuenta fue replicada desde un banco admin hacia un gestor.

## Conciliacion

### `public.conciliation_systems`

Catalogo dinamico de sistemas origen. Un sistema puede tener N template layouts y N layouts operativos. Ejemplos: `SAP`, `Softland`, `Bejerman`.

### `public.conciliacion_layouts`

Layouts configurables de conciliacion asociados directamente a `bancos` por `ban_id`.

Campos nuevos relevantes:

- `sys_id`: sistema al que pertenece el layout
- `lyt_source_layout_id`: layout origen cuando se espejo desde un admin a un gestor

### `public.conciliacion_layout_mappings`

Detalle de campos/mapeos de cada layout. Define columnas de sistema y banco, tipos de dato, pesos y operadores de comparacion.

### `public.template_layout`

Templates reutilizables para crear layouts rapidamente. Tambien quedan asociados a `sys_id` para soportar varios sistemas.

### `public.template_layout_mapping`

Mappings de cada template layout.

### `public.conciliaciones`

Cabecera de cada conciliacion guardada. Relaciona usuario ejecutor, banco, cuenta bancaria, layout, archivos usados, metricas, estado funcional y snapshot resumido.

Campos nuevos relevantes:

- `ecb_id`: cuenta bancaria principal de la conciliacion
- `con_has_system_data`: indica si se guardo lado sistema
- `con_has_bank_data`: indica si se guardo lado banco

Estados funcionales usados por la app:

- `draft_system_only`
- `draft_bank_only`
- `ready_to_compare`
- `matched`
- `matched_with_manual`
- `compared_with_pending`
- `compared_without_matches`

### `public.conciliacion_matches`

Detalle persistido de resultados de conciliacion: matches automaticos, manuales y filas no conciliadas.

## ERP

### `public.empresas_erp_configuraciones`

Configuraciones ERP por empresa. Hoy se usa principalmente para SAP B1 / Service Layer.

### `public.conciliaciones_erp_envios`

Historial de envios de conciliaciones al ERP, con endpoint, payload, respuesta y estado final.

## Tablas eliminadas en este refactor

### `public.usuarios_bancos`

Eliminada. Su responsabilidad fue absorbida por `public.bancos`.

### `public.migrations`

Eliminada. El proyecto deja de depender de migraciones TypeORM y pasa a recrearse con scripts SQL.
