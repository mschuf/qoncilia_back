import { BadRequestException } from "@nestjs/common";
import { CreateLayoutDto } from "../dto/create-layout.dto";
import { ReconciliationLayout } from "../entities/reconciliation-layout.entity";
import { ReconciliationLayoutMapping } from "../entities/reconciliation-layout-mapping.entity";
import { TemplateLayoutMapping } from "../entities/template-layout-mapping.entity";
import { User } from "../../users/entities/user.entity";

export function sortLayouts(layouts: ReconciliationLayout[]): ReconciliationLayout[] {
  return [...layouts].sort((left, right) => {
    const byActive = Number(right.active) - Number(left.active);
    if (byActive !== 0) return byActive;
    const byName = left.name.localeCompare(right.name);
    if (byName !== 0) return byName;
    return left.id - right.id;
  });
}

export function sortMappings(mappings: ReconciliationLayoutMapping[]): ReconciliationLayoutMapping[] {
  return [...mappings].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.id - right.id;
  });
}

export function sortTemplateMappings(mappings: TemplateLayoutMapping[]): TemplateLayoutMapping[] {
  return [...mappings].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.id - right.id;
  });
}

export function normalizeThreshold(value?: number | null): number {
  if (value === null || value === undefined) return 1;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new BadRequestException("autoMatchThreshold debe estar entre 0 y 1.");
  }

  return value;
}

export function normalizeColumn(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value
    .split("|")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => item.length > 0)
    .join("|");

  return normalized.length > 0 ? normalized : null;
}

export function normalizeOptional(value?: string | null): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeRequired(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException(`${field} es obligatorio.`);
  }

  return trimmed;
}

export function ensureMappings(mappings: CreateLayoutDto["mappings"]) {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    throw new BadRequestException("Debes enviar al menos un campo de plantilla.");
  }

  const fieldKeys = new Set<string>();
  for (const mapping of mappings) {
    const normalizedKey = normalizeRequired(mapping.fieldKey, "fieldKey");
    if (fieldKeys.has(normalizedKey)) {
      throw new BadRequestException(`El campo ${normalizedKey} esta repetido en la plantilla.`);
    }

    fieldKeys.add(normalizedKey);
  }
}

export function buildUserFullName(user: User): string | null {
  const parts = [user.usrNombre, user.usrApellido].filter(
    (value): value is string => Boolean(value && value.trim())
  );
  return parts.length > 0 ? parts.join(" ") : null;
}

export function toJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "object") {
    return { value };
  }

  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function formatTodayTag(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
