import { NotFoundException } from "@nestjs/common";
import { Repository } from "typeorm";
import { ConciliationSystem } from "../entities/conciliation-system.entity";

export async function requireSystem(
  systemRepository: Repository<ConciliationSystem>,
  id: number
): Promise<ConciliationSystem> {
  const system = await systemRepository.findOne({
    where: { id }
  });

  if (!system) {
    throw new NotFoundException("Sistema no encontrado.");
  }

  return system;
}
