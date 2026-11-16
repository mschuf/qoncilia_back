import * as XLSX from "xlsx"
import { parseOchoAUenoTarjetas } from "./ocho-a-ueno-tarjetas.util"

const HEADER = [
  "Nombre de comercio", "Código de comercio", "Fecha de venta", "Hora de venta", "Boleta N°",
  "Código de autorización", "Monto bruto", "Monto neto", "Comisión", "IVA Comisión", "Retención",
  "IVA Retención", "Marca", "Tipo de tarjeta", "Número de tarjeta", "Fecha de Acreditación",
  "Estado de pago", "Nro. de referencia de la Factura", "Nro. de comprobante de pago",
  "Código de cadena", "Trx ID", "Canal", "Fuente de modo de entrada"
]

const sale = (overrides: Record<number, unknown>) => {
  const row: unknown[] = [
    "OCHO A SA", "900000000006092", "13-03-2026", "00:00:00", "607221534275", "431508",
    242000, 234186, 2904, 290, 2420, 2200, "MASTERCARD", "Crédito Local", "518772******3593",
    "2026-03-16T00:00:00", "Aprobado", "71622416072072215342758", "5253602", "8Q7", "", "", ""
  ]
  for (const [index, value] of Object.entries(overrides)) row[Number(index)] = value
  return row
}

function buildWorkbook(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([HEADER, ...rows]), "Transacciones")
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
}

describe("parser UENO de OCHO_A", () => {
  it("usa Codigo de autorizacion, Fecha de venta y Monto bruto como alias de matching", () => {
    const parsed = parseOchoAUenoTarjetas(buildWorkbook([sale({})]))

    expect(parsed.totalRows).toBe(1)
    expect(parsed.rows[0]).toMatchObject({
      Referencia: "431508",
      Fecha: "2026-03-13",
      Importe: 242000,
      "Fecha de venta": "2026-03-13",
      "Fecha de Acreditación": "2026-03-16",
      "Nro. de comprobante de pago": "5253602",
      "Tipo de tarjeta": "Crédito Local",
      "Monto bruto": 242000,
      "Monto neto": 234186,
      "Comisión total": 7814
    })
  })

  it("trata el Tipo de tarjeta vacio como QR", () => {
    const parsed = parseOchoAUenoTarjetas(buildWorkbook([
      sale({ 5: "126031300006032", 6: 30000, 7: 29043, 12: "QR", 13: "", 18: "5252364" })
    ]))

    expect(parsed.rows[0]).toMatchObject({
      "Tipo de tarjeta": "QR",
      "Comisión total": 957,
      "Nro. de comprobante de pago": "5252364"
    })
  })

  it("omite ventas no aprobadas o todavia no liquidadas", () => {
    const parsed = parseOchoAUenoTarjetas(buildWorkbook([
      sale({}),
      sale({ 16: "Rechazado" }),
      sale({ 15: "", 18: "" })
    ]))

    expect(parsed.totalRows).toBe(3)
    expect(parsed.rows).toHaveLength(1)
  })

  it("rechaza una venta aprobada con Monto neto mayor al bruto", () => {
    expect(() => parseOchoAUenoTarjetas(buildWorkbook([sale({ 7: 300000 })]))).toThrow(
      "Fila 2 de UENO"
    )
  })

  it("acepta fechas seriales de Excel", () => {
    const serial = (iso: string) => (Date.parse(`${iso}T00:00:00Z`) / 86400000) + 25569
    const parsed = parseOchoAUenoTarjetas(buildWorkbook([
      sale({ 2: serial("2026-03-13"), 15: serial("2026-03-16") })
    ]))

    expect(parsed.rows[0]).toMatchObject({
      Fecha: "2026-03-13",
      "Fecha de Acreditación": "2026-03-16"
    })
  })

  it("rechaza archivos que no son Excel", () => {
    expect(() => parseOchoAUenoTarjetas(Buffer.from("a;b;c"))).toThrow("debe ser .xls o .xlsx")
  })
})
