import { ConflictException } from "@nestjs/common";
import { QueryFailedError } from "typeorm";

export function handleConciliationDatabaseError(error: unknown): never {
  if (error instanceof QueryFailedError) {
    const driverError = (error as QueryFailedError & {
      driverError?: { code?: string; detail?: string; constraint?: string };
    }).driverError;

    if (driverError?.code === "23505") {
      const detail = String(driverError.detail ?? "").toLowerCase();
      const constraint = String(driverError.constraint ?? "").toLowerCase();

      if (detail.includes("banco_") || constraint.includes("bancos")) {
        throw new ConflictException("Ya existe una asignacion de banco con esos datos.");
      }

      if (detail.includes("mapeo_clave_campo") || constraint.includes("plantillas_conciliacion_mapeos")) {
        throw new ConflictException("La plantilla no puede repetir fieldKey.");
      }

      if (detail.includes("mapeo_base_clave_campo") || constraint.includes("plantillas_base_mapeos")) {
        throw new ConflictException("La plantilla base no puede repetir fieldKey.");
      }

      if (constraint.includes("uq_plantillas_base_nombre")) {
        throw new ConflictException("Ya existe una plantilla base con ese nombre.");
      }

      if (constraint.includes("uq_sistemas_nombre")) {
        throw new ConflictException("Ya existe un sistema con ese nombre.");
      }

      if (constraint.includes("uq_plantillas_conciliacion_activa")) {
        throw new ConflictException("Solo puede haber una plantilla activa por banco.");
      }

      throw new ConflictException("Ya existe un registro con esos datos unicos.");
    }
  }

  throw error;
}
