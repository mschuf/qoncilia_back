import { BadRequestException, Injectable } from "@nestjs/common"
import * as http from "http"
import * as https from "https"
import { IncomingHttpHeaders } from "http"
import { URL } from "url"
import { CompanyErpConfig } from "../entities/company-erp-config.entity"

export type JsonRequestResponse = {
  statusCode: number
  headers: IncomingHttpHeaders
  bodyText: string
  bodyJson: Record<string, unknown> | null
}

export type SapLoginResult = {
  cookieHeader: string
  responsePayload: Record<string, unknown> | null
  httpStatus: number
  expiresAt: Date | null
}

export class ExternalRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly responsePayload?: Record<string, unknown> | null
  ) {
    super(message)
    this.name = "ExternalRequestError"
  }
}

@Injectable()
export class SapB1Service {
  async login(
    config: CompanyErpConfig,
    credentials: { username: string; password: string }
  ): Promise<SapLoginResult> {
    const response = await this.performJsonRequest(this.joinUrl(config.serviceLayerUrl, "Login"), {
      method: "POST",
      body: {
        CompanyDB: config.dbName,
        UserName: credentials.username,
        Password: credentials.password
      },
      headers: {
        Accept: "application/json"
      },
      tlsVersion: config.tlsVersion,
      allowSelfSigned: config.allowSelfSigned
    })

    const cookieHeader = this.buildCookieHeader(response.headers["set-cookie"])
    if (!cookieHeader) {
      throw new ExternalRequestError("SAP no devolvio una sesion valida al autenticar.")
    }

    return {
      cookieHeader,
      responsePayload: response.bodyJson,
      httpStatus: response.statusCode,
      expiresAt: this.extractSessionExpiresAt(response.bodyJson)
    }
  }

  async checkSession(config: CompanyErpConfig, cookieHeader: string): Promise<JsonRequestResponse> {
    const path = this.resolveSessionCheckPath(config)
    return this.performJsonRequest(this.joinUrl(config.serviceLayerUrl, path), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader
      },
      tlsVersion: config.tlsVersion,
      allowSelfSigned: config.allowSelfSigned
    })
  }

  async postDeposit(
    config: CompanyErpConfig,
    cookieHeader: string,
    payload: Record<string, unknown>
  ): Promise<JsonRequestResponse> {
    return this.performJsonRequest(this.joinUrl(config.serviceLayerUrl, "Deposits"), {
      method: "POST",
      body: payload,
      headers: {
        Accept: "application/json",
        Cookie: cookieHeader
      },
      tlsVersion: config.tlsVersion,
      allowSelfSigned: config.allowSelfSigned
    })
  }

  joinUrl(baseUrl: string | null, path: string): string {
    if (!baseUrl) {
      throw new BadRequestException("La configuracion ERP no tiene serviceLayerUrl.")
    }

    return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
  }

  private resolveSessionCheckPath(config: CompanyErpConfig): string {
    const configured = config.settings?.sapSessionCheckPath ?? config.settings?.sessionCheckPath
    return typeof configured === "string" && configured.trim()
      ? configured.trim()
      : "Deposits?$top=1"
  }

  private extractSessionExpiresAt(payload: Record<string, unknown> | null): Date | null {
    const timeoutValue = payload?.SessionTimeout
    const timeoutMinutes =
      typeof timeoutValue === "number"
        ? timeoutValue
        : typeof timeoutValue === "string"
          ? Number(timeoutValue)
          : 30

    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
      return null
    }

    const safetyWindowMs = 60_000
    return new Date(Date.now() + timeoutMinutes * 60_000 - safetyWindowMs)
  }

  private buildCookieHeader(setCookieHeader?: string[] | string): string {
    const entries = Array.isArray(setCookieHeader)
      ? setCookieHeader
      : typeof setCookieHeader === "string"
        ? [setCookieHeader]
        : []

    return entries
      .map((item) => item.split(";")[0]?.trim())
      .filter((item): item is string => Boolean(item))
      .join("; ")
  }

  private async performJsonRequest(
    targetUrl: string,
    options: {
      method: "POST" | "GET"
      body?: Record<string, unknown>
      headers?: Record<string, string>
      tlsVersion?: string | null
      allowSelfSigned?: boolean
    }
  ): Promise<JsonRequestResponse> {
    const url = new URL(targetUrl)
    const isHttps = url.protocol === "https:"
    const client = isHttps ? https : http
    const requestBody = options.body ? JSON.stringify(options.body) : null
    const tlsVersion = this.resolveTlsVersion(options.tlsVersion)

    return new Promise<JsonRequestResponse>((resolve, reject) => {
      const request = client.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port ? Number(url.port) : undefined,
          path: `${url.pathname}${url.search}`,
          method: options.method,
          headers: {
            "Content-Type": "application/json",
            ...(requestBody ? { "Content-Length": String(Buffer.byteLength(requestBody)) } : {}),
            ...options.headers
          },
          ...(isHttps
            ? {
                rejectUnauthorized: !(options.allowSelfSigned ?? false),
                ...(tlsVersion
                  ? {
                      minVersion: tlsVersion,
                      maxVersion: tlsVersion
                    }
                  : {})
              }
            : {})
        },
        (response) => {
          const chunks: Buffer[] = []
          response.on("data", (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
          })
          response.on("end", () => {
            const bodyText = Buffer.concat(chunks).toString("utf8")
            const bodyJson = this.tryParseJson(bodyText)
            const statusCode = response.statusCode ?? 0
            const result: JsonRequestResponse = {
              statusCode,
              headers: response.headers,
              bodyText,
              bodyJson
            }

            if (statusCode >= 200 && statusCode < 300) {
              resolve(result)
              return
            }

            const sapError = this.extractSapErrorMessage(bodyJson)
            reject(
              new ExternalRequestError(
                sapError || `SAP respondio con estado ${statusCode}.`,
                statusCode,
                bodyJson
              )
            )
          })
        }
      )

      request.setTimeout(15000, () => {
        request.destroy(new ExternalRequestError("Tiempo de espera agotado al conectar con SAP."))
      })

      request.on("error", (error) => {
        if (error instanceof ExternalRequestError) {
          reject(error)
          return
        }

        reject(new ExternalRequestError(error.message))
      })

      if (requestBody) {
        request.write(requestBody)
      }

      request.end()
    })
  }

  private tryParseJson(raw: string): Record<string, unknown> | null {
    if (!raw) return null

    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return { raw }
    }
  }

  private resolveTlsVersion(value?: string | null): "TLSv1" | "TLSv1.1" | "TLSv1.2" | "TLSv1.3" | undefined {
    switch (value) {
      case "1.0":
        return "TLSv1"
      case "1.1":
        return "TLSv1.1"
      case "1.2":
        return "TLSv1.2"
      case "1.3":
        return "TLSv1.3"
      default:
        return undefined
    }
  }

  private extractSapErrorMessage(payload: Record<string, unknown> | null): string | null {
    if (!payload) return null

    const directMessage = payload.message
    if (typeof directMessage === "string" && directMessage.trim()) {
      return directMessage.trim()
    }

    const errorNode = payload.error
    if (!errorNode || typeof errorNode !== "object") {
      return null
    }

    const errorMessageNode = (errorNode as Record<string, unknown>).message
    if (!errorMessageNode || typeof errorMessageNode !== "object") {
      return null
    }

    const valueNode = (errorMessageNode as Record<string, unknown>).value
    return typeof valueNode === "string" && valueNode.trim() ? valueNode.trim() : null
  }
}
