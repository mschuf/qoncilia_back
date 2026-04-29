# Tablas del proyecto

Referencia para recrear la base desde cero. El flujo operativo actual guarda solamente extractos bancarios. El Excel del sistema se usa en la pantalla Conciliar para comparar en memoria y no se persiste.

## Flujo funcional actual

1. El usuario entra a **Extractos bancos**.
2. Elige banco, cuenta bancaria y layout. La cuenta bancaria es obligatoria.
3. Sube el Excel del banco, visualiza las filas parseadas y guarda el extracto.
4. El usuario entra a **Conciliar**.
5. Busca extractos guardados por banco, cuenta y layout.
6. Sube el Excel del sistema y compara contra el extracto bancario elegido.
7. El resultado de coincidencias automaticas y manuales se muestra en pantalla, sin guardar el Excel del sistema ni los resultados.

## Seguridad y usuarios

### `public.usuarios`

Usuarios del sistema. Es la fuente de identidad, empresa, rol y estado de acceso.

| Columna | Funcion |
| --- | --- |
| `usr_id` | Identificador primario del usuario. |
| `usr_nombre` | Nombre visible del usuario. |
| `usr_apellido` | Apellido visible del usuario. |
| `usr_email` | Email unico de contacto y recuperacion. |
| `usr_celular` | Telefono unico del usuario. |
| `usr_login` | Login unico usado para autenticacion. |
| `usr_legajo` | Codigo interno o legajo unico del usuario. |
| `usr_password_hash` | Hash bcrypt de la contrasena; nunca guarda texto plano. |
| `usr_activo` | Habilita o bloquea el login. |
| `usr_created_by` | Usuario que creo a este usuario; ayuda a limitar gestores creados por un admin. |
| `usr_created_at` | Fecha de creacion del usuario. |
| `usr_updated_at` | Fecha de ultima modificacion del usuario. |
| `emp_id` | Empresa a la que pertenece el usuario. |
| `rol_id` | Rol unico del usuario. Es la fuente de verdad para permisos. |

### `public.roles`

Catalogo de roles funcionales.

| Columna | Funcion |
| --- | --- |
| `rol_id` | Identificador primario del rol. |
| `rol_codigo` | Codigo tecnico usado por backend y frontend. |
| `rol_nombre` | Nombre legible del rol. |
| `rol_descripcion` | Explicacion corta del alcance del rol. |
| `rol_activo` | Permite inactivar roles sin eliminarlos. |
| `rol_created_at` | Fecha de creacion del rol. |
| `rol_updated_at` | Fecha de ultima modificacion del rol. |

### `public.empresas`

Empresas que operan en Qoncilia.

| Columna | Funcion |
| --- | --- |
| `emp_id` | Identificador primario de la empresa. |
| `emp_id_fiscal` | Identificador fiscal o codigo unico de la empresa. |
| `emp_nombre` | Nombre comercial de la empresa. |
| `emp_activa` | Habilita o bloquea la empresa. |
| `emp_created_at` | Fecha de creacion de la empresa. |
| `emp_updated_at` | Fecha de ultima modificacion de la empresa. |
| `emp_webservice_erp` | URL o referencia legacy de integracion ERP. |
| `emp_scheme_erp` | Esquema legacy de integracion ERP. |
| `emp_version_tls_erp` | Version TLS legacy asociada a ERP. |
| `emp_id_tarjetas` | Identificador legacy para tarjetas o integraciones relacionadas. |

### `public.modulos`

Catalogo de modulos visibles en la aplicacion.

| Columna | Funcion |
| --- | --- |
| `mod_id` | Identificador primario del modulo. |
| `mod_codigo` | Codigo tecnico usado en guards y frontend. |
| `mod_nombre` | Nombre visible del modulo. |
| `mod_ruta` | Ruta principal del modulo en el frontend. |
| `mod_descripcion` | Explicacion breve del modulo. |
| `mod_activo` | Permite ocultar o deshabilitar el modulo. |
| `mod_created_at` | Fecha de creacion del modulo. |
| `mod_updated_at` | Fecha de ultima modificacion del modulo. |

### `public.empresas_roles_modulos`

Matriz de permisos por empresa, rol y modulo.

| Columna | Funcion |
| --- | --- |
| `erm_id` | Identificador primario de la regla. |
| `emp_id` | Empresa a la que aplica el permiso. |
| `rol_id` | Rol al que aplica el permiso. |
| `mod_id` | Modulo controlado por la regla. |
| `erm_habilitado` | Indica si el modulo esta habilitado para esa empresa y rol. |
| `erm_created_at` | Fecha de creacion de la regla. |
| `erm_updated_at` | Fecha de ultima modificacion de la regla. |

## Bancos y cuentas

### `public.monedas`

Catalogo de monedas disponibles para cuentas bancarias.

| Columna | Funcion |
| --- | --- |
| `moneda_id` | Identificador interno de la moneda. |
| `moneda_codigo` | Codigo unico de moneda, por ejemplo `PYG` o `USD`. |
| `moneda_nombre` | Nombre legible de la moneda. |
| `moneda_simbolo` | Simbolo o abreviatura de presentacion. |
| `moneda_decimales` | Cantidad de decimales esperados para importes. |
| `moneda_activa` | Permite inactivar una moneda sin borrar historico. |
| `moneda_creado_en` | Fecha de creacion del registro. |
| `moneda_actualizado_en` | Fecha de ultima modificacion. |

### `public.bancos`

Bancos operativos asignados a usuarios dentro de una empresa.

| Columna | Funcion |
| --- | --- |
| `banco_id` | Identificador primario del banco. |
| `empresa_id` | Empresa propietaria del banco. |
| `usuario_id` | Usuario responsable o asignado a operar el banco. |
| `banco_origen_id` | Banco origen cuando se sincroniza de admin a gestor. |
| `banco_nombre` | Nombre oficial del banco. |
| `banco_alias` | Nombre corto para mostrar en pantallas. |
| `banco_descripcion` | Detalle administrativo del banco. |
| `banco_sucursal` | Sucursal o referencia operativa. |
| `banco_activo` | Habilita el banco para seleccionarlo. |
| `banco_creado_en` | Fecha de creacion del banco. |
| `banco_actualizado_en` | Fecha de ultima modificacion del banco. |

### `public.cuentas_bancarias`

Cuentas bancarias por banco. Cada extracto bancario guardado debe apuntar a una cuenta.

| Columna | Funcion |
| --- | --- |
| `cuenta_bancaria_id` | Identificador primario de la cuenta. |
| `empresa_id` | Empresa propietaria de la cuenta. |
| `banco_id` | Banco al que pertenece la cuenta. |
| `cuenta_bancaria_origen_id` | Cuenta origen cuando se sincroniza de admin a gestor. |
| `cuenta_bancaria_nombre` | Nombre interno o alias de la cuenta. |
| `moneda_codigo` | Moneda de la cuenta. |
| `cuenta_bancaria_numero` | Numero bancario visible de la cuenta. |
| `cuenta_bancaria_id_banco_erp` | Identificador del banco/cuenta en el ERP. |
| `cuenta_bancaria_numero_mayor` | Cuenta contable mayor asociada. |
| `cuenta_bancaria_numero_pago` | Cuenta de pago opcional asociada. |
| `cuenta_bancaria_activa` | Habilita la cuenta para cargar extractos. |
| `cuenta_bancaria_creado_en` | Fecha de creacion de la cuenta. |
| `cuenta_bancaria_actualizado_en` | Fecha de ultima modificacion. |

## Sistemas y layouts

### `public.sistemas`

Catalogo dinamico de sistemas origen, por ejemplo SAP. El sistema define el lado "sistema" del layout, pero sus Excel no se guardan.

| Columna | Funcion |
| --- | --- |
| `sistema_id` | Identificador primario del sistema. |
| `sistema_nombre` | Nombre unico del sistema. |
| `sistema_descripcion` | Descripcion administrativa. |
| `sistema_activo` | Permite usar o retirar el sistema. |
| `sistema_creado_en` | Fecha de creacion. |
| `sistema_actualizado_en` | Fecha de ultima modificacion. |

### `public.plantillas_base`

Layouts base creados por superadmin y copiables a bancos.

| Columna | Funcion |
| --- | --- |
| `plantilla_base_id` | Identificador primario de la plantilla base. |
| `plantilla_base_nombre` | Nombre unico de la plantilla base. |
| `plantilla_base_descripcion` | Descripcion funcional de la plantilla. |
| `plantilla_base_banco_referencia` | Banco de referencia para la estructura del Excel. |
| `sistema_id` | Sistema origen al que corresponde el lado sistema. |
| `plantilla_base_etiqueta_sistema` | Texto visible para el lado sistema. |
| `plantilla_base_etiqueta_banco` | Texto visible para el lado banco. |
| `plantilla_base_umbral_auto_match` | Score minimo de 0 a 1 para match automatico. |
| `plantilla_base_activa` | Indica si puede aplicarse a bancos. |
| `plantilla_base_creada_en` | Fecha de creacion. |
| `plantilla_base_actualizada_en` | Fecha de ultima modificacion. |

### `public.plantillas_base_mapeos`

Columnas y reglas de una plantilla base.

| Columna | Funcion |
| --- | --- |
| `mapeo_base_id` | Identificador primario del mapeo base. |
| `plantilla_base_id` | Plantilla base propietaria del mapeo. |
| `mapeo_base_clave_campo` | Clave tecnica comun para comparar sistema contra banco. |
| `mapeo_base_etiqueta` | Etiqueta visible del campo. |
| `mapeo_base_orden` | Orden de lectura y presentacion. |
| `mapeo_base_activo` | Incluye o excluye el campo del parseo/comparacion. |
| `mapeo_base_requerido` | Si es verdadero, el campo debe coincidir para permitir match. |
| `mapeo_base_operador_comparacion` | Operador usado: equals, contains, numeric_equals, date_equals, etc. |
| `mapeo_base_peso` | Peso del campo en el score automatico. |
| `mapeo_base_tolerancia` | Tolerancia numerica o de dias, segun tipo/operador. |
| `sistema_hoja` | Hoja del Excel del sistema. Si es nula usa la primera hoja. |
| `sistema_columna` | Columna o columnas alternativas del Excel del sistema. |
| `sistema_fila_inicio` | Primera fila de datos del sistema. |
| `sistema_fila_fin` | Ultima fila de datos del sistema; nula lee hasta el final. |
| `sistema_tipo_dato` | Tipo de normalizacion del sistema: text, number, amount o date. |
| `banco_hoja` | Hoja del Excel del banco. Si es nula usa la primera hoja. |
| `banco_columna` | Columna o columnas alternativas del Excel del banco. |
| `banco_fila_inicio` | Primera fila de datos del banco. |
| `banco_fila_fin` | Ultima fila de datos del banco; nula lee hasta el final. |
| `banco_tipo_dato` | Tipo de normalizacion del banco: text, number, amount o date. |
| `mapeo_base_creado_en` | Fecha de creacion. |
| `mapeo_base_actualizado_en` | Fecha de ultima modificacion. |

### `public.plantillas_conciliacion`

Layouts asignados a un banco concreto.

| Columna | Funcion |
| --- | --- |
| `plantilla_id` | Identificador primario del layout asignado. |
| `banco_id` | Banco propietario del layout. |
| `plantilla_base_id` | Plantilla base de origen, si fue copiada desde una base. |
| `sistema_id` | Sistema que define el lado sistema del layout. |
| `plantilla_nombre` | Nombre del layout para el usuario. |
| `plantilla_descripcion` | Descripcion operativa del layout. |
| `plantilla_etiqueta_sistema` | Etiqueta visible del lado sistema. |
| `plantilla_etiqueta_banco` | Etiqueta visible del lado banco. |
| `plantilla_umbral_auto_match` | Score minimo para coincidencias automaticas. |
| `plantilla_activa` | Indica el layout activo del banco. |
| `plantilla_creada_en` | Fecha de creacion. |
| `plantilla_actualizada_en` | Fecha de ultima modificacion. |

### `public.plantillas_conciliacion_mapeos`

Mapeos reales del layout asignado a un banco.

| Columna | Funcion |
| --- | --- |
| `mapeo_id` | Identificador primario del mapeo. |
| `plantilla_id` | Layout propietario del mapeo. |
| `mapeo_clave_campo` | Clave tecnica comun para comparar ambos lados. |
| `mapeo_etiqueta` | Etiqueta visible del campo. |
| `mapeo_orden` | Orden de lectura y presentacion. |
| `mapeo_activo` | Incluye o excluye el campo del flujo. |
| `mapeo_requerido` | Obliga coincidencia para aceptar match automatico. |
| `mapeo_operador_comparacion` | Operador de comparacion. |
| `mapeo_peso` | Peso del campo en el score. |
| `mapeo_tolerancia` | Tolerancia aplicada al operador. |
| `sistema_hoja` | Hoja del Excel del sistema. |
| `sistema_columna` | Columna del Excel del sistema. |
| `sistema_fila_inicio` | Primera fila del sistema. |
| `sistema_fila_fin` | Ultima fila del sistema. |
| `sistema_tipo_dato` | Tipo de dato del sistema. |
| `banco_hoja` | Hoja del Excel del banco. |
| `banco_columna` | Columna del Excel del banco. |
| `banco_fila_inicio` | Primera fila del banco. |
| `banco_fila_fin` | Ultima fila del banco. |
| `banco_tipo_dato` | Tipo de dato del banco. |
| `mapeo_creado_en` | Fecha de creacion. |
| `mapeo_actualizado_en` | Fecha de ultima modificacion. |

## Extractos bancarios

### `public.extractos_bancarios`

Cabecera de cada Excel bancario guardado. Esta es la persistencia operativa principal del nuevo flujo.

| Columna | Funcion |
| --- | --- |
| `extracto_id` | Identificador primario del extracto. |
| `usuario_id` | Usuario que cargo el extracto. |
| `banco_id` | Banco seleccionado al guardar el extracto. |
| `cuenta_bancaria_id` | Cuenta bancaria obligatoria asociada al extracto. |
| `plantilla_id` | Layout usado para leer el Excel del banco. |
| `extracto_nombre` | Alias obligatorio del extracto. La pantalla sugiere nombre de cuenta en minuscula sin espacios + fecha/hora/minuto/segundo. |
| `extracto_archivo` | Nombre del archivo Excel subido. |
| `extracto_estado` | Estado funcional del extracto; por defecto `saved`. |
| `extracto_total_filas` | Cantidad de filas bancarias parseadas y guardadas. |
| `extracto_metadata` | Metadatos JSON del proceso de carga. |
| `extracto_creado_en` | Fecha de guardado del extracto. |
| `extracto_actualizado_en` | Fecha de ultima modificacion de la cabecera. |

### `public.extractos_bancarios_filas`

Filas parseadas del Excel del banco. No existe tabla equivalente para el sistema.

| Columna | Funcion |
| --- | --- |
| `extracto_fila_id` | Identificador primario de la fila guardada. |
| `extracto_id` | Extracto al que pertenece la fila. |
| `extracto_fila_origen_id` | Identificador tecnico de origen, normalmente hoja y numero de fila. |
| `extracto_numero_fila` | Numero de fila original dentro del Excel. |
| `extracto_valores` | Valores visibles parseados por campo del layout. |
| `extracto_normalizados` | Valores normalizados por tipo de dato para comparacion. |
| `extracto_fila_creada_en` | Fecha en que se guardo la fila. |

## ERP

### `public.empresas_erp_configuraciones`

Configuraciones ERP por empresa. Se conserva para administracion de integraciones, aunque el nuevo flujo de conciliacion no guarda resultados.

| Columna | Funcion |
| --- | --- |
| `epc_id` | Identificador primario de la configuracion. |
| `emp_id` | Empresa propietaria de la configuracion. |
| `epc_codigo` | Codigo unico de configuracion por empresa. |
| `epc_nombre` | Nombre visible de la configuracion. |
| `epc_tipo` | Tipo de ERP, actualmente SAP B1. |
| `epc_descripcion` | Descripcion administrativa. |
| `epc_activo` | Permite usar o bloquear la configuracion. |
| `epc_es_predeterminado` | Marca la configuracion default de la empresa. |
| `epc_sap_username` | Usuario SAP para Service Layer. |
| `epc_db_name` | Base de datos SAP. |
| `epc_cmp_name` | Nombre de compania SAP. |
| `epc_server_node` | Nodo o servidor SAP. |
| `epc_db_user` | Usuario de base o servicio. |
| `epc_db_password_enc` | Password cifrada. |
| `epc_service_layer_url` | URL del Service Layer. |
| `epc_tls_version` | Version TLS requerida. |
| `epc_allow_self_signed` | Permite certificados autofirmados si esta activo. |
| `epc_settings` | Configuracion adicional en JSON. |
| `epc_created_at` | Fecha de creacion. |
| `epc_updated_at` | Fecha de ultima modificacion. |

## Tablas eliminadas

- `public.usuarios_bancos`: absorbida por `public.bancos`.
- `public.usuarios_roles`: eliminada; el rol unico vive en `public.usuarios.rol_id`.
- `public.conciliaciones`: eliminada del esquema operativo porque ya no se guardan comparaciones ni Excel del sistema.
- `public.conciliacion_resultados`: eliminada porque las coincidencias se calculan y muestran temporalmente.
- `public.conciliaciones_erp_envios`: eliminada porque no participa del flujo actual.
- `public.migrations`: el proyecto se recrea con scripts SQL.
- Tablas legacy de layouts/template layouts/systems en ingles o abreviadas.
