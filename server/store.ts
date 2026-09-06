import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "./db.js";
import {
  aggregateDeliveryStatus,
  type DeliveryStatus,
  type ReceiptAwareChatType,
  type ReceiptProgress,
} from "./delivery-policy.js";

type UserRow = {
  id: string;
  display_name: string;
  password_hash: string;
  created_at: string;
  last_seen_at: string | null;
};

type ChatRow = {
  id: string;
  type: "direct" | "group";
  name: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
  delivery_status: DeliveryStatus;
  status_updated_at: string | null;
};

export type PublicUser = {
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
  deliveryStatus: DeliveryStatus;
  statusUpdatedAt: string;
  receiptSummary: ReceiptProgress;
};

export type ReceiptUpdate = {
  messageId: string;
  chatId: string;
  senderId: string;
  deliveryStatus: DeliveryStatus;
  statusUpdatedAt: string;
  receiptSummary: ReceiptProgress;
};

export type ChatSummary = {
  id: string;
  type: "direct" | "group";
  name: string;
  members: PublicUser[];
  lastMessage: Message | null;
  unreadCount: number;
  updatedAt: string;
};

function mapUser(row: UserRow, onlineIds = new Set<string>()): PublicUser {
  return {
    id: row.id,
    displayName: row.display_name,
    lastSeenAt: row.last_seen_at,
    online: onlineIds.has(row.id),
  };
}

function mapMessage(row: MessageRow): Message {
  const receipt = getReceiptUpdate(row.id);
  return {
    id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    body: row.body,
    createdAt: row.created_at,
    deliveryStatus: receipt?.deliveryStatus ?? row.delivery_status,
    statusUpdatedAt:
      receipt?.statusUpdatedAt ?? row.status_updated_at ?? row.created_at,
    receiptSummary: receipt?.receiptSummary ?? {
      total: 0,
      delivered: 0,
      read: 0,
      required: 1,
    },
  };
}

export function getReceiptUpdate(messageId: string): ReceiptUpdate | null {
  const aggregate = db
    .prepare(
      `SELECT
         m.id,
         m.chat_id,
         m.sender_id,
         m.delivery_status,
         m.created_at,
         c.type AS chat_type,
         COUNT(r.user_id) AS total,
         COALESCE(SUM(
           CASE WHEN r.status IN ('delivered', 'read') THEN 1 ELSE 0 END
         ), 0) AS delivered,
         COALESCE(SUM(
           CASE WHEN r.status = 'read' THEN 1 ELSE 0 END
         ), 0) AS read,
         COALESCE(
           MAX(COALESCE(r.read_at, r.delivered_at, r.sent_at)),
           m.created_at
         ) AS status_updated_at
       FROM messages m
       JOIN chats c ON c.id = m.chat_id
       LEFT JOIN message_receipts r ON r.message_id = m.id
       WHERE m.id = ?
       GROUP BY m.id`,
    )
    .get(messageId) as
    | {
        id: string;
        chat_id: string;
        sender_id: string;
        delivery_status: DeliveryStatus;
        created_at: string;
        chat_type: ReceiptAwareChatType;
        total: number;
        delivered: number;
        read: number;
        status_updated_at: string;
      }
    | undefined;

  if (!aggregate) return null;
  const { status, progress } = aggregateDeliveryStatus(aggregate.chat_type, {
    total: aggregate.total,
    delivered: aggregate.delivered,
    read: aggregate.read,
  });
  if (status !== aggregate.delivery_status) {
    db.prepare(
      `UPDATE messages
       SET delivery_status = ?, status_updated_at = ?
       WHERE id = ?`,
    ).run(status, aggregate.status_updated_at, aggregate.id);
  }

  return {
    messageId: aggregate.id,
    chatId: aggregate.chat_id,
    senderId: aggregate.sender_id,
    deliveryStatus: status,
    statusUpdatedAt: aggregate.status_updated_at,
    receiptSummary: progress,
  };
}

export function findUserById(id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | UserRow
    | undefined;
}

export function findUserByName(displayName: string) {
  return db
    .prepare("SELECT * FROM users WHERE display_name = ? COLLATE NOCASE")
    .get(displayName) as UserRow | undefined;
}

export function authenticate(displayName: string, password: string) {
  const user = findUserByName(displayName.trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return null;
  return mapUser(user);
}

export function createUser(displayName: string, password: string) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO users
      (id, display_name, password_hash, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, displayName.trim(), bcrypt.hashSync(password, 10), createdAt, createdAt);
  return mapUser(findUserById(id)!);
}

export function listUsers(currentUserId: string, onlineIds: Set<string>) {
  const rows = db
    .prepare(
      "SELECT * FROM users WHERE id != ? ORDER BY display_name COLLATE NOCASE",
    )
    .all(currentUserId) as UserRow[];
  return rows.map((row) => mapUser(row, onlineIds));
}

export function setLastSeen(userId: string, value = new Date().toISOString()) {
  db.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").run(value, userId);
}

export function isChatMember(chatId: string, userId: string) {
  return Boolean(
    db
      .prepare("SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?")
      .get(chatId, userId),
  );
}

export function getChatMemberIds(chatId: string) {
  const rows = db
    .prepare("SELECT user_id FROM chat_members WHERE chat_id = ?")
    .all(chatId) as Array<{ user_id: string }>;
  return rows.map((row) => row.user_id);
}

function getMembers(chatId: string, onlineIds: Set<string>) {
  const rows = db
    .prepare(
      `SELECT u.*
       FROM users u
       JOIN chat_members cm ON cm.user_id = u.id
       WHERE cm.chat_id = ?
       ORDER BY u.display_name COLLATE NOCASE`,
    )
    .all(chatId) as UserRow[];
  return rows.map((row) => mapUser(row, onlineIds));
}

function getLastMessage(chatId: string) {
  const row = db
    .prepare(
      `SELECT m.*, u.display_name AS sender_name
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id = ?
       ORDER BY m.created_at DESC
       LIMIT 1`,
    )
    .get(chatId) as MessageRow | undefined;
  return row ? mapMessage(row) : null;
}

function chatToSummary(
  chat: ChatRow,
  currentUserId: string,
  onlineIds: Set<string>,
): ChatSummary {
  const members = getMembers(chat.id, onlineIds);
  const otherMember = members.find((member) => member.id !== currentUserId);
  const unread = db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM messages m
       JOIN chat_members cm ON cm.chat_id = m.chat_id
       WHERE m.chat_id = ?
         AND cm.user_id = ?
         AND m.sender_id != ?
         AND m.created_at > COALESCE(cm.last_read_at, cm.joined_at)`,
    )
    .get(chat.id, currentUserId, currentUserId) as { count: number };

  return {
    id: chat.id,
    type: chat.type,
    name:
      chat.type === "group"
        ? chat.name ?? "Grupo sem nome"
        : otherMember?.displayName ?? "Conversa",
    members,
    lastMessage: getLastMessage(chat.id),
    unreadCount: unread.count,
    updatedAt: chat.updated_at,
  };
}

export function listChats(userId: string, onlineIds: Set<string>) {
  const rows = db
    .prepare(
      `SELECT c.*
       FROM chats c
       JOIN chat_members cm ON cm.chat_id = c.id
       WHERE cm.user_id = ?
       ORDER BY c.updated_at DESC`,
    )
    .all(userId) as ChatRow[];
  return rows.map((row) => chatToSummary(row, userId, onlineIds));
}

export function getChat(
  chatId: string,
  userId: string,
  onlineIds: Set<string>,
) {
  if (!isChatMember(chatId, userId)) return null;
  const row = db.prepare("SELECT * FROM chats WHERE id = ?").get(chatId) as
    | ChatRow
    | undefined;
  return row ? chatToSummary(row, userId, onlineIds) : null;
}

export function listMessages(chatId: string, userId: string) {
  if (!isChatMember(chatId, userId)) return null;
  const rows = db
    .prepare(
      `SELECT m.*, u.display_name AS sender_name
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.chat_id = ?
       ORDER BY m.created_at DESC
       LIMIT 200`,
    )
    .all(chatId) as MessageRow[];
  return rows.reverse().map(mapMessage);
}

export function createDirectChat(
  currentUserId: string,
  otherUserId: string,
  onlineIds: Set<string>,
) {
  if (currentUserId === otherUserId || !findUserById(otherUserId)) return null;
  const directKey = [currentUserId, otherUserId].sort().join(":");
  const existing = db
    .prepare("SELECT * FROM chats WHERE direct_key = ?")
    .get(directKey) as ChatRow | undefined;

  if (existing) return chatToSummary(existing, currentUserId, onlineIds);

  const id = randomUUID();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO chats
        (id, type, name, direct_key, created_by, created_at, updated_at)
       VALUES (?, 'direct', NULL, ?, ?, ?, ?)`,
    ).run(id, directKey, currentUserId, now, now);
    const insertMember = db.prepare(
      `INSERT INTO chat_members
        (chat_id, user_id, joined_at, last_read_at)
       VALUES (?, ?, ?, ?)`,
    );
    insertMember.run(id, currentUserId, now, now);
    insertMember.run(id, otherUserId, now, now);
  })();
  return getChat(id, currentUserId, onlineIds);
}

export function createGroupChat(
  currentUserId: string,
  name: string,
  requestedMemberIds: string[],
  onlineIds: Set<string>,
) {
  const memberIds = [
    ...new Set([
      currentUserId,
      ...requestedMemberIds.filter((id) => Boolean(findUserById(id))),
    ]),
  ];
  if (memberIds.length < 2) return null;

  const id = randomUUID();
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO chats
        (id, type, name, direct_key, created_by, created_at, updated_at)
       VALUES (?, 'group', ?, NULL, ?, ?, ?)`,
    ).run(id, name.trim(), currentUserId, now, now);
    const insertMember = db.prepare(
      `INSERT INTO chat_members
        (chat_id, user_id, joined_at, last_read_at)
       VALUES (?, ?, ?, ?)`,
    );
    memberIds.forEach((memberId) =>
      insertMember.run(id, memberId, now, now),
    );
  })();
  return getChat(id, currentUserId, onlineIds);
}

export function createMessage(chatId: string, senderId: string, body: string) {
  if (!isChatMember(chatId, senderId)) return null;
  const message = {
    id: randomUUID(),
    chatId,
    senderId,
    senderName: findUserById(senderId)!.display_name,
    body: body.trim(),
    createdAt: new Date().toISOString(),
  };
  db.transaction(() => {
    db.prepare(
      `INSERT INTO messages
        (
          id,
          chat_id,
          sender_id,
          body,
          created_at,
          delivery_status,
          status_updated_at
        )
       VALUES (?, ?, ?, ?, ?, 'sent', ?)`,
    ).run(
      message.id,
      message.chatId,
      message.senderId,
      message.body,
      message.createdAt,
      message.createdAt,
    );
    db.prepare(
      `INSERT INTO message_receipts
        (message_id, user_id, status, sent_at)
       SELECT ?, user_id, 'sent', ?
       FROM chat_members
       WHERE chat_id = ? AND user_id != ?`,
    ).run(message.id, message.createdAt, chatId, senderId);
    db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?").run(
      message.createdAt,
      chatId,
    );
    db.prepare(
      `UPDATE chat_members
       SET last_read_at = ?
       WHERE chat_id = ? AND user_id = ?`,
    ).run(message.createdAt, chatId, senderId);
  })();
  const row = db
    .prepare(
      `SELECT m.*, u.display_name AS sender_name
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.id = ?`,
    )
    .get(message.id) as MessageRow;
  return mapMessage(row);
}

export function markMessageDelivered(messageId: string, userId: string) {
  const receipt = db
    .prepare(
      `SELECT status
       FROM message_receipts
       WHERE message_id = ? AND user_id = ?`,
    )
    .get(messageId, userId) as { status: DeliveryStatus } | undefined;
  if (!receipt) return null;

  if (receipt.status === "sent") {
    const deliveredAt = new Date().toISOString();
    db.prepare(
      `UPDATE message_receipts
       SET status = 'delivered', delivered_at = ?
       WHERE message_id = ? AND user_id = ? AND status = 'sent'`,
    ).run(deliveredAt, messageId, userId);
  }
  return getReceiptUpdate(messageId);
}

function markReceiptRowsDelivered(messageIds: string[], userId: string) {
  if (!messageIds.length) return [];
  const deliveredAt = new Date().toISOString();
  const update = db.prepare(
    `UPDATE message_receipts
     SET status = 'delivered', delivered_at = ?
     WHERE message_id = ? AND user_id = ? AND status = 'sent'`,
  );
  db.transaction(() => {
    messageIds.forEach((messageId) =>
      update.run(deliveredAt, messageId, userId),
    );
  })();
  return messageIds
    .map(getReceiptUpdate)
    .filter((receipt): receipt is ReceiptUpdate => receipt !== null);
}

export function markPendingMessagesDelivered(userId: string) {
  const rows = db
    .prepare(
      `SELECT message_id
       FROM message_receipts
       WHERE user_id = ? AND status = 'sent'`,
    )
    .all(userId) as Array<{ message_id: string }>;
  return markReceiptRowsDelivered(
    rows.map((row) => row.message_id),
    userId,
  );
}

export function markChatDelivered(chatId: string, userId: string) {
  if (!isChatMember(chatId, userId)) return null;
  const rows = db
    .prepare(
      `SELECT r.message_id
       FROM message_receipts r
       JOIN messages m ON m.id = r.message_id
       WHERE m.chat_id = ? AND r.user_id = ? AND r.status = 'sent'`,
    )
    .all(chatId, userId) as Array<{ message_id: string }>;
  return markReceiptRowsDelivered(
    rows.map((row) => row.message_id),
    userId,
  );
}

export function markChatRead(chatId: string, userId: string) {
  if (!isChatMember(chatId, userId)) return null;
  const rows = db
    .prepare(
      `SELECT r.message_id
       FROM message_receipts r
       JOIN messages m ON m.id = r.message_id
       WHERE m.chat_id = ? AND r.user_id = ? AND r.status != 'read'`,
    )
    .all(chatId, userId) as Array<{ message_id: string }>;
  const readAt = new Date().toISOString();
  const updateReceipt = db.prepare(
    `UPDATE message_receipts
     SET
       status = 'read',
       delivered_at = COALESCE(delivered_at, ?),
       read_at = ?
     WHERE message_id = ? AND user_id = ?`,
  );
  db.transaction(() => {
    db.prepare(
      `UPDATE chat_members
       SET last_read_at = ?
       WHERE chat_id = ? AND user_id = ?`,
    ).run(readAt, chatId, userId);
    rows.forEach(({ message_id: messageId }) =>
      updateReceipt.run(readAt, readAt, messageId, userId),
    );
  })();
  return rows
    .map(({ message_id: messageId }) => getReceiptUpdate(messageId))
    .filter((receipt): receipt is ReceiptUpdate => receipt !== null);
}
