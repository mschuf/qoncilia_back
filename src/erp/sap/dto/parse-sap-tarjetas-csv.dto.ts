import { Type } from "class-transformer"
import { IsInt, Min } from "class-validator"

// El CSV llega como archivo multipart en el campo "file"; aca solo viaja el id de
// la configuracion ERP para validar pertenencia. El CSV no se persiste.
export class ParseSapTarjetasCsvDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyErpConfigId!: number
}
