export type PresenceState = "in_chat" | "app" | "away";

export type PresenceSnapshot = {
  state: PresenceState;
  chatId: string | null;
  lastSeenAt: string | null;
};

export type PresenceLookup = Map<string, PresenceSnapshot>;
