import type { ConciliationPreviewRow } from "./interfaces/conciliation.interfaces";
import { ConciliationService } from "./conciliation.service";

type ConciliationAmountInternals = {
  resolveBankPageAmounts(
    row: ConciliationPreviewRow,
    rowLabel: number,
    amountMode: string | null
  ): { debitAmount: number; creditAmount: number };
};

const service = Object.create(ConciliationService.prototype) as ConciliationAmountInternals;

const bankRow = (debit: string, credit: string): ConciliationPreviewRow => ({
  rowId: "Contenido:15",
  rowNumber: 15,
  values: {
    Debito: debit,
    Credito: credit
  },
  normalized: {
    Debito: debit,
    Credito: credit
  }
});

describe("modo debit_credit_abs para extractos con Debitos negativos", () => {
  it("mantiene un debito negativo de Itau en DebitAmount y elimina solo el signo", () => {
    expect(service.resolveBankPageAmounts(bankRow("-6.600,00", "0,00"), 15, "debit_credit_abs"))
      .toEqual({
        debitAmount: 6600,
        creditAmount: 0
      });
  });

  it("mantiene un credito de Itau en CreditAmount", () => {
    expect(service.resolveBankPageAmounts(bankRow("0,00", "35.599,33"), 10, "debit_credit_abs"))
      .toEqual({
        debitAmount: 0,
        creditAmount: 35599.33
      });
  });
});
