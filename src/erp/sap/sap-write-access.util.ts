import { ForbiddenException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { AuthUser } from "../../common/interfaces/auth-user.interface"

export const FG_QA_COMPANY_CODES = new Set(["5629621_QA", "FG_TARJETA_QA"])

const normalizeCompanyCode = (value: string) => value.trim().toUpperCase()

const isEnabled = (value: unknown): boolean =>
  ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase())

const parseCompanyAllowlist = (value: unknown): Set<string> =>
  new Set(
    String(value ?? "")
      .split(",")
      .map(normalizeCompanyCode)
      .filter(Boolean)
  )

/**
 * Las empresas QA conservan una copia exacta de la configuracion ERP de
 * produccion. Cualquier escritura SAP queda bloqueada por codigo de empresa,
 * incluso cuando se intenta usar una ruta ERP generica.
 */
export function ensureSapWriteAllowedForActor(
  actor: AuthUser,
  configService: ConfigService
): void {
  const companyCode = normalizeCompanyCode(actor.companyCode)
  if (!FG_QA_COMPANY_CODES.has(companyCode)) return

  const writesEnabled = isEnabled(configService.get("FG_QA_SAP_WRITES_ENABLED"))
  const allowedCompanies = parseCompanyAllowlist(
    configService.get("FG_QA_SAP_WRITE_COMPANY_ALLOWLIST")
  )
  const environment = normalizeCompanyCode(configService.get("NODE_ENV") ?? "development")
  const allowedEnvironments = parseCompanyAllowlist(
    configService.get("FG_QA_SAP_WRITE_ENVIRONMENT_ALLOWLIST")
  )

  if (
    writesEnabled &&
    allowedCompanies.has(companyCode) &&
    allowedEnvironments.has(environment)
  ) return

  throw new ForbiddenException(
    "Las escrituras SAP estan bloqueadas para esta empresa QA. Las consultas permanecen habilitadas."
  )
}
