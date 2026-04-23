import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto"

const ENCRYPTION_PREFIX = "enc_v1"
const IV_LENGTH = 12

function buildKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest()
}

export function encryptText(value: string, secret: string): string {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv("aes-256-gcm", buildKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    ENCRYPTION_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64")
  ].join(":")
}

export function decryptText(payload: string, secret: string): string {
  const [prefix, ivEncoded, authTagEncoded, encryptedEncoded] = payload.split(":")
  if (prefix !== ENCRYPTION_PREFIX || !ivEncoded || !authTagEncoded || !encryptedEncoded) {
    throw new Error("Formato de credencial cifrada invalido.")
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    buildKey(secret),
    Buffer.from(ivEncoded, "base64")
  )
  decipher.setAuthTag(Buffer.from(authTagEncoded, "base64"))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, "base64")),
    decipher.final()
  ])

  return decrypted.toString("utf8")
}
