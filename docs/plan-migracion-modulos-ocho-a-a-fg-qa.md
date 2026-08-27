# Plan de migracion de los modulos OCHO_A a Frigorifico Guarani mediante QA

## Estado de implementacion (25/08/2026)

La fase de codigo y la preparacion del paquete SQL quedaron implementadas:

- Backend FG separado para extractos, conciliacion bancaria y tarjetas.
- Frontend FG con paginas, rutas, navegacion y perfil de comportamiento propio.
- Matching bancario uno-a-varios y matching de tarjetas estricto heredados mediante capacidades explicitas.
- Payload FG de tarjetas con `Bank`, `BankAccountNum` y `BankBranch`; sin comision ni `BankReference` de OCHO_A.
- Bloqueo central de escrituras SAP para `5629621_QA` y `FG_TARJETA_QA`, activo por defecto.
- Scripts `56` a `63` preparados para preflight, copias, verificacion, modulos, promocion y rollback.
- Builds de backend y frontend aprobados.
- Prueba automatizada del bloqueo SAP QA aprobada en sus cuatro escenarios de bandera y allowlists.

Por la politica de seguridad de base de datos, los SQL de escritura **no fueron ejecutados**. La fase QA queda pendiente de la ejecucion manual de `56` a `61` por el usuario y de las pruebas funcionales. `62` sigue reservado para una promocion productiva posterior.

La base confirmada para esta migracion es `QONCILIA_BACK`. Los SQL de escritura ya incluyen `expected_database = 'QONCILIA_BACK'`; cada uno aborta si la conexion apunta a otra base. El script `56` se conserva como preflight de solo lectura.

## 1. Objetivo

Crear una familia de modulos independiente para Frigorifico Guarani tomando como base funcional los modulos personalizados de OCHO_A, sin modificar el comportamiento actual de ninguna empresa productiva.

La migracion se probara primero sobre dos copias QA:

| Empresa productiva origen | Copia QA | Uso operativo | Administrador QA |
| --- | --- | --- | --- |
| `5629621` | `5629621_QA` | Carga de extractos y conciliacion bancaria | Un admin exclusivo de conciliacion |
| `FG_TARJETA` | `FG_TARJETA_QA` | Pagos de tarjetas de debito y credito | Un admin exclusivo de tarjetas |

El resultado buscado es:

- Copiar el **comportamiento del codigo** especializado de OCHO_A.
- Copiar los **datos operativos de cada empresa FG** hacia su propia empresa QA: perfil, bancos, cuentas, layouts, mappings, ERP y permisos.
- No copiar bancos, cuentas ni ERP de OCHO_A hacia FG.
- No cambiar usuarios, permisos, bancos, cuentas, layouts, ERP ni rutas que usan actualmente `5629621`, `FG_TARJETA` u `OCHO_A`.
- Habilitar los nuevos modulos en produccion solamente despues de completar y aprobar las pruebas QA.

## 2. Decision de arquitectura

No se deben asignar directamente los codigos `*_ocho_a` a las empresas FG. Los controladores y servicios actuales verifican que `actor.companyCode` sea exactamente `OCHO_A`, y mezclar empresas dentro de esas fachadas haria que futuras personalizaciones de una empresa afecten a la otra.

Se creara una familia FG independiente:

| Capacidad | Modulo OCHO_A de referencia | Nuevo modulo FG propuesto | Empresa QA autorizada inicialmente |
| --- | --- | --- | --- |
| Carga de extractos | `conciliation_ocho_a` | `conciliation_fg` | `5629621_QA` |
| Conciliacion bancaria | `bank_conciliation_ocho_a` | `bank_conciliation_fg` | `5629621_QA` |
| Pagos de tarjetas | `card_payment_ocho_a` | `card_payment_fg` | `FG_TARJETA_QA` |

Las paginas, controladores y servicios FG seran puntos de extension independientes. Podran reutilizar componentes y servicios base, pero sus rutas, guards, reglas de empresa y perfiles de payload seran propios.

```text
OCHO_A
  -> paginas/controladores/servicios OCHO_A
  -> nucleo compartido de conciliacion y SAP

FG QA
  -> paginas/controladores/servicios FG
  -> nucleo compartido de conciliacion y SAP

Empresas productivas actuales
  -> continuan usando sus rutas y modulos actuales hasta el pase aprobado
```

## 3. Alcance de la copia QA

### 3.1 Datos que se deben copiar

Para cada origen se copiara a una empresa nueva e independiente:

- Perfil de empresa.
- Un solo usuario administrador nuevo por empresa QA; dos administradores en total.
- Matriz de modulos del rol `admin` como linea base.
- Todas las configuraciones ERP SAP de cada empresa origen, copiadas campo por campo con el mismo estado, conexion, queries, settings y credenciales cifradas.
- Bancos raiz de la empresa.
- Cuentas bancarias raiz.
- Layouts de conciliacion de cada banco.
- Mappings de cada layout.
- Disponibilidad de plantillas base para el administrador QA.

### 3.2 Datos que no se deben copiar

- Usuarios productivos ni sus claves.
- Sesiones SAP existentes.
- Extractos bancarios historicos ni sus filas.
- Resultados o historial temporal de matching.
- Tokens, cookies o sesiones del Service Layer.
- Auditorias o datos operativos que no sean necesarios para probar los modulos.

Esto produce una copia exacta de la **configuracion operativa**, no una replica de los movimientos historicos ni de las personas de produccion.

## 4. Punto de partida existente

El repositorio ya contiene [`sql/53_clone_5629621_and_fg_tarjeta_for_qa.sql`](../sql/53_clone_5629621_and_fg_tarjeta_for_qa.sql), que actualmente:

- Crea `5629621_QA` y `FG_TARJETA_QA`.
- Crea un administrador por copia.
- Replica permisos del rol `admin`.
- Copia todas las configuraciones ERP, activas e inactivas, conservando sus campos funcionales.
- Copia bancos, cuentas, layouts y mappings.
- No copia usuarios productivos, sesiones ni extractos.
- Se detiene si alguna empresa QA ya existe.

Este seed sirve como base de la fase QA y su forma de copiar ERP coincide con la decision actual: las copias QA conservaran la misma configuracion SAP de produccion. **No debe ejecutarse hasta que el backend bloquee las escrituras SAP para las empresas QA**, porque la configuracion clonada apunta al mismo SAP real.

### 4.1 Entregable obligatorio: paquete SQL manual por base y por copia

La implementacion no terminara solamente con cambios de frontend/backend. Tambien se deben entregar scripts SQL completos, revisables y separados por responsabilidad. El usuario los ejecutara manualmente; la aplicacion, los despliegues y los agentes de desarrollo no deben ejecutarlos.

En el modelo actual, `5629621` y `FG_TARJETA` son empresas dentro de la misma base PostgreSQL de Qoncilia, no bases PostgreSQL independientes. Por eso "por base" se interpreta de esta forma:

| Destino | Responsabilidad | Forma de ejecucion |
| --- | --- | --- |
| PostgreSQL/Qoncilia QA | Crear las empresas QA y copiar su configuracion funcional | SQL PostgreSQL manual, un archivo por empresa |
| PostgreSQL/Qoncilia QA | Verificar que cada ERP QA sea identica a su ERP productiva y asignar los modulos FG | SQL PostgreSQL manual y separado de la clonacion |
| SAP B1/HANA productivo | Destino compartido por las ERP productivas y sus copias QA | Solo consultas durante QA; las escrituras quedan bloqueadas por empresa en el backend |
| SAP B1/HANA QA opcional | Destino alternativo si se necesitan pruebas reales de escritura | Copia administrada por SAP Basis/DBA; no mediante los seeds de Qoncilia |
| PostgreSQL/Qoncilia produccion | Habilitar los modulos FG despues de aprobar QA | SQL manual de promocion, sin clonar empresas ni configuraciones |

Si no existe una base fisica Qoncilia QA y se decide alojar `5629621_QA` y `FG_TARJETA_QA` como tenants dentro de la base actual, los scripts deben exigir el nombre exacto de la base mediante `current_database()` y escribir exclusivamente sobre los codigos fiscales QA. Esta alternativa no autoriza escrituras contra SAP productivo.

### 4.2 Scripts SQL preparados

Los numeros son propuestos a partir del ultimo seed actual (`55`). Cada archivo debe indicar en su cabecera la base y el ambiente esperados.

| Orden | Archivo a entregar | Base destino | Contenido |
| ---: | --- | --- | --- |
| 1 | `56_preflight_fg_qa_clone.sql` | PostgreSQL/Qoncilia QA | Solo lectura: valida base, esquema, empresas origen, ausencia de las copias, rol admin, ERP y conteos |
| 2 | `57_clone_5629621_to_qa.sql` | PostgreSQL/Qoncilia QA | Crea solamente `5629621_QA`, su admin, permisos base, copia ERP exacta, bancos, cuentas, layouts y mappings de `5629621` |
| 3 | `58_clone_fg_tarjeta_to_qa.sql` | PostgreSQL/Qoncilia QA | Crea solamente `FG_TARJETA_QA`, su admin, permisos base, copia ERP exacta, bancos, cuentas, layouts y mappings de `FG_TARJETA` |
| 4 | `59_verify_fg_qa_erp_parity.sql` | PostgreSQL/Qoncilia QA | Solo lectura: compara campo por campo cada ERP QA contra su origen sin mostrar secretos |
| 5 | `60_seed_fg_qa_modules.sql` | PostgreSQL/Qoncilia QA | Crea los codigos de modulo FG y los asigna solo a las dos empresas QA |
| 6 | `61_verify_fg_qa_isolation.sql` | PostgreSQL/Qoncilia QA | Solo lectura: compara origen/QA y prueba que no existan referencias cruzadas ni accesos productivos |
| 7 | `62_enable_fg_modules_production.sql` | PostgreSQL/Qoncilia produccion | Promocion posterior: asigna modulos FG a `5629621` y `FG_TARJETA` sin cambiar sus bancos, cuentas, layouts ni ERP |
| 8 | `63_rollback_fg_module_assignments.sql` | PostgreSQL/Qoncilia segun ambiente | Deshabilita asignaciones FG y ERP QA sin borrar empresas ni datos |

El seed combinado `53_clone_5629621_and_fg_tarjeta_for_qa.sql` queda como referencia tecnica para construir `57` y `58`. No debe ejecutarse cuando exista el nuevo paquete porque agrupa ambas copias en una sola transaccion. La conservacion de los destinos SAP del origen ya no se considera un defecto: es un requisito explicito de la copia ERP exacta.

### 4.3 Contrato de seguridad de todos los SQL generados

Cada script de escritura debe cumplir obligatoriamente lo siguiente:

1. Incluir `BEGIN` y `COMMIT` y abortar completamente ante cualquier precondicion fallida.
2. Validar `current_database()` contra `expected_database = 'QONCILIA_BACK'`. La constante se fijo despues de confirmar el entorno y no debe modificarse sin una revision explicita de base y alcance.
3. Validar exactamente los codigos origen y destino, sin `LIKE`, comodines ni seleccion por nombres parecidos.
4. Abortar si el destino QA ya existe; cualquier reparacion posterior debe usar otro SQL incremental especifico.
5. Escribir solo IDs nuevos pertenecientes a la empresa QA objetivo.
6. No ejecutar `UPDATE` ni `DELETE` sobre `5629621`, `FG_TARJETA`, `OCHO_A` u otra empresa productiva.
7. Copiar todas las filas ERP SAP del origen y preservar exactamente sus campos funcionales; solamente deben cambiar el nuevo `epc_id`, el `emp_id` de la copia y los timestamps de insercion.
8. No modificar `epc_activo`, `epc_es_predeterminado`, `epc_settings`, URLs, base SAP, queries ni credenciales cifradas durante la clonacion.
9. No incluir contrasenas en texto plano, cookies SAP ni sesiones ERP. Los valores cifrados se copian como datos opacos y nunca se imprimen.
10. Incluir una consulta final de verificacion sin mostrar secretos.
11. Tener una cabecera que diga claramente si es `PREFLIGHT`, `QA`, `PRODUCCION` o `ROLLBACK`.

Los scripts `57` y `58` seran independientes: si una copia falla, no se ejecutara ni revertira automaticamente la otra. El usuario ejecutara cada archivo por separado y guardara el resultado de `61_verify_fg_qa_isolation.sql` como evidencia.

### 4.4 Copia exacta de la configuracion ERP SAP

Cada fila de `empresas_erp_configuraciones` del origen se clonara hacia su empresa QA. La igualdad se define sobre estos campos:

| Campo | Regla de clonacion |
| --- | --- |
| `ept_id` | Igual al origen |
| `epc_codigo`, `epc_nombre` | Iguales al origen |
| `epc_activo`, `epc_es_predeterminado` | Iguales al origen |
| `epc_user_system`, `epc_user_pass` | Iguales al origen; el secreto permanece cifrado y no se muestra |
| `epc_db_name`, `epc_server_node` | Iguales al origen |
| `query_banco`, `query_sistema` | Iguales al origen, incluyendo `Referencia2` cuando exista |
| `epc_db_user`, `epc_db_password_enc` | Iguales al origen; el secreto permanece cifrado y no se muestra |
| `epc_service_layer_url` | Igual al origen |
| `epc_tls_version`, `epc_allow_self_signed` | Iguales al origen |
| `epc_settings` | JSON identico al origen, sin agregar flags QA |
| `epc_id` | Nuevo ID generado para la copia |
| `emp_id` | ID de `5629621_QA` o `FG_TARJETA_QA` |
| `epc_created_at`, `epc_updated_at` | Nuevos timestamps de la fila clonada |

Tambien se copiaran las configuraciones ERP inactivas si existen, conservando su estado. No se copiaran filas de sesiones SAP: cada administrador QA iniciara su propia sesion.

El script `59_verify_fg_qa_erp_parity.sql` comparara cada par origen/copia. Para secretos cifrados mostrara solamente igualdad booleana o hashes, nunca el contenido.

Esta decision implica que las consultas de las empresas QA leeran el mismo SAP que produccion. Por eso el aislamiento no puede depender de `epc_settings`: el backend FG debe rechazar por `companyCode` cualquier operacion SAP de escritura para `5629621_QA` y `FG_TARJETA_QA`.

Si mas adelante se necesitan pruebas reales de escritura antes del canary, se debera usar una sociedad SAP QA creada por SAP Basis/DBA. Ese cambio sera un procedimiento separado y no formara parte de los scripts de clonacion; las empresas QA con la configuracion exacta no se usaran para escribir en SAP productivo.

## 5. Regla de seguridad principal: ERP identica significa SAP productivo compartido

Copiar una empresa dentro de PostgreSQL aisla los datos de Qoncilia, pero la copia ERP exacta conecta deliberadamente al mismo SAP de produccion. Estos endpoints pueden escribir en SAP real:

- Creacion de `BankPages`.
- Depositos de tarjetas.
- `ExternalReconciliationsService_Reconcile`.
- Cualquier operacion futura de borrado o actualizacion SAP.

Antes de habilitar las empresas QA se debe implementar un bloqueo obligatorio en backend, independiente de la configuracion ERP:

1. Las consultas HANA `SELECT`, login, estado y logout pueden habilitarse para QA.
2. Depositos, creacion de `BankPages`, conciliaciones externas y cualquier otra mutacion SAP deben rechazar `5629621_QA` y `FG_TARJETA_QA` antes de abrir la llamada de escritura.
3. El bloqueo debe estar centralizado y probado; no puede depender solamente de ocultar botones en frontend.
4. `FG_QA_SAP_WRITES_ENABLED` tiene valor predeterminado `false`. Aun con valor `true`, la escritura exige que el codigo este en `FG_QA_SAP_WRITE_COMPANY_ALLOWLIST` y el `NODE_ENV` actual en `FG_QA_SAP_WRITE_ENVIRONMENT_ALLOWLIST`; ambas listas estan vacias por defecto.
5. Las credenciales, cookies y valores cifrados nunca deben aparecer en logs ni en este documento.

De esta manera la configuracion ERP queda identica a produccion, pero las copias QA permanecen en modo lectura hasta una autorizacion separada.

## 6. Fase 0: inventario y respaldo de solo lectura

Antes de modificar codigo o ejecutar SQL:

1. Confirmar que existen y estan activas exactamente una empresa `5629621` y una `FG_TARJETA`.
2. Confirmar que `5629621` tiene una ERP activa `SAP_B1`.
3. Confirmar que `FG_TARJETA` tiene una ERP activa `SAP_TARJETAS`.
4. Obtener la matriz de modulos habilitados para el rol `admin` de ambas empresas.
5. Contar bancos raiz, cuentas raiz, layouts y mappings por empresa.
6. Inventariar, sin exponer secretos:
   - cantidad total de configuraciones ERP activas e inactivas;
   - codigo y estado de la ERP;
   - nombre de base SAP;
   - host HANA;
   - dominio del Service Layer;
   - queries `query_banco` y `query_sistema`;
   - claves no sensibles de `epc_settings`.
7. Exportar un respaldo de PostgreSQL con las tablas involucradas o tomar un backup completo antes de la clonacion.
8. Guardar los conteos y resultados como evidencia de linea base.

### Criterio de salida

- Los dos origenes existen sin ambiguedad.
- No hay bancos raiz duplicados por nombre dentro de cada origen.
- Las ERP requeridas existen.
- Existe exactamente un rol activo `admin`.
- Se confirmo que las copias QA usaran inicialmente la misma conexion SAP productiva en modo lectura.
- Se conoce si existe SAP QA solamente en caso de requerir pruebas reales de escritura.

## 7. Fase 1: preparar la clonacion QA

### 7.1 Preparar los scripts 56 a 61 antes de ejecutarlos

Si las empresas QA aun no existen:

1. Ejecutar primero `56_preflight_fg_qa_clone.sql` y guardar su salida.
2. Cambiar los logins iniciales si chocan con usuarios existentes.
3. Reemplazar las contrasenas temporales por valores entregados fuera del repositorio.
4. No almacenar contrasenas finales en Git.
5. Copiar todas las configuraciones ERP del origen, tanto activas como inactivas, conservando exactamente sus estados.
6. Mantener `epc_codigo` como `SAP_B1` y `SAP_TARJETAS`, porque el frontend filtra por esos codigos.
7. Mantener las queries, conexiones, settings y valores cifrados del origen correspondiente, no los de OCHO_A.
8. Ejecutar `59_verify_fg_qa_erp_parity.sql` y exigir igualdad completa antes de habilitar los modulos.
9. Confirmar mediante pruebas automaticas que el backend bloquea toda escritura SAP de los codigos QA.
10. Ejecutar `60` para asignar los nuevos modulos exclusivamente a QA.
11. Ejecutar `61` y comparar los conteos origen/QA de bancos, cuentas, layouts y mappings.

Si `5629621_QA` o `FG_TARJETA_QA` ya existen, no se deben volver a ejecutar `53`, `57` o `58` para ese destino. Se preparara un SQL incremental y especifico para completar solamente lo que falte, sin sobrescribir la configuracion QA existente.

### 7.2 Ejecutar la copia manualmente

Cada SQL debe ejecutarlo una persona autorizada despues de revisarlo. Los archivos se ejecutaran uno por uno, en el orden definido en 4.2, y cada escritura permanecera dentro de su propia transaccion atomica.

El resultado esperado es:

| Copia QA | Usuario | ERP requerida | Datos bancarios |
| --- | --- | --- | --- |
| `5629621_QA` | Un admin nuevo | Copia exacta de todas las ERP de `5629621` | Bancos, cuentas, layouts y mappings de `5629621` |
| `FG_TARJETA_QA` | Un admin nuevo | Copia exacta de todas las ERP de `FG_TARJETA` | Bancos, cuentas, layouts y mappings de `FG_TARJETA` |

### 7.3 Validaciones posteriores

- Las empresas productivas conservan los mismos IDs, usuarios y conteos.
- Los bancos y cuentas QA tienen IDs nuevos.
- Todos los bancos y cuentas QA pertenecen a la empresa QA correcta.
- Los bancos y cuentas clonados son raiz; no apuntan mediante `*_origen_id` al registro productivo.
- Los layouts QA apuntan a los bancos QA.
- Los mappings QA apuntan a los layouts QA.
- Cada administrador pertenece exclusivamente a su empresa QA.
- No se copio ninguna sesion ERP.
- Cada ERP QA conserva exactamente estado, predeterminacion, conexion, queries, settings y credenciales cifradas de su origen.
- `59_verify_fg_qa_erp_parity.sql` no reporta ninguna diferencia funcional.
- Los endpoints de escritura SAP rechazan ambas empresas QA aunque la ERP copiada este activa.
- Se fuerza el cambio de clave en el primer acceso.

## 8. Fase 2: crear los modulos FG aislados

Preparar el SQL manual `60_seed_fg_qa_modules.sql` con estas responsabilidades:

1. Insertar o actualizar solo las definiciones globales de:

| Codigo | Nombre | Ruta sugerida |
| --- | --- | --- |
| `conciliation_fg` | Carga de Extractos FG | `/fg/cargar-extractos` |
| `bank_conciliation_fg` | Conciliacion de Banco FG | `/fg/conciliacion-banco` |
| `card_payment_fg` | Pagos Tarjetas FG | `/pago-tarjeta-fg/debito` |

2. Asignar `conciliation_fg` y `bank_conciliation_fg` solamente al rol `admin` de `5629621_QA` durante QA.
3. Asignar `card_payment_fg` solamente al rol `admin` de `FG_TARJETA_QA` durante QA.
4. Mantener deshabilitados los nuevos modulos para `5629621`, `FG_TARJETA`, `OCHO_A` y todas las demas empresas.
5. No deshabilitar todavia los modulos estandar de las empresas productivas.
6. Hacer el seed idempotente y validar los codigos fiscales exactos antes de cualquier escritura.
7. Devolver al final una consulta de verificacion por empresa, rol, modulo y estado.

### Matriz QA esperada

| Empresa QA | Carga FG | Conciliacion FG | Tarjetas FG |
| --- | ---: | ---: | ---: |
| `5629621_QA` | Si | Si | No |
| `FG_TARJETA_QA` | No | No | Si |

## 9. Fase 3: backend FG

### 9.1 Nuevos codigos y registro

Agregar al enum [`src/common/enums/app-module-code.enum.ts`](../src/common/enums/app-module-code.enum.ts):

- `CONCILIATION_FG = "conciliation_fg"`
- `BANK_CONCILIATION_FG = "bank_conciliation_fg"`
- `CARD_PAYMENT_FG = "card_payment_fg"`

Registrar los nuevos controladores y servicios en:

- [`src/conciliation/conciliation.module.ts`](../src/conciliation/conciliation.module.ts)
- [`src/erp/erp.module.ts`](../src/erp/erp.module.ts)

### 9.2 Fachada de extractos FG

Crear una copia estructural de la fachada OCHO_A:

- `src/conciliation/fg-conciliation.controller.ts`
- `src/conciliation/fg-conciliation.service.ts`
- Prefijo API: `/conciliation/fg`
- Guards: JWT, rol y nuevos modulos FG.

Durante QA, el servicio debe aceptar solamente `companyCode = 5629621_QA`. El codigo productivo `5629621` se agregara a la allowlist unicamente en la fase de promocion.

La fachada delegara inicialmente en `ConciliationService`, preservando:

- catalogo de bancos/cuentas/layouts;
- preview de extractos;
- guardado y listado por empresa;
- comparacion;
- eliminacion restringida al alcance de la empresa.

### 9.3 Fachada SAP bancaria FG

Crear:

- `src/erp/sap/fg-sap-bank.controller.ts`
- `src/erp/sap/fg-sap-bank.service.ts`
- Prefijo API: `/erp/sap/fg-bank`
- Modulo requerido: `bank_conciliation_fg`.

Durante QA solo debe aceptar `5629621_QA`.

Debe copiar del flujo OCHO_A:

- login, estado y logout SAP;
- ejecucion de query bancaria/sistema;
- comparacion con `groupSystemMatches: true`;
- una fila de banco contra varias lineas de sistema;
- soporte de `Referencia2`;
- envio de conciliacion externa con una sola linea bancaria y todas las lineas contables seleccionadas.

No debe cambiar `OchoASapBankService` ni el flujo estandar `/erp/sap`.

### 9.4 Fachada SAP de tarjetas FG

Crear:

- `src/erp/sap/fg-sap-tarjetas.controller.ts`
- `src/erp/sap/fg-sap-tarjetas.service.ts`
- Prefijo API: `/erp/sap/fg`
- Modulo requerido: `card_payment_fg`.

Durante QA solo debe aceptar `FG_TARJETA_QA`.

Debe copiar inicialmente:

- pantallas separadas de debito y credito;
- parseo CSV con Fecha de venta;
- seleccion multiple en ambas tablas;
- matching estricto de importe y referencia cuando corresponda;
- resumen y exclusion por fecha;
- fecha de deposito tomada del CSV segun el tipo;
- un JSON por lote con todos los `AbsId` seleccionados;
- endpoints separados `/deposits/debit` y `/deposits/credit`.

Las reglas exclusivas de OCHO_A no deben trasladarse automaticamente. En particular:

- La cuenta de comision fija de OCHO_A no se reutiliza en FG sin aprobacion contable.
- El calculo `Importe - Importe neto` solo se activa si FG lo requiere.
- `BankReference` se habilita para FG solo si SAP FG lo exige.

## 10. Contrato SAP de tarjetas para FG

La diferencia conocida de FG debe expresarse como configuracion del perfil FG, no mediante comparaciones de URL ni valores dispersos.

| Campo Service Layer | Origen Qoncilia | Regla propuesta |
| --- | --- | --- |
| `DepositAccount` | `cuenta_bancaria_numero_mayor` seleccionada | Obligatorio |
| `BankAccountNum` | `cuenta_bancaria_numero_pago` | Obligatorio para FG si SAP lo valida |
| `Bank` | `bancos.banco_descripcion`, con fallback a `banco_nombre` | Obligatorio para FG |
| `BankBranch` | `cuentas_bancarias.cuenta_bancaria_sucursal` | Obligatorio si el banco FG lo requiere |
| `DepositDate` | Fecha derivada del CSV | Igual a la fecha del lote procesado |
| `CreditLines[].AbsId` | Filas SAP matcheadas | Sin duplicados y en un solo lote |
| `BankReference` | Entrada o resumen por fecha | Pendiente de confirmacion FG |
| Campos de comision | Regla contable FG | Desactivados hasta confirmacion |

Antes del POST a SAP, el backend FG debe validar los campos marcados como obligatorios y devolver un error funcional claro. No debe mandar un payload parcial silenciosamente.

Se recomienda crear un perfil tipado, por ejemplo:

```typescript
type CardPaymentProfile = {
  splitDepositEndpoints: boolean;
  strictReferenceAmountMatch: boolean;
  deriveDepositDateFromCsv: boolean;
  requireBankName: boolean;
  requireBankAccountNum: boolean;
  requireBankBranch: boolean;
  creditCommissionMode: "none" | "gross_minus_net";
  commissionAccount?: string;
  allowBankReference: boolean;
};
```

Los perfiles OCHO_A y FG deben ser distintos aunque compartan el mismo nucleo de procesamiento.

## 11. Fase 4: frontend FG

### 11.1 Codigos y rutas

Agregar a [`QonciliaFront/src/utils/modules.ts`](../../QonciliaFront/src/utils/modules.ts):

- `conciliationFg`
- `bankConciliationFg`
- `cardPaymentFg`

Crear paginas independientes:

- `QonciliaFront/src/pages/CargaExtractosFgPage.tsx`
- `QonciliaFront/src/pages/ConciliacionBancoFgPage.tsx`
- `QonciliaFront/src/pages/PagoTarjetaFgPage.tsx`

Registrar en `QonciliaFront/src/App.tsx`:

- `/fg/cargar-extractos`
- `/fg/conciliacion-banco`
- `/pago-tarjeta-fg/debito`
- `/pago-tarjeta-fg/credito`

Cada ruta debe usar `ProtectedRoute` con su modulo FG correspondiente.

### 11.2 Navegacion

Actualizar `Navbar.tsx` para mostrar:

- En `5629621_QA`: Cargar Extractos FG y Conciliacion de Banco FG.
- En `FG_TARJETA_QA`: Pagos Tarjetas FG con Debito y Credito.
- Ningun enlace FG para OCHO_A ni para otras empresas sin asignacion.

Actualizar `HomePage.tsx` para resolver las rutas FG cuando el usuario tenga los modulos FG, sin cambiar la prioridad actual de OCHO_A.

### 11.3 Eliminar reglas basadas en la URL

Actualmente parte del flujo especializado se activa comparando:

```typescript
sapApiBasePath === "/erp/sap/ocho-a"
```

Una copia que solo cambie la URL perderia reglas importantes, como matching estricto, calculo de comision o endpoint dividido. Antes de agregar FG, reemplazar esas comparaciones por un perfil explicito, por ejemplo:

```typescript
workbenchProfile: "standard" | "ocho_a" | "fg"
```

o por flags de capacidad tipados. El perfil FG debe llegar desde `PagoTarjetaFgPage` hasta `useConciliationWorkbench` y `SapTarjetasSection`.

### 11.4 Configuracion inicial de paginas FG

`ConciliacionBancoFgPage` debe usar:

- `mode="banco"`
- `conciliationApiBasePath="/conciliation/fg"`
- `sapApiBasePath="/erp/sap/fg-bank"`
- `allowSapB1SystemManyToOne`

`PagoTarjetaFgPage` debe usar:

- `mode="tarjetas"`
- `sapApiBasePath="/erp/sap/fg"`
- `cardPaymentKind="debit"` o `"credit"`
- perfil de capacidades FG.

## 12. Fase 5: validacion de bancos, cuentas y layouts QA

### 12.1 FG_TARJETA_QA

Por cada cuenta que pueda usarse para depositos, verificar:

- Banco y cuenta pertenecen a `FG_TARJETA_QA`.
- `banco_descripcion` contiene el valor que debe viajar como `Bank`.
- `cuenta_bancaria_numero_pago` contiene el valor de `BankAccountNum`.
- `cuenta_bancaria_sucursal` contiene el valor de `BankBranch`, si aplica.
- `cuenta_bancaria_numero_mayor` contiene `DepositAccount`.
- Moneda y cuenta corresponden al archivo y a la consulta SAP.

### 12.2 5629621_QA

Por cada cuenta de conciliacion verificar:

- Cuenta mayor SAP para `BankStatementAccountCode`.
- `Sequence` real proveniente de OBNK/BankPages.
- `TransactionNumber` y `LineNumber` provenientes de JDT1.
- Queries con `Referencia` y `Referencia2` cuando aplique.
- Layout activo y mappings correctos por banco.
- Debitos y creditos conservan el sentido correcto al crear BankPages.

## 13. Fase 6: pruebas automaticas

### 13.1 Backend

Agregar pruebas para:

- Los usuarios de otras empresas reciben `403` en endpoints FG.
- `5629621_QA` no puede usar tarjetas FG.
- `FG_TARJETA_QA` no puede usar conciliacion FG.
- Los endpoints FG exigen sus nuevos modulos.
- Los endpoints OCHO_A siguen aceptando solo OCHO_A.
- Matching bancario FG permite uno-a-varios y mantiene el total exacto.
- Tarjetas FG preserva importe, referencia y fecha.
- No se repiten `AbsId` dentro de `CreditLines`.
- Falta de `Bank`, `BankAccountNum` o `BankBranch` produce error antes de llamar SAP cuando esos campos sean obligatorios.
- `5629621_QA` y `FG_TARJETA_QA` tienen bloqueadas todas las escrituras SAP por `companyCode`, independientemente de que su ERP copiada este activa.
- `FG_QA_SAP_WRITES_ENABLED` esta desactivada por defecto y no permite escritura sin allowlist explicita de empresa y ambiente.
- Los builders de payload producen snapshots sin secretos.

### 13.2 Frontend

Agregar pruebas para:

- Visibilidad del navbar por modulo.
- Proteccion de rutas FG.
- Separacion Debito/Credito.
- Seleccion multiple.
- Resumen y exclusion por fecha.
- Fecha de deposito derivada del CSV.
- Matching manual y automatico.
- Perfil FG sin dependencia del texto de la URL.
- Errores claros cuando falta configuracion bancaria.

## 14. Fase 7: pruebas funcionales QA

Ejecutar en este orden:

1. Iniciar sesion con el admin de `5629621_QA`.
2. Confirmar que solo aparecen los modulos bancarios FG esperados.
3. Subir un extracto de cada banco soportado y revisar preview, debitos, creditos, fechas y referencias.
4. Guardar el extracto y comprobar que solo aparece dentro de la empresa QA.
5. Ejecutar queries SAP en modo lectura.
6. Probar matching automatico uno-a-uno.
7. Probar matching manual y uno-a-varios.
8. Verificar totales banco/sistema y payload de conciliacion externa en modo sin escritura.
9. Iniciar sesion con el admin de `FG_TARJETA_QA`.
10. Confirmar que solo aparece Pagos Tarjetas FG.
11. Cargar CSV y ejecutar consultas en modo lectura.
12. Probar debito y credito con seleccion multiple, resumen por fecha y exclusiones.
13. Inspeccionar el payload final sin enviarlo.
14. Confirmar `Bank`, `BankAccountNum`, `BankBranch`, `DepositAccount`, fecha y `AbsId`.
15. Confirmar que al intentar depositar, crear `BankPages` o conciliar externamente el backend rechaza la operacion antes de llamar al SAP productivo.
16. Si existe una sociedad SAP QA y se aprueba una prueba de escritura, realizar el cambio de conexion mediante un procedimiento temporal separado, procesar un lote minimo y restaurar despues la copia ERP exacta.
17. Si no existe SAP QA, dejar la validacion de escritura para el canary productivo autorizado; no usar las empresas QA para escribir en SAP productivo.

### Pruebas negativas obligatorias

- Un admin productivo no ve ni puede llamar los endpoints FG QA.
- Un admin QA no puede consultar bancos/cuentas de la otra copia QA.
- Un usuario sin modulo recibe `403` aunque conozca la URL.
- Con los codigos `5629621_QA` o `FG_TARJETA_QA`, el backend no realiza escrituras aunque la ERP sea identica y activa.
- Las empresas productivas conservan sus modulos, bancos, cuentas y ERP sin cambios.

## 15. Evidencia requerida para aprobar QA

- Captura de matriz de modulos de ambas empresas QA.
- Resultado de conteos origen/QA para bancos, cuentas, layouts y mappings.
- Evidencia de que no se copiaron sesiones ni extractos.
- Capturas de cada pantalla FG.
- Payload de tarjetas redactado, sin cookies ni credenciales.
- Payload de conciliacion externa redactado.
- Resultado de pruebas automaticas frontend/backend.
- Resultado de build frontend/backend.
- Evidencia de que las consultas QA llegaron al SAP productivo compartido y las escrituras fueron bloqueadas antes de la llamada.
- Identificacion del SAP QA, solamente si se realizo una prueba opcional de escritura.
- Firma funcional de responsables de conciliacion y tarjetas.

## 16. Fase 8: promocion controlada a produccion

La promocion debe usar un SQL diferente al seed QA. No se deben clonar nuevamente empresas, bancos, cuentas ni ERP productivas.

### 16.1 Preparacion

1. Desplegar primero el codigo FG con sus allowlists productivas deshabilitadas.
2. Verificar que OCHO_A y los modulos estandar continuan operativos.
3. Validar directamente los bancos, cuentas, layouts y ERP ya existentes en las empresas FG productivas.
4. Confirmar reglas de comision y referencia de FG.
5. Preparar `62_enable_fg_modules_production.sql`, atomico e idempotente.

### 16.2 Habilitacion

El seed de promocion debe:

- Habilitar `conciliation_fg` y `bank_conciliation_fg` solo para los roles autorizados de `5629621`.
- Habilitar `card_payment_fg` solo para los roles autorizados de `FG_TARJETA`.
- No asignar ningun modulo FG a OCHO_A.
- Mantener temporalmente los modulos anteriores para permitir rollback.

Despues se agregaran a las allowlists backend:

- `5629621` en conciliacion/extractos FG.
- `FG_TARJETA` en tarjetas FG.

### 16.3 Canary

1. Habilitar primero un rol o usuario operativo controlado.
2. Ejecutar consultas sin escritura.
3. Procesar un lote pequeno autorizado.
4. Revisar SAP y logs.
5. Ampliar acceso solamente si el resultado es correcto.
6. Deshabilitar los modulos estandar antiguos cuando termine el periodo de convivencia.

## 17. Rollback

### QA

- Deshabilitar `conciliation_fg`, `bank_conciliation_fg` y `card_payment_fg` para las empresas QA.
- Marcar las ERP QA como inactivas.
- Marcar las empresas QA como inactivas si se necesita detener todas las pruebas.
- No borrar ni modificar las empresas productivas.
- La eliminacion completa de copias QA, si fuera necesaria, debe prepararse como SQL manual separado y revisado.

### Produccion

- Volver a habilitar los modulos estandar anteriores.
- Deshabilitar los modulos FG nuevos en la matriz de acceso.
- Retirar los codigos productivos de las allowlists FG si se requiere un bloqueo adicional.
- Revertir el despliegue frontend/backend si existe un fallo de codigo.
- No revertir operaciones SAP ya confirmadas mediante eliminacion directa en base de datos; seguir el procedimiento contable/SAP correspondiente.

## 18. Orden recomendado de implementacion y despliegue

1. Completar inventario y confirmar que la ERP se clonara exactamente; identificar SAP QA solo si se probaran escrituras.
2. Preparar y revisar `56_preflight_fg_qa_clone.sql`.
3. Ejecutar manualmente `56` y guardar la evidencia.
4. Preparar y revisar por separado `57_clone_5629621_to_qa.sql` y `58_clone_fg_tarjeta_to_qa.sql`.
5. Ejecutar manualmente `57` y validar `5629621_QA`.
6. Ejecutar manualmente `58` y validar `FG_TARJETA_QA`.
7. Preparar y ejecutar manualmente `59_verify_fg_qa_erp_parity.sql`, confirmando igualdad sin exponer secretos.
8. Implementar enum, controladores, servicios y guards FG en backend.
9. Implementar perfiles de comportamiento, paginas, rutas y navbar FG en frontend.
10. Ejecutar builds y pruebas automaticas.
11. Desplegar codigo con los modulos FG aun sin asignacion productiva.
12. Ejecutar manualmente `60_seed_fg_qa_modules.sql` solo para las empresas QA.
13. Ejecutar `61_verify_fg_qa_isolation.sql` y archivar su salida.
14. Ejecutar pruebas funcionales QA.
15. Aprobar payloads y reglas FG.
16. Preparar y revisar `62_enable_fg_modules_production.sql`.
17. Habilitar mediante canary.
18. Retirar los modulos antiguos solamente despues del periodo de estabilidad.

## 19. Archivos previstos

### Backend

- `src/common/enums/app-module-code.enum.ts`
- `src/conciliation/fg-conciliation.controller.ts`
- `src/conciliation/fg-conciliation.service.ts`
- `src/conciliation/conciliation.module.ts`
- `src/erp/sap/fg-sap-bank.controller.ts`
- `src/erp/sap/fg-sap-bank.service.ts`
- `src/erp/sap/fg-sap-tarjetas.controller.ts`
- `src/erp/sap/fg-sap-tarjetas.service.ts`
- `src/erp/erp.module.ts`
- DTOs/interfaces solo si el contrato FG necesita campos distintos.
- Pruebas unitarias y de integracion correspondientes.

### Frontend

- `src/utils/modules.ts`
- `src/pages/CargaExtractosFgPage.tsx`
- `src/pages/ConciliacionBancoFgPage.tsx`
- `src/pages/PagoTarjetaFgPage.tsx`
- `src/pages/ConciliationWorkbenchPage.tsx`
- `src/hooks/useConciliationWorkbench.ts`
- `src/components/ConciliationWorkbench/SapTarjetasSection.tsx`
- `src/components/Navbar.tsx`
- `src/pages/HomePage.tsx`
- `src/App.tsx`
- Pruebas de rutas, perfiles y componentes.

### SQL manual

- `53_clone_5629621_and_fg_tarjeta_for_qa.sql` se conserva solo como referencia y no se ejecutara cuando exista el paquete nuevo.
- `56_preflight_fg_qa_clone.sql`, exclusivamente de lectura.
- `57_clone_5629621_to_qa.sql`, copia exclusiva de conciliacion bancaria.
- `58_clone_fg_tarjeta_to_qa.sql`, copia exclusiva de pagos de tarjetas.
- `59_verify_fg_qa_erp_parity.sql`, comparacion de solo lectura de las ERP clonadas contra produccion.
- `60_seed_fg_qa_modules.sql`, asignacion exclusiva de modulos a QA.
- `61_verify_fg_qa_isolation.sql`, verificacion de solo lectura.
- `62_enable_fg_modules_production.sql`, promocion posterior sin copiar datos.
- `63_rollback_fg_module_assignments.sql`, rollback sin borrado automatico de empresas.

## 20. Criterios finales de aceptacion

La migracion se considera lista para produccion solo cuando:

- Existen dos empresas QA independientes y dos administradores, uno por empresa.
- Bancos, cuentas, layouts y mappings QA corresponden a su propio origen FG.
- Cada ERP QA es funcionalmente identica a su origen productivo salvo por `epc_id`, `emp_id` y timestamps.
- Las empresas productivas no presentan cambios de datos ni accesos antes del canary.
- Los nuevos endpoints rechazan empresas que no estan en su allowlist.
- `5629621_QA` usa solamente extractos y conciliacion FG.
- `FG_TARJETA_QA` usa solamente tarjetas FG.
- El payload de tarjetas FG contiene correctamente el nombre del banco y los campos acordados de la cuenta bancaria.
- La conciliacion FG soporta uno-a-varios y `Referencia2` sin alterar el payload SAP esperado.
- Las empresas QA no pueden escribir en SAP mientras conservan la conexion productiva exacta.
- Cualquier prueba de escritura previa al canary se realizo exclusivamente en una sociedad SAP QA mediante un procedimiento separado.
- OCHO_A continua funcionando sin regresiones.
- Existe rollback probado mediante modulos y allowlists.

## 21. Decisiones que deben cerrarse antes de programar la escritura SAP

1. Confirmacion formal de que las ERP QA compartiran URL, base y credenciales cifradas con su origen productivo y operaran inicialmente en modo lectura.
2. Si `BankBranch` es obligatorio para todos los bancos FG o solo para algunos.
3. Regla de `BankReference` en tarjetas FG.
4. Si FG credito lleva comision y, en ese caso, cuenta contable y formula exacta.
5. Roles productivos que recibiran cada nuevo modulo, ademas de `admin`.
6. Duracion del periodo de convivencia entre modulos antiguos y nuevos.

Si se requieren pruebas de escritura antes del canary, tambien se deben obtener URL, base y credenciales de una sociedad SAP QA. Hasta cerrar los puntos 1 a 4, las consultas pueden probarse en modo lectura, pero los endpoints de escritura SAP deben permanecer bloqueados.
