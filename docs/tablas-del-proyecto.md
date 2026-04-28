# Tablas del proyecto

Documento de referencia para la recreacion limpia de la base. El dominio de bancos, cuentas, sistemas, plantillas y conciliaciones queda nombrado en espanol y con campos descriptivos.

## Seguridad y usuarios

### `public.usuarios`

Usuarios del sistema. Mantiene credenciales, datos basicos, empresa, rol unico y `usr_created_by` para identificar que usuario creo a cada gestor. Cuando un admin crea un gestor, el backend lo deja en la misma empresa del admin.

Campos principales:

- `usr_id`: identificador del usuario.
- `emp_id`: empresa del usuario.
- `rol_id`: rol unico del usuario. Es la unica fuente de verdad para login, permisos y navegacion.
- `usr_created_by`: usuario que creo este usuario, usado para validar gestores creados por un admin.
- `usr_login`, `usr_email`, `usr_celular`, `usr_legajo`: identificadores unicos.
- `usr_password_hash`: hash bcrypt de la contrasena.
- `usr_activo`: habilita o bloquea el acceso.

Nota: `usuarios_roles` fue eliminado porque el sistema no maneja multiples roles por usuario. Tener `usuarios.rol_id` y una tabla puente generaba doble fuente de verdad; el login siempre lee `usuarios.rol_id`.

### `public.roles`

Catalogo de roles funcionales.

Roles seed:

- `is_super_admin`
- `admin`
- `gestor_cobranza`
- `gestor_pagos`

### `public.empresas`

Empresas del sistema. Una empresa puede tener varios bancos, cuentas bancarias, usuarios y configuraciones ERP.

### `public.modulos`, `public.empresas_roles_modulos`

Tablas de permisos por empresa + rol + modulo. El codigo tecnico del modulo de plantillas sigue siendo `layout_management` para mantener compatibilidad de permisos.

## Bancos y cuentas

### `public.monedas`

Catalogo de monedas para cuentas bancarias.

Campos principales:

- `moneda_codigo`
- `moneda_nombre`
- `moneda_simbolo`
- `moneda_decimales`
- `moneda_activa`

Seeds incluidos: `PYG`, `USD`, `EUR`, `BRL`, `ARS`.

### `public.bancos`

Banco operativo de una empresa, asignado a un usuario responsable.

Campos principales:

- `banco_id`
- `empresa_id`
- `usuario_id`
- `banco_origen_id`
- `banco_nombre`
- `banco_alias`
- `banco_descripcion`
- `banco_sucursal`
- `banco_activo`

### `public.cuentas_bancarias`

Cuentas bancarias de una empresa dentro de un banco. Las conciliaciones se guardan por cuenta bancaria.

Campos principales:

- `cuenta_bancaria_id`
- `empresa_id`
- `banco_id`
- `cuenta_bancaria_origen_id`
- `cuenta_bancaria_nombre`
- `moneda_codigo`
- `cuenta_bancaria_numero`
- `cuenta_bancaria_id_banco_erp`
- `cuenta_bancaria_numero_mayor`
- `cuenta_bancaria_numero_pago`
- `cuenta_bancaria_activa`

## Sistemas y plantillas

### `public.sistemas`

Catalogo dinamico de sistemas origen. Ejemplos: SAP, Softland, Bejerman. Cada sistema puede tener varias plantillas base y varias plantillas de conciliacion.

### `public.plantillas_base`

Plantillas reutilizables que el superadmin puede crear y copiar a bancos.

Campos principales:

- `plantilla_base_id`
- `sistema_id`
- `plantilla_base_nombre`
- `plantilla_base_descripcion`
- `plantilla_base_banco_referencia`
- `plantilla_base_etiqueta_sistema`
- `plantilla_base_etiqueta_banco`
- `plantilla_base_umbral_auto_match`
- `plantilla_base_activa`

### `public.plantillas_base_mapeos`

Mapeos de cada plantilla base. Define columnas, hojas, rangos, tipos de dato, pesos, tolerancias y operador de comparacion.

### `public.plantillas_conciliacion`

Plantillas asignadas a bancos. Reemplaza al concepto anterior de layout operativo. No conserva `lyt_source_layout_id`; la replica admin -> gestor se resuelve por banco, sistema, nombre y plantilla base.

Campos principales:

- `plantilla_id`
- `banco_id`
- `plantilla_base_id`
- `sistema_id`
- `plantilla_nombre`
- `plantilla_descripcion`
- `plantilla_etiqueta_sistema`
- `plantilla_etiqueta_banco`
- `plantilla_umbral_auto_match`
- `plantilla_activa`

### `public.plantillas_conciliacion_mapeos`

Mapeos de cada plantilla de conciliacion asignada a un banco.

## Conciliacion

### `public.conciliaciones`

Cabecera de cada conciliacion guardada. Relaciona usuario, banco, cuenta bancaria, plantilla, archivos usados, metricas, estado funcional y snapshot resumido.

Campos principales:

- `conciliacion_id`
- `usuario_id`
- `banco_id`
- `cuenta_bancaria_id`
- `plantilla_id`
- `conciliacion_nombre`
- `conciliacion_estado`
- `conciliacion_tiene_datos_sistema`
- `conciliacion_tiene_datos_banco`
- `conciliacion_porcentaje_match`

### `public.conciliacion_resultados`

Detalle persistido de resultados de conciliacion: matches automaticos, manuales y filas no conciliadas.

## ERP

### `public.empresas_erp_configuraciones`

Configuraciones ERP por empresa. Hoy se usa principalmente para SAP B1 / Service Layer.

## Tablas eliminadas

- `public.usuarios_bancos`: absorbida por `public.bancos`.
- `public.usuarios_roles`: eliminada; el rol unico vive en `public.usuarios.rol_id`.
- `public.conciliaciones_erp_envios`: ya no se persiste porque no estaba siendo usada por el flujo funcional.
- `public.migrations`: el proyecto se recrea con scripts SQL.
- Tablas legacy de layouts/template layouts/systems en ingles o abreviadas.
