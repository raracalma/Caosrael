export type User = {
  id: string;
  displayName: string;
  lastSeenAt: string | null;
  online: boolean;
  presenceState: "in_chat" | "app" | "away";
  activeChatId: string | null;
  bio: string;
  avatarUrl: string | null;
  avatarMediaType: string | null;
  bannerUrl: string | null;
  bannerMediaType: string | null;
};

export type Message = {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
  deliveryStatus: "sent" | "delivered" | "read";
  statusUpdatedAt: string;
  receiptSummary: {
    total: number;
    delivered: number;
    read: number;
    required: number;
  };
};

export type ReceiptUpdate = {
  messageId: string;
  chatId: string;
  senderId: string;
  deliveryStatus: Message["deliveryStatus"];
  statusUpdatedAt: string;
  receiptSummary: Message["receiptSummary"];
};

export type Chat = {
  id: string;
  type: "direct" | "group" | "channel";
  name: string;
  createdBy: string;
  channelToken: string | null;
  members: User[];
  lastMessage: Message | null;
  unreadCount: number;
  updatedAt: string;
};

export type ChatFolder = {
  id: string;
  name: string;
  kind: "personal" | "groups" | "channels" | "custom";
  position: number;
  chatIds: string[];
};
