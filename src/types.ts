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
