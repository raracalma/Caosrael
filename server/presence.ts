import {
  type PresenceLookup,
  type PresenceSnapshot,
  type PresenceState,
} from "./presence-types.js";

type ConnectionPresence = {
  socketId: string;
  userId: string;
  state: PresenceState;
  chatId: string | null;
  updatedAt: number;
};

const statePriority: Record<PresenceState, number> = {
  away: 0,
  app: 1,
  in_chat: 2,
};

export class PresenceRegistry {
  private readonly connections = new Map<string, ConnectionPresence>();

  connect(socketId: string, userId: string, now = Date.now()) {
    this.connections.set(socketId, {
      socketId,
      userId,
      state: "app",
      chatId: null,
      updatedAt: now,
    });
  }

  report(
    socketId: string,
    state: PresenceState,
    chatId: string | null,
    now = Date.now(),
  ) {
    const connection = this.connections.get(socketId);
    if (!connection) return null;
    connection.state = state;
    connection.chatId = state === "in_chat" ? chatId : null;
    connection.updatedAt = now;
    return connection.userId;
  }

  disconnect(socketId: string) {
    const userId = this.connections.get(socketId)?.userId ?? null;
    this.connections.delete(socketId);
    return userId;
  }

  expireInactive(maxAgeMs: number, now = Date.now()) {
    const affected = new Set<string>();
    for (const connection of this.connections.values()) {
      if (
        connection.state !== "away" &&
        now - connection.updatedAt > maxAgeMs
      ) {
        connection.state = "away";
        connection.chatId = null;
        connection.updatedAt = now;
        affected.add(connection.userId);
      }
    }
    return [...affected];
  }

  get(userId: string): PresenceSnapshot {
    const candidates = [...this.connections.values()]
      .filter((connection) => connection.userId === userId)
      .sort(
        (left, right) =>
          statePriority[right.state] - statePriority[left.state] ||
          right.updatedAt - left.updatedAt,
      );
    const active = candidates[0];
    if (!active) {
      return { state: "away", chatId: null, lastSeenAt: null };
    }
    return {
      state: active.state,
      chatId: active.state === "in_chat" ? active.chatId : null,
      lastSeenAt:
        active.state === "away"
          ? new Date(active.updatedAt).toISOString()
          : null,
    };
  }

  toLookup(): PresenceLookup {
    const userIds = new Set(
      [...this.connections.values()].map((connection) => connection.userId),
    );
    return new Map([...userIds].map((userId) => [userId, this.get(userId)]));
  }
}
