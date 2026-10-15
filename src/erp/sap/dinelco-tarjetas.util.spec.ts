import * as XLSX from "xlsx"
import { parseDinelcoTarjetas } from "./dinelco-tarjetas.util"

describe("parser Dinelco", () => {
  it("compara por Fecha Venta y conserva la acreditacion para filtrar y depositar", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "Fecha Venta", "Fecha Acreditación", "Nombre Sucursal", "Cód. Sucursal",
        "Cód. de Autorización", "Tipo de Tarjeta", "Monto", "Monto Neto", "Estado", "Prestación"
      ],
      ["18/09/2026", "21/09/2026", "QUATTRO D", "04", "D99924", "Débito", 65000, 61757, "A", "COMPRAS POS"],
      ["20/09/2026", "Pendiente de Proceso", "QUATTRO D", "04", "D99925", "Débito", 20000, 0, "A", "TRANSFERENCIA SPI"]
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, "Dinelco")

    const parsed = parseDinelcoTarjetas(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }))

    expect(parsed.totalRows).toBe(2)
    expect(parsed.rows).toHaveLength(1)
    expect(parsed.rows[0]).toMatchObject({
      Referencia: "D99924",
      Fecha: "2026-09-18",
      "Fecha Venta": "2026-09-18",
      "Fecha Acreditación": "2026-09-21",
      Importe: 65000,
      Monto: 65000,
      "Monto Neto": 61757,
      "Prestación": "COMPRAS POS"
    })
  })

  it("conserva TRANSFERENCIA SPI sin los espacios de relleno del Excel", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "Fecha Venta", "Fecha Acreditación", "Nombre Sucursal", "Cód. Sucursal", "Cód. de Autorización",
        "Tipo de Tarjeta", "Monto", "Monto Neto", "Estado", "Presentación"
      ],
      ["17/09/2026", "18/09/2026", "FUEGO GUARANI", "01", "888517", "DEBITO", 351000, 347139, "A", "TRANSFERENCIA SPI   "]
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, "Dinelco")

    const parsed = parseDinelcoTarjetas(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }))

    expect(parsed.columns).toContain("Prestación")
    expect(parsed.rows[0]).toMatchObject({
      "Prestación": "TRANSFERENCIA SPI",
      "Fecha Acreditación": "2026-09-18",
      "Monto Neto": 347139
    })
  })

  it("incluye las dos ventas de debito y la venta de credito del lote FUEGO GUARANI", () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      [
        "Fecha Venta", "Fecha Acreditación", "Nombre Sucursal", "Cód. Sucursal",
        "Cód. de Autorización", "Tipo de Tarjeta", "Monto", "Monto Neto", "Estado", "Prestación"
      ],
      ["17/09/2026 12:18:44 pm", "18/09/2026", "FUEGO GUARANI", 1, "721012", "DEBITO", 60000, 58680, "A", "COMPRAS POS"],
      ["17/09/2026 12:17:50 pm", "18/09/2026", "FUEGO GUARANI", 1, "400726", "DEBITO", 75000, 73350, "A", "COMPRAS POS"],
      ["17/09/2026 11:42:39 am", "18/09/2026", "FUEGO GUARANI", 1, "222808", "CREDITO", 65000, 61614, "A", "COMPRAS POS"]
    ])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, "Dinelco")
    const parsed = parseDinelcoTarjetas(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }))

    expect(parsed.rows).toHaveLength(3)
    expect(parsed.rows.every((row) => row.Fecha === "2026-09-17" &&
      row["Fecha Acreditación"] === "2026-09-18")).toBe(true)
    expect(parsed.rows[2]).toMatchObject({ Referencia: "222808", "Tipo de tarjeta": "CREDITO", "Monto Neto": 61614 })
    expect(parsed.rows.reduce((sum, row) => sum + Number(row.Monto), 0)).toBe(200000)
    expect(parsed.rows.reduce((sum, row) => sum + Number(row["Monto Neto"]), 0)).toBe(193644)
  })
})
