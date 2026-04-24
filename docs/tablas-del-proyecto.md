# Tablas del proyecto

Este documento resume las tablas vigentes del proyecto despues del refactor que unifica bancos, layouts y cuentas sobre `public.bancos`.

## Seguridad y usuarios

### `public.usuarios`

Usuarios del sistema. Guarda credenciales, datos basicos y las referencias actuales a empresa y rol principal.

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
- `ban_nombre`: nombre del banco
- `ban_alias`: alias operativo
- `ban_descripcion`: descripcion interna
- `ban_sucursal`: sucursal

### `public.empresas_cuentas_bancarias`

Cuentas bancarias operativas de una empresa dentro de un banco. Guarda moneda, numero de cuenta y datos de integracion ERP.

## Conciliacion

### `public.conciliacion_layouts`

Layouts configurables de conciliacion asociados directamente a `bancos` por `ban_id`.

### `public.conciliacion_layout_mappings`

Detalle de campos/mapeos de cada layout. Define columnas de sistema y banco, tipos de dato, pesos y operadores de comparacion.

### `public.template_layout`

Templates reutilizables para crear layouts rapidamente.

### `public.template_layout_mapping`

Mappings de cada template layout.

### `public.conciliaciones`

Cabecera de cada conciliacion guardada. Relaciona usuario ejecutor, banco, layout, archivos usados, metricas y snapshot resumido.

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
