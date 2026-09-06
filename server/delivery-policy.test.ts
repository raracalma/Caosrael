import { describe, expect, it } from "vitest";
import {
  aggregateDeliveryStatus,
  requiredReceiptCount,
} from "./delivery-policy.js";

describe("política de recibos", () => {
  it("exige uma pessoa no chat direto", () => {
    expect(requiredReceiptCount("direct", 1)).toBe(1);
  });

  it("exige maioria estrita nos grupos", () => {
    expect(requiredReceiptCount("group", 2)).toBe(2);
    expect(requiredReceiptCount("group", 3)).toBe(2);
    expect(
      aggregateDeliveryStatus("group", {
        total: 3,
        delivered: 2,
        read: 1,
      }).status,
    ).toBe("delivered");
  });

  it("deixa canais preparados para exigir todos os inscritos", () => {
    expect(requiredReceiptCount("channel", 20)).toBe(20);
    expect(
      aggregateDeliveryStatus("channel", {
        total: 20,
        delivered: 19,
        read: 0,
      }).status,
    ).toBe("sent");
  });
});
