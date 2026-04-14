import { BadRequestException } from "@nestjs/common";

const STRONG_PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])(?!.*\s).{6,128}$/;

export function ensureStrongPassword(password: string) {
  const valid = STRONG_PASSWORD_REGEX.test(password);
  if (!valid) {
    throw new BadRequestException(
      "La contraseña debe tener mínimo 6 caracteres, mayúscula, minúscula, número y símbolo."
    );
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

