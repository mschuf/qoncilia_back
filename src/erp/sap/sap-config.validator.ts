import { BadRequestException } from "@nestjs/common"
import { ErpType } from "../../common/enums/erp-type.enum"

interface SapConfigValidationTarget {
  dbName: string | null
  serviceLayerUrl: string | null
  tlsVersion: string | null
  dbPasswordEncrypted: string | null
}

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

// Codigo que activa el modo de conciliacion de tarjetas de credito (debe coincidir
// con el discriminador del frontend: code === "SAP_TARJETAS").
export const SAP_TARJETAS_CONFIG_CODE = "SAP_TARJETAS"

// Verifica que la configuracion seleccionada sea efectivamente de tarjetas. Evita
// que el flujo OCRH/CSV corra contra una configuracion SAP_B1 por error.
export function ensureSapTarjetasConfig(config: { code: string | null }) {
  if ((config.code ?? "").trim().toUpperCase() !== SAP_TARJETAS_CONFIG_CODE) {
    throw new BadRequestException(
      "Esta operacion requiere una configuracion ERP con codigo SAP_TARJETAS."
    )
  }
}

export function validateSapConfig(config: SapConfigValidationTarget, requirePassword: boolean) {
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
