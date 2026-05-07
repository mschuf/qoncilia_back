# SAP B1 - Conciliacion externa via Service Layer

## Objetivo

Qoncilia no inserta directamente en OMTH, MTH1 o MTH2. La integracion correcta es llamar al
Service Layer de SAP Business One y dejar que SAP cree la reconciliacion externa y actualice sus
tablas internas.

Endpoint usado:

```http
POST /b1s/v2/ExternalReconciliationsService_Reconcile
```

Payload base:

```json
{
  "ExternalReconciliation": {
    "ReconciliationAccountType": "rat_GLAccount",
    "ReconciliationBankStatementLines": [
      {
        "BankStatementAccountCode": "1.01.02.001.002",
        "Sequence": 123
      }
    ],
    "ReconciliationJournalEntryLines": [
      {
        "TransactionNumber": 456,
        "LineNumber": 0
      }
    ]
  }
}
```

## Relacion con tablas SAP

| SAP | Uso | Como lo usa Qoncilia |
| --- | --- | --- |
| OMTH | Historial/cabecera de reconciliacion externa | SAP la genera al reconciliar. `MthAcctCod` debe coincidir con la cuenta enviada como `BankStatementAccountCode`. |
| MTH1 | Lineas contables reconciliadas | SAP la genera a partir de `ReconciliationJournalEntryLines`. |
| MTH2 | Lineas de extracto bancario reconciliadas | SAP la genera a partir de `ReconciliationBankStatementLines`. |
| OBNK | External Bank Statement | Debe existir previamente en SAP. Qoncilia necesita su `Sequence`. |
| JDT1 | Journal Entry rows | Qoncilia necesita `TransId` y `Line_ID` para enviar `TransactionNumber` y `LineNumber`. |
| OSVR | Reconciliaciones guardadas como borrador | No se usa para finalizar desde Qoncilia. |

## Configuracion de cuentas bancarias en Qoncilia

En Admin > Cuentas bancarias:

| Campo Qoncilia | Valor SAP recomendado | Ejemplo |
| --- | --- | --- |
| Numero de cuenta | Numero bancario operativo / visible para usuario | 123456789 |
| ID banco ERP | Codigo interno de banco o cuenta ERP si aplica | BNF_GS_01 |
| Cuenta mayor SAP (MthAcctCod) | Cuenta contable SAP que aparece en OMTH.MthAcctCod / OBNK.BnkAcctCode | 1.01.02.001.002 |
| Cuenta de pago | Solo para otros flujos futuros; no se usa en conciliacion externa | 1.01.02.001.999 |

Para la conciliacion externa actual, Qoncilia arma `BankStatementAccountCode` con este orden:

1. `accountCode` enviado manualmente en el request.
2. `sapBankStatementAccountCode` o `sapExternalReconciliationAccountCode` en `epc_settings`.
3. `cuenta_bancaria_numero_mayor`.
4. `cuenta_bancaria_id_banco_erp`.
5. `cuenta_bancaria_numero`.

La opcion esperada es la 3: cargar `cuenta_bancaria_numero_mayor` con el codigo SAP, por ejemplo
`1.01.02.001.002`.

## Datos que deben venir en los archivos/layouts

El Excel del sistema debe exponer los datos de JDT1:

| Campo esperado | Campo SAP |
| --- | --- |
| TransactionNumber / TransId | JDT1.TransId |
| LineNumber / Line_ID | JDT1.Line_ID |

El extracto bancario guardado debe exponer los datos de OBNK:

| Campo esperado | Campo SAP |
| --- | --- |
| Sequence | OBNK.Sequence |
| BankStatementAccountCode | OBNK.BnkAcctCode, opcional si la cuenta bancaria de Qoncilia ya tiene la cuenta mayor SAP |

Qoncilia no usa el numero de fila del Excel como `Sequence` por defecto, porque puede reconciliar
una linea equivocada si el orden del Excel no coincide con OBNK. Si una empresa garantiza que el
numero de fila equivale al `Sequence` de SAP, puede habilitarlo con:

```json
{
  "sapExternalReconciliationUseRowNumberAsSequence": true
}
```

## Ejemplo SQL para cargar una cuenta SAP en Qoncilia

```sql
UPDATE public.cuentas_bancarias
SET
  cuenta_bancaria_numero_mayor = '1.01.02.001.002',
  cuenta_bancaria_id_banco_erp = 'BNF_GS_01',
  cuenta_bancaria_actualizado_en = NOW()
WHERE cuenta_bancaria_id = 10;
```

## Configuracion ERP SAP B1

`epc_settings` recomendado:

```json
{
  "externalReconciliationEndpoint": "ExternalReconciliationsService_Reconcile",
  "sessionCheckPath": "BankPages?$top=1",
  "sapExternalReconciliationAccountType": "rat_GLAccount"
}
```

Usar `rat_GLAccount` cuando se reconcilian cuentas contables como `1.01.02.001.002`.
Usar `rat_BusinessPartner` solo si el proceso SAP reconcilia contra socios de negocio.
