import { randomInt } from "node:crypto";

export const PUBLIC_ID_LENGTH = 10;
export const PUBLIC_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export function generatePublicId() {
  return Array.from(
    { length: PUBLIC_ID_LENGTH },
    () => PUBLIC_ID_ALPHABET[randomInt(PUBLIC_ID_ALPHABET.length)],
  ).join("");
}
