import { PublicCompany } from "../../access-control/interfaces/access-control.interfaces"
import { ErpType } from "../../common/enums/erp-type.enum"

export interface ErpReferenceResponse {
  companies: PublicCompany[]
  erpTypes: Array<{
    code: ErpType
    label: string
  }>
  tlsVersions: string[]
}

export interface PublicCompanyErpConfig {
  id: number
  companyId: number
  companyCode: string
  companyName: string
  code: string
  name: string
  erpType: ErpType
  active: boolean
  isDefault: boolean
  userSystem: string | null
  dbName: string | null
  cmpName: string | null
  serverNode: string | null
  dbUser: string | null
  serviceLayerUrl: string | null
  tlsVersion: string | null
  allowSelfSigned: boolean
  settings: Record<string, unknown> | null
  hasUserPass: boolean
  hasPassword: boolean
  createdAt: Date
  updatedAt: Date
}
