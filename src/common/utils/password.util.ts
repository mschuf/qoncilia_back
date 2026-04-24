import { BadRequestException } from "@nestjs/common";

export function ensureStrongPassword(password: string) {
  const normalized = password?.trim() ?? "";
  if (normalized.length < 6 || normalized.length > 128) {
    throw new BadRequestException("La contrasena debe tener entre 6 y 128 caracteres.");
  }
}

export function generateTemporaryPasswordFromOneToSix(length = 6): string {
  const digits = ["1", "2", "3", "4", "5", "6"];
  let result = "";

  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * digits.length);
    result += digits[randomIndex];
  }

  return result;
}
