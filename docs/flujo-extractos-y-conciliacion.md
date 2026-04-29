# Flujo de extractos bancarios y conciliacion temporal

## Objetivo

El sistema ya no guarda registros del Excel del sistema ni resultados de comparacion. La unica informacion operativa persistida es el extracto bancario importado por banco, cuenta bancaria y layout.

## Pantalla Extractos bancos

1. El usuario selecciona banco, cuenta bancaria y layout.
2. La cuenta bancaria es obligatoria.
3. Carga el alias del extracto. La pantalla sugiere nombre de cuenta en minuscula sin espacios + fecha/hora/minuto/segundo, pero el usuario puede editarlo.
4. El usuario sube el Excel del banco.
5. Puede visualizar las filas parseadas antes de guardar.
6. Al guardar, se crean:
   - `extractos_bancarios`: cabecera del archivo.
   - `extractos_bancarios_filas`: filas parseadas con valores originales y normalizados.
6. El usuario puede abrir o eliminar extractos ya guardados.

## Pantalla Conciliar

1. El usuario selecciona banco, cuenta bancaria y layout.
2. Busca extractos bancarios guardados con esos filtros.
3. Selecciona un extracto.
4. Sube el Excel del sistema.
5. El backend parsea el Excel del sistema en memoria, toma las filas bancarias guardadas y calcula coincidencias automaticas.
6. El frontend permite hacer match manual en memoria.
7. El resultado no se guarda.

## Endpoints principales

| Metodo | Ruta | Funcion |
| --- | --- | --- |
| `POST` | `/conciliation/bank-statements/preview` | Lee un Excel bancario y devuelve filas parseadas sin guardar. |
| `POST` | `/conciliation/bank-statements` | Guarda un extracto bancario con su cuenta, banco, layout y filas. |
| `GET` | `/conciliation/bank-statements` | Lista extractos por usuario, banco, cuenta, layout y fechas. |
| `GET` | `/conciliation/bank-statements/:id` | Devuelve cabecera y filas de un extracto guardado. |
| `DELETE` | `/conciliation/bank-statements/:id` | Elimina un extracto y sus filas. |
| `POST` | `/conciliation/compare-bank-statement` | Compara un Excel del sistema temporal contra un extracto guardado. |

## Reglas importantes

- `companyBankAccountId` es obligatorio al guardar extractos.
- `name` es obligatorio al guardar extractos y representa el alias visible del extracto.
- El layout debe pertenecer al banco elegido.
- La cuenta bancaria debe pertenecer al banco elegido.
- El Excel del sistema nunca se guarda.
- Los matches automaticos y manuales nunca se guardan.
- Las tablas `conciliaciones` y `conciliacion_resultados` quedan fuera del esquema nuevo.
