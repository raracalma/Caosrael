import { describe, expect, it } from "vitest";
import { PresenceRegistry } from "./presence.js";

describe("presença por conexão", () => {
  it("prioriza conversa ativa e expira heartbeat antigo", () => {
    const registry = new PresenceRegistry();
    registry.connect("celular", "gael", 1_000);
    registry.connect("desktop", "gael", 1_000);
    registry.report("celular", "in_chat", "chat-1", 2_000);
    registry.report("desktop", "app", null, 2_000);

    expect(registry.get("gael")).toMatchObject({
      state: "in_chat",
      chatId: "chat-1",
    });

    registry.expireInactive(40_000, 43_000);
    expect(registry.get("gael")).toMatchObject({
      state: "away",
      chatId: null,
    });
  });
});
