export type User = {
  id: string;
  displayName: string;
  lastSeenAt: string | null;
  online: boolean;
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
  type: "direct" | "group";
  name: string;
  members: User[];
  lastMessage: Message | null;
  unreadCount: number;
  updatedAt: string;
};
