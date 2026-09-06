import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import {
  aggregateDeliveryStatus,
  type ReceiptAwareChatType,
} from "./delivery-policy.js";

export const dataDirectory =
  process.env.DATA_DIR ??
  process.env.RAILWAY_VOLUME_MOUNT_PATH ??
  path.join(process.cwd(), "data");

try {
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.accessSync(dataDirectory, fs.constants.R_OK | fs.constants.W_OK);
} catch (error) {
  throw new Error(
    `O diretório SQLite "${dataDirectory}" não existe ou não permite leitura e escrita. Verifique DATA_DIR e o volume do Railway.`,
    { cause: error },
  );
}

export const db = new Database(path.join(dataDirectory, "caoschat.sqlite"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT
  );

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('direct', 'group')),
    name TEXT,
    direct_key TEXT UNIQUE,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_members (
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL,
    last_read_at TEXT,
    PRIMARY KEY (chat_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'sent'
      CHECK (delivery_status IN ('sent', 'delivered', 'read')),
    status_updated_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_chat_members_user
    ON chat_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_chat_created
    ON messages(chat_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_chats_updated
    ON chats(updated_at);

  -- Extensão futura: posts, comentários e reações podem referenciar users.id
  -- sem alterar o domínio de mensagens.
`);

type ColumnInfo = { name: string };
const messageColumns = db.pragma("table_info(messages)") as ColumnInfo[];

if (!messageColumns.some((column) => column.name === "delivery_status")) {
  db.exec(`
    ALTER TABLE messages
    ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'sent'
      CHECK (delivery_status IN ('sent', 'delivered', 'read'));
  `);
}

if (!messageColumns.some((column) => column.name === "status_updated_at")) {
  db.exec("ALTER TABLE messages ADD COLUMN status_updated_at TEXT;");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS message_receipts (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'sent'
      CHECK (status IN ('sent', 'delivered', 'read')),
    sent_at TEXT NOT NULL,
    delivered_at TEXT,
    read_at TEXT,
    PRIMARY KEY (message_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_message_receipts_user_status
    ON message_receipts(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_message_receipts_message
    ON message_receipts(message_id);
`);

function insertMessage(
  chatId: string,
  senderId: string,
  body: string,
  createdAt: string,
) {
  db.prepare(
    "INSERT INTO messages (id, chat_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), chatId, senderId, body, createdAt);
}

function seedDemoData() {
  if (process.env.DISABLE_DEMO_SEED === "true") return;

  const existingUsers = db
    .prepare("SELECT COUNT(*) AS count FROM users")
    .get() as { count: number };
  if (existingUsers.count > 0) return;

  const now = Date.now();
  const at = (minutesAgo: number) =>
    new Date(now - minutesAgo * 60_000).toISOString();
  const anaId = randomUUID();
  const brunoId = randomUUID();
  const claraId = randomUUID();
  const directId = randomUUID();
  const groupId = randomUUID();
  const passwordHash = bcrypt.hashSync("demo1234", 10);

  const seed = db.transaction(() => {
    const insertUser = db.prepare(
      `INSERT INTO users
        (id, display_name, password_hash, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`,
    );
    insertUser.run(anaId, "Ana Demo", passwordHash, at(1_440), at(4));
    insertUser.run(brunoId, "Bruno Demo", passwordHash, at(1_440), at(2));
    insertUser.run(claraId, "Clara Demo", passwordHash, at(1_440), at(48));

    const insertChat = db.prepare(
      `INSERT INTO chats
        (id, type, name, direct_key, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    insertChat.run(
      directId,
      "direct",
      null,
      [anaId, brunoId].sort().join(":"),
      anaId,
      at(180),
      at(3),
    );
    insertChat.run(
      groupId,
      "group",
      "Café sem pauta",
      null,
      claraId,
      at(1_000),
      at(35),
    );

    const insertMember = db.prepare(
      `INSERT INTO chat_members
        (chat_id, user_id, joined_at, last_read_at)
       VALUES (?, ?, ?, ?)`,
    );
    insertMember.run(directId, anaId, at(180), at(20));
    insertMember.run(directId, brunoId, at(180), at(2));
    insertMember.run(groupId, anaId, at(1_000), at(30));
    insertMember.run(groupId, brunoId, at(1_000), at(30));
    insertMember.run(groupId, claraId, at(1_000), at(30));

    insertMessage(
      directId,
      anaId,
      "Oi, Bruno! Já viu o novo CaosChat?",
      at(175),
    );
    insertMessage(
      directId,
      brunoId,
      "Vi sim — ficou com uma energia ótima 🌿",
      at(170),
    );
    insertMessage(
      directId,
      anaId,
      "Vamos testar as mensagens em tempo real?",
      at(12),
    );
    insertMessage(directId, brunoId, "Bora! Estou por aqui.", at(3));

    insertMessage(
      groupId,
      claraId,
      "Este é o nosso grupo de demonstração.",
      at(52),
    );
    insertMessage(
      groupId,
      brunoId,
      "Lugar oficial para ideias fora de hora ☕",
      at(35),
    );
  });

  seed();
}

function backfillMessageReceipts() {
  const backfill = db.transaction(() => {
    db.exec(`
      INSERT OR IGNORE INTO message_receipts
        (
          message_id,
          user_id,
          status,
          sent_at,
          delivered_at,
          read_at
        )
      SELECT
        m.id,
        cm.user_id,
        CASE
          WHEN cm.last_read_at IS NOT NULL
            AND m.created_at <= cm.last_read_at
          THEN 'read'
          ELSE 'sent'
        END,
        m.created_at,
        CASE
          WHEN cm.last_read_at IS NOT NULL
            AND m.created_at <= cm.last_read_at
          THEN cm.last_read_at
          ELSE NULL
        END,
        CASE
          WHEN cm.last_read_at IS NOT NULL
            AND m.created_at <= cm.last_read_at
          THEN cm.last_read_at
          ELSE NULL
        END
      FROM messages m
      JOIN chat_members cm ON cm.chat_id = m.chat_id
      WHERE cm.user_id != m.sender_id;
    `);

    const aggregates = db
      .prepare(
        `SELECT
           m.id,
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
         GROUP BY m.id`,
      )
      .all() as Array<{
      id: string;
      created_at: string;
      chat_type: ReceiptAwareChatType;
      total: number;
      delivered: number;
      read: number;
      status_updated_at: string;
    }>;

    const updateMessage = db.prepare(
      `UPDATE messages
       SET delivery_status = ?, status_updated_at = ?
       WHERE id = ?`,
    );
    for (const aggregate of aggregates) {
      const { status } = aggregateDeliveryStatus(aggregate.chat_type, {
        total: aggregate.total,
        delivered: aggregate.delivered,
        read: aggregate.read,
      });
      updateMessage.run(status, aggregate.status_updated_at, aggregate.id);
    }
  });

  backfill();
}

seedDemoData();
backfillMessageReceipts();
