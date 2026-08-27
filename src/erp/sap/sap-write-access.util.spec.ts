import { ForbiddenException } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { AuthUser } from "../../common/interfaces/auth-user.interface"
import { ensureSapWriteAllowedForActor } from "./sap-write-access.util"

const actorFor = (companyCode: string) => ({ companyCode }) as AuthUser

describe("ensureSapWriteAllowedForActor", () => {
  it("permite empresas productivas que no pertenecen al bloqueo QA", () => {
    expect(() =>
      ensureSapWriteAllowedForActor(actorFor("5629621"), new ConfigService())
    ).not.toThrow()
  })

  it("bloquea una empresa QA cuando las variables no estan configuradas", () => {
    expect(() =>
      ensureSapWriteAllowedForActor(actorFor("5629621_QA"), new ConfigService())
    ).toThrow(ForbiddenException)
  })

  it("bloquea si falta la allowlist del ambiente", () => {
    const config = new ConfigService({
      NODE_ENV: "qa",
      FG_QA_SAP_WRITES_ENABLED: "true",
      FG_QA_SAP_WRITE_COMPANY_ALLOWLIST: "5629621_QA"
    })

    expect(() => ensureSapWriteAllowedForActor(actorFor("5629621_QA"), config)).toThrow(
      ForbiddenException
    )
  })

  it("permite solamente con bandera y ambas allowlists explicitas", () => {
    const config = new ConfigService({
      NODE_ENV: "qa",
      FG_QA_SAP_WRITES_ENABLED: "true",
      FG_QA_SAP_WRITE_COMPANY_ALLOWLIST: "5629621_QA",
      // Jest establece NODE_ENV=test y ConfigService prioriza process.env.
      FG_QA_SAP_WRITE_ENVIRONMENT_ALLOWLIST: "test"
    })

    expect(() =>
      ensureSapWriteAllowedForActor(actorFor("5629621_QA"), config)
    ).not.toThrow()
  })
})
