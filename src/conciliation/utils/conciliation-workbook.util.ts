import { BadRequestException } from "@nestjs/common";
import * as XLSX from "xlsx";
import { ReconciliationLayout } from "../entities/reconciliation-layout.entity";
import { ReconciliationLayoutMapping } from "../entities/reconciliation-layout-mapping.entity";
import {
  CompareOperator,
  ConciliationPreviewMatch,
  ConciliationPreviewResponse,
  ConciliationPreviewRow,
  ConciliationRuleResult
} from "../interfaces/conciliation.interfaces";

type WorkbookSide = "system" | "bank";
type SupportedNormalizedValue = string | number | null;

type MatchEvaluation = {
  score: number;
  requiredPassed: boolean;
  ruleResults: ConciliationRuleResult[];
  passedRules: number;
};

type AutoMatchLayout = Pick<ReconciliationLayout, "autoMatchThreshold" | "mappings">;
type PreviewMetrics = ConciliationPreviewResponse["metrics"];

export function readWorkbook(buffer: Buffer, fileName: string): XLSX.WorkBook {
  try {
    return XLSX.read(buffer, {
      type: "buffer",
      cellDates: true
    });
  } catch {
    throw new BadRequestException(`No se pudo leer el Excel ${fileName}.`);
  }
}

export function extractRowsFromWorkbook(
  workbook: XLSX.WorkBook,
  mappings: ReconciliationLayoutMapping[],
  side: WorkbookSide
): ConciliationPreviewRow[] {
  const activeMappings = sortLayoutMappings(mappings).filter((mapping) => mapping.active);
  const sideMappings = activeMappings.filter((mapping) => hasColumnForSide(mapping, side));
  if (sideMappings.length === 0) {
    throw new BadRequestException(`La plantilla no tiene mapeos activos para ${side}.`);
  }

  const rows = new Map<string, ConciliationPreviewRow>();

  for (const mapping of sideMappings) {
    const sheetName = resolveSheetName(workbook, side === "system" ? mapping.systemSheet : mapping.bankSheet);
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new BadRequestException(`La hoja ${sheetName} no existe en el Excel subido.`);
    }

    const column = normalizeColumn(side === "system" ? mapping.systemColumn : mapping.bankColumn);
    if (!column) {
      continue;
    }

    const startRow = side === "system" ? mapping.systemStartRow : mapping.bankStartRow;
    const configuredEndRow = side === "system" ? mapping.systemEndRow : mapping.bankEndRow;
    const lastRow = resolveWorksheetLastRow(worksheet);
    const firstRow = Math.max(1, startRow ?? 1);
    const finalRow = Math.max(firstRow, Math.min(configuredEndRow ?? lastRow, lastRow));
    const dataType = side === "system" ? mapping.systemDataType : mapping.bankDataType;

    for (let rowNumber = firstRow; rowNumber <= finalRow; rowNumber += 1) {
      const rowId = `${sheetName}:${rowNumber}`;
      const targetRow = rows.get(rowId) ?? {
        rowId,
        rowNumber,
        values: {},
        normalized: {}
      };

      const cell = resolveCellFromColumns(worksheet, column, rowNumber, dataType);
      targetRow.values[mapping.fieldKey] = stringifyCellValue(cell);
      targetRow.normalized[mapping.fieldKey] = normalizeByDataType(cell?.v ?? cell?.w ?? null, dataType);
      rows.set(rowId, targetRow);
    }
  }

  return [...rows.values()]
    .filter((row) => Object.values(row.values).some((value) => value !== null))
    .sort((left, right) => {
      if (left.rowNumber !== right.rowNumber) return left.rowNumber - right.rowNumber;
      return left.rowId.localeCompare(right.rowId);
    });
}

export function buildAutoMatches(
  layout: AutoMatchLayout,
  systemRows: ConciliationPreviewRow[],
  bankRows: ConciliationPreviewRow[]
): ConciliationPreviewMatch[] {
  const mappings = sortLayoutMappings(layout.mappings ?? []).filter(
    (item) => item.active && hasColumnForSide(item, "system") && hasColumnForSide(item, "bank")
  );
  const threshold = normalizeThreshold(layout.autoMatchThreshold);
  const candidates: Array<ConciliationPreviewMatch & { passedRules: number }> = [];

  for (const systemRow of systemRows) {
    for (const bankRow of bankRows) {
      const evaluation = evaluateMatch(mappings, systemRow, bankRow);
      if (!evaluation.requiredPassed) continue;
      if (evaluation.score < threshold) continue;

      candidates.push({
        systemRowId: systemRow.rowId,
        bankRowId: bankRow.rowId,
        systemRowNumber: systemRow.rowNumber,
        bankRowNumber: bankRow.rowNumber,
        score: evaluation.score,
        status: "auto",
        ruleResults: evaluation.ruleResults,
        passedRules: evaluation.passedRules
      });
    }
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (right.passedRules !== left.passedRules) return right.passedRules - left.passedRules;
    if (left.systemRowNumber !== right.systemRowNumber) {
      return left.systemRowNumber - right.systemRowNumber;
    }
    return left.bankRowNumber - right.bankRowNumber;
  });

  const matchedSystemIds = new Set<string>();
  const matchedBankIds = new Set<string>();
  const matches: ConciliationPreviewMatch[] = [];

  for (const candidate of candidates) {
    if (matchedSystemIds.has(candidate.systemRowId) || matchedBankIds.has(candidate.bankRowId)) {
      continue;
    }

    matchedSystemIds.add(candidate.systemRowId);
    matchedBankIds.add(candidate.bankRowId);
    matches.push({
      systemRowId: candidate.systemRowId,
      bankRowId: candidate.bankRowId,
      systemRowNumber: candidate.systemRowNumber,
      bankRowNumber: candidate.bankRowNumber,
      score: roundNumber(candidate.score),
      status: "auto",
      ruleResults: candidate.ruleResults
    });
  }

  return matches;
}

export function buildPreviewMetrics(
  totalSystemRows: number,
  totalBankRows: number,
  autoMatches: number,
  manualMatches: number
): PreviewMetrics {
  const pairedRows = autoMatches + manualMatches;
  const totalRows = totalSystemRows + totalBankRows;

  return {
    totalSystemRows,
    totalBankRows,
    autoMatches,
    manualMatches,
    unmatchedSystem: Math.max(totalSystemRows - pairedRows, 0),
    unmatchedBank: Math.max(totalBankRows - pairedRows, 0),
    matchPercentage: totalRows > 0 ? roundNumber(((pairedRows * 2) / totalRows) * 100) : 0
  };
}

export function sortPreviewRows(rows: ConciliationPreviewRow[]): ConciliationPreviewRow[] {
  return [...rows].sort((left, right) => {
    if (left.rowNumber !== right.rowNumber) return left.rowNumber - right.rowNumber;
    return left.rowId.localeCompare(right.rowId);
  });
}

function evaluateMatch(
  mappings: ReconciliationLayoutMapping[],
  systemRow: ConciliationPreviewRow,
  bankRow: ConciliationPreviewRow
): MatchEvaluation {
  let totalWeight = 0;
  let matchedWeight = 0;
  let requiredPassed = true;
  let passedRules = 0;

  const ruleResults = mappings.map((mapping) => {
    const systemValue = (systemRow.normalized[mapping.fieldKey] ?? null) as SupportedNormalizedValue;
    const bankValue = (bankRow.normalized[mapping.fieldKey] ?? null) as SupportedNormalizedValue;
    const shouldEvaluate = mapping.required || systemValue !== null || bankValue !== null;

    let passed = true;
    if (shouldEvaluate) {
      passed = compareValues(mapping.compareOperator as CompareOperator, systemValue, bankValue, {
        tolerance: mapping.tolerance ?? undefined
      });
      totalWeight += mapping.weight;
      if (passed) {
        matchedWeight += mapping.weight;
        passedRules += 1;
      }
    }

    if (mapping.required && !passed) {
      requiredPassed = false;
    }

    return {
      fieldKey: mapping.fieldKey,
      label: mapping.label,
      passed,
      compareOperator: mapping.compareOperator as CompareOperator,
      systemValue,
      bankValue
    };
  });

  return {
    score: totalWeight > 0 ? matchedWeight / totalWeight : 0,
    requiredPassed,
    ruleResults,
    passedRules
  };
}

function compareValues(
  operator: CompareOperator,
  systemValue: SupportedNormalizedValue,
  bankValue: SupportedNormalizedValue,
  options: { tolerance?: number }
): boolean {
  if (systemValue === null && bankValue === null) {
    return true;
  }
  if (systemValue === null || bankValue === null) {
    return false;
  }

  switch (operator) {
    case "contains": {
      const left = String(systemValue);
      const right = String(bankValue);
      return left.includes(right) || right.includes(left);
    }
    case "starts_with": {
      const left = String(systemValue);
      const right = String(bankValue);
      return left.startsWith(right) || right.startsWith(left);
    }
    case "ends_with": {
      const left = String(systemValue);
      const right = String(bankValue);
      return left.endsWith(right) || right.endsWith(left);
    }
    case "numeric_equals": {
      const left = toNumber(systemValue);
      const right = toNumber(bankValue);
      if (left === null || right === null) return false;
      return Math.abs(left - right) <= (options.tolerance ?? 0);
    }
    case "date_equals": {
      const left = toDateDayNumber(systemValue);
      const right = toDateDayNumber(bankValue);
      if (left === null || right === null) {
        return normalizeDateValue(systemValue) === normalizeDateValue(bankValue);
      }

      return Math.abs(left - right) <= Math.abs(options.tolerance ?? 0);
    }
    case "equals":
    default: {
      if (typeof systemValue === "number" || typeof bankValue === "number") {
        const left = toNumber(systemValue);
        const right = toNumber(bankValue);
        if (left !== null && right !== null) {
          return Math.abs(left - right) <= (options.tolerance ?? 0);
        }
      }

      return String(systemValue) === String(bankValue);
    }
  }
}

function resolveSheetName(workbook: XLSX.WorkBook, configuredSheet?: string | null): string {
  const candidate = configuredSheet?.trim();
  if (candidate) {
    if (!workbook.SheetNames.includes(candidate)) {
      if (workbook.SheetNames.length === 1) {
        return workbook.SheetNames[0];
      }

      throw new BadRequestException(
        `La hoja ${candidate} no existe en el archivo Excel. Hojas disponibles: ${workbook.SheetNames.join(", ")}.`
      );
    }

    return candidate;
  }

  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new BadRequestException("El Excel no contiene hojas.");
  }

  return firstSheet;
}

function resolveWorksheetLastRow(worksheet: XLSX.WorkSheet): number {
  const ref = worksheet["!ref"];
  if (!ref) return 1;
  const range = XLSX.utils.decode_range(ref);
  return Math.max(1, range.e.r + 1);
}

function stringifyCellValue(cell?: XLSX.CellObject): string | null {
  const rawValue = cell?.w ?? cell?.v ?? null;
  if (rawValue === null || rawValue === undefined) return null;
  if (rawValue instanceof Date) return rawValue.toISOString().slice(0, 10);

  const stringValue = String(rawValue).replace(/\s+/g, " ").trim();
  if (!stringValue || stringValue === "-") return null;
  return stringValue.length > 0 ? stringValue : null;
}

function resolveCellFromColumns(
  worksheet: XLSX.WorkSheet,
  columnExpression: string,
  rowNumber: number,
  dataType: string
): XLSX.CellObject | undefined {
  const columns = columnExpression.split("|").map((item) => item.trim()).filter(Boolean);
  let fallbackCell: XLSX.CellObject | undefined;
  let zeroAmountCell: XLSX.CellObject | undefined;

  for (const column of columns) {
    const cell = worksheet[`${column}${rowNumber}`];
    if (!fallbackCell && cell) {
      fallbackCell = cell;
    }

    const displayValue = stringifyCellValue(cell);
    if (displayValue !== null) {
      if (dataType === "amount" && columns.length > 1) {
        const amount = toNumber(cell?.v ?? cell?.w ?? displayValue);
        if (amount !== null && amount !== 0) {
          return cell;
        }

        zeroAmountCell = zeroAmountCell ?? cell;
        continue;
      }

      return cell;
    }
  }

  return zeroAmountCell ?? fallbackCell;
}

function normalizeByDataType(value: unknown, dataType: string): SupportedNormalizedValue {
  switch (dataType) {
    case "number":
    case "amount":
      return toNumber(value);
    case "date":
      return normalizeDateValue(value);
    case "text":
    default:
      return normalizeTextValue(value);
  }
}

function normalizeTextValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const text = String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

  return text.length > 0 ? text : null;
}

function normalizeDateValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{5}$/.test(raw)) {
    return normalizeDateValue(Number(raw));
  }

  const slashMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    let year = Number(slashMatch[3]);

    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }

    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const nativeDate = new Date(raw);
  if (!Number.isNaN(nativeDate.getTime())) {
    return nativeDate.toISOString().slice(0, 10);
  }

  return null;
}

function toDateDayNumber(value: unknown): number | null {
  const normalized = normalizeDateValue(value);
  if (!normalized) return null;

  const timestamp = Date.parse(`${normalized}T00:00:00Z`);
  if (Number.isNaN(timestamp)) return null;

  return Math.floor(timestamp / 86400000);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  if (!text || text === "-") return null;

  const cleaned = text
    .replace(/[A-Za-z$%]/g, "")
    .replace(/\s+/g, "")
    .replace(/[^\d,.\-+]/g, "");
  const normalized = normalizeNumericText(cleaned);

  if (!normalized || !/^[-+]?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNumericText(value: string): string | null {
  if (!value) return null;

  const sign = value.startsWith("-") ? "-" : value.startsWith("+") ? "+" : "";
  const unsigned = value.replace(/^[-+]/, "");
  const lastDot = unsigned.lastIndexOf(".");
  const lastComma = unsigned.lastIndexOf(",");

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    return `${sign}${unsigned
      .replace(new RegExp(`\\${thousandsSeparator}`, "g"), "")
      .replace(decimalSeparator, ".")}`;
  }

  if (lastComma >= 0) {
    const groups = unsigned.split(",");
    const isThousandsOnly = groups.length > 1 && groups.slice(1).every((group) => group.length === 3);
    return `${sign}${isThousandsOnly ? groups.join("") : unsigned.replace(",", ".")}`;
  }

  if (lastDot >= 0) {
    const groups = unsigned.split(".");
    const isThousandsOnly = groups.length > 1 && groups.slice(1).every((group) => group.length === 3);
    return `${sign}${isThousandsOnly ? groups.join("") : unsigned}`;
  }

  return `${sign}${unsigned}`;
}

function sortLayoutMappings(mappings: ReconciliationLayoutMapping[]): ReconciliationLayoutMapping[] {
  return [...mappings].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.id - right.id;
  });
}

function hasColumnForSide(mapping: ReconciliationLayoutMapping, side: WorkbookSide): boolean {
  return Boolean(normalizeColumn(side === "system" ? mapping.systemColumn : mapping.bankColumn));
}

function normalizeColumn(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value
    .split("|")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => item.length > 0)
    .join("|");

  return normalized.length > 0 ? normalized : null;
}

function normalizeThreshold(value?: number | null): number {
  if (value === null || value === undefined) return 1;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new BadRequestException("autoMatchThreshold debe estar entre 0 y 1.");
  }

  return value;
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}
