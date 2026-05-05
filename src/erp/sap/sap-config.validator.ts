import { BadRequestException } from "@nestjs/common"
import { ErpType } from "../../common/enums/erp-type.enum"
import { CompanyErpConfig } from "../entities/company-erp-config.entity"

function normalizeOptional(value?: string | null): string | null {
  if (value === undefined || value === null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function ensureSapErpType(erpType: ErpType) {
  if (erpType !== ErpType.SAP_B1) {
    throw new BadRequestException("Por ahora solo esta soportado SAP Business One.")
  }
}

export function validateSapConfig(config: CompanyErpConfig, requirePassword: boolean) {
  const requiredFields: Array<[string | null, string]> = [
    [config.dbName, "dbName"],
    [config.serviceLayerUrl, "serviceLayerUrl"],
    [config.tlsVersion, "tlsVersion"]
  ]

  for (const [value, label] of requiredFields) {
    if (!normalizeOptional(value)) {
      throw new BadRequestException(`El campo ${label} es obligatorio para SAP B1.`)
    }
  }

  if (requirePassword && !config.dbPasswordEncrypted) {
    throw new BadRequestException("Debes cargar la password para SAP B1.")
  }
}
