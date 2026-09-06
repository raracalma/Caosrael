import { describe, expect, it } from "vitest";
import {
  generatePublicId,
  PUBLIC_ID_ALPHABET,
  PUBLIC_ID_LENGTH,
} from "./public-id.js";

describe("identificador público permanente", () => {
  it("gera IDs base36 maiúsculos com espaço para bilhões de contas", () => {
    const ids = Array.from({ length: 2_000 }, generatePublicId);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => {
      expect(id).toHaveLength(PUBLIC_ID_LENGTH);
      expect([...id].every((character) => PUBLIC_ID_ALPHABET.includes(character)))
        .toBe(true);
    });
  });
});
