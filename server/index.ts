import path from "node:path";
import http from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import multer from "multer";
import { Server } from "socket.io";
import { z } from "zod";
import { dataDirectory } from "./db.js";
import { PresenceRegistry } from "./presence.js";
import { type PresenceState } from "./presence-types.js";
import { parsePort, resolveSessionSecret } from "./runtime.js";
import { SQLiteSessionStore } from "./session-store.js";
import {
  addChannelMembers,
  authenticate,
  canPostToChat,
  createChannelChat,
  createDirectChat,
  createFolder,
  createGroupChat,
  createMessage,
  createUser,
  findUserById,
  getChat,
  getChatMemberIds,
  getContactUserIds,
  getPublicUser,
  isChatMember,
  joinChannel,
  listChats,
  listFolders,
  listMessages,
  listUsers,
  markChatDelivered,
  markChatRead,
  markMessageDelivered,
  markPendingMessagesDelivered,
  setLastSeen,
  deleteFolder,
  updateFolder,
  updateProfile,
  updateProfileMedia,
  type ReceiptUpdate,
} from "./store.js";
import {
  InvalidMediaError,
  persistMedia,
  removeStoredMedia,
  uploadsDirectory,
} from "./uploads.js";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

const isProduction = process.env.NODE_ENV === "production";
const port = parsePort(process.env.PORT);
const host = process.env.HOST?.trim() || "0.0.0.0";
const sessionSecret = resolveSessionSecret({
  dataDirectory,
  isProduction,
  providedSecret: process.env.SESSION_SECRET,
});
const secureCookies =
  process.env.COOKIE_SECURE === undefined
    ? isProduction
    : process.env.COOKIE_SECURE === "true";

const app = express();
const server = http.createServer(app);
const io = new Server(server);

if (isProduction) {
  app.set("trust proxy", 1);
}

const sessionMiddleware = session({
  store: new SQLiteSessionStore(),
  secret: sessionSecret ?? "caoschat-dev-only",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies,
    maxAge: 30 * 24 * 60 * 60 * 1_000,
  },
});

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(
  "/uploads",
  express.static(uploadsDirectory, {
    immutable: true,
    maxAge: "30d",
    setHeaders(response) {
      response.setHeader("X-Content-Type-Options", "nosniff");
    },
  }),
);
app.use(sessionMiddleware);

const presenceRegistry = new PresenceRegistry();
const presenceLookup = () => presenceRegistry.toLookup();
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: 2,
    fileSize: 12 * 1024 * 1024,
  },
});

type AuthedRequest = Request & {
  session: session.Session & Partial<session.SessionData>;
};

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId || !findUserById(req.session.userId)) {
    res.status(401).json({ error: "Faça login para continuar." });
    return;
  }
  next();
}

function currentUserId(req: Request) {
  return (req as AuthedRequest).session.userId!;
}

function routeParam(req: Request, name: string) {
  const value = req.params[name];
  return Array.isArray(value) ? (value[0] ?? "") : value;
}

function emitChatRefresh(memberIds: string[]) {
  memberIds.forEach((memberId) => {
    io.to(`user:${memberId}`).emit("chats:refresh");
  });
}

function emitReceiptUpdates(updates: ReceiptUpdate[]) {
  updates.forEach((update) => {
    io.to(`user:${update.senderId}`).emit("receipt:updated", update);
  });
}

function emitPresence(userId: string) {
  const snapshot = presenceRegistry.get(userId);
  const recipientIds = new Set([userId, ...getContactUserIds(userId)]);
  recipientIds.forEach((recipientId) => {
    io.to(`user:${recipientId}`).emit("presence:changed", {
      userId,
      ...snapshot,
    });
  });
}

function emitProfileUpdate(userId: string) {
  const user = getPublicUser(userId, presenceLookup());
  if (!user) return;
  const recipientIds = new Set([userId, ...getContactUserIds(userId)]);
  recipientIds.forEach((recipientId) => {
    io.to(`user:${recipientId}`).emit("profile:updated", user);
  });
  emitChatRefresh([...recipientIds]);
}

const credentialsSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, "Informe um nome com pelo menos 2 caracteres.")
    .max(40, "Use um nome com até 40 caracteres."),
  password: z
    .string()
    .min(6, "A senha deve ter pelo menos 6 caracteres.")
    .max(100, "A senha é muito longa."),
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "caoschat" });
});

app.post("/api/auth/register", (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message });
    return;
  }
  try {
    const user = createUser(parsed.data.displayName, parsed.data.password);
    req.session.userId = user.id;
    res.status(201).json({ user });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      res.status(409).json({ error: "Este nome já está em uso." });
      return;
    }
    throw error;
  }
});

app.post("/api/auth/login", (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Confira o nome e a senha." });
    return;
  }
  const user = authenticate(parsed.data.displayName, parsed.data.password);
  if (!user) {
    res.status(401).json({ error: "Nome ou senha incorretos." });
    return;
  }
  req.session.userId = user.id;
  res.json({ user });
});

app.post("/api/auth/logout", requireAuth, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) {
      next(error);
      return;
    }
    res.clearCookie("connect.sid");
    res.status(204).end();
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: getPublicUser(currentUserId(req), presenceLookup()) });
});

app.get("/api/users", requireAuth, (req, res) => {
  res.json({ users: listUsers(currentUserId(req), presenceLookup()) });
});

app.get("/api/chats", requireAuth, (req, res) => {
  res.json({ chats: listChats(currentUserId(req), presenceLookup()) });
});

app.get("/api/folders", requireAuth, (req, res) => {
  res.json({ folders: listFolders(currentUserId(req)) });
});

const folderSchema = z.object({
  name: z.string().trim().min(1).max(24),
  chatIds: z.array(z.string().uuid()).max(200).default([]),
});

app.post("/api/folders", requireAuth, (req, res) => {
  const parsed = folderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Use um nome de até 24 caracteres." });
    return;
  }
  try {
    const folder = createFolder(
      currentUserId(req),
      parsed.data.name,
      parsed.data.chatIds,
    );
    if (!folder) {
      res.status(409).json({ error: "Você já chegou ao limite de 10 pastas." });
      return;
    }
    res.status(201).json({ folder });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      res.status(409).json({ error: "Já existe uma pasta com este nome." });
      return;
    }
    throw error;
  }
});

app.patch("/api/folders/:folderId", requireAuth, (req, res) => {
  const parsed = folderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Confira o nome e as conversas da pasta." });
    return;
  }
  try {
    const folder = updateFolder(
      routeParam(req, "folderId"),
      currentUserId(req),
      parsed.data.name,
      parsed.data.chatIds,
    );
    if (!folder) {
      res.status(404).json({ error: "Esta pasta padrão não pode ser editada." });
      return;
    }
    res.json({ folder });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      res.status(409).json({ error: "Já existe uma pasta com este nome." });
      return;
    }
    throw error;
  }
});

app.delete("/api/folders/:folderId", requireAuth, (req, res) => {
  if (!deleteFolder(routeParam(req, "folderId"), currentUserId(req))) {
    res.status(404).json({ error: "Esta pasta padrão não pode ser removida." });
    return;
  }
  res.status(204).end();
});

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  bio: z.string().trim().max(300),
});

app.get("/api/users/:userId/profile", requireAuth, (req, res) => {
  const user = getPublicUser(routeParam(req, "userId"), presenceLookup());
  if (!user) {
    res.status(404).json({ error: "Perfil não encontrado." });
    return;
  }
  res.json({ user });
});

app.patch("/api/profile", requireAuth, (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Use um nome de 2 a 40 caracteres e uma bio de até 300.",
    });
    return;
  }
  try {
    updateProfile(
      currentUserId(req),
      parsed.data.displayName,
      parsed.data.bio,
    );
    emitProfileUpdate(currentUserId(req));
    res.json({
      user: getPublicUser(currentUserId(req), presenceLookup()),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed")
    ) {
      res.status(409).json({ error: "Este nome já está em uso." });
      return;
    }
    throw error;
  }
});

app.post(
  "/api/profile/media",
  requireAuth,
  mediaUpload.fields([
    { name: "avatar", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  async (req, res, next) => {
    const files = req.files as
      | {
          avatar?: Express.Multer.File[];
          banner?: Express.Multer.File[];
        }
      | undefined;
    const avatarFile = files?.avatar?.[0];
    const bannerFile = files?.banner?.[0];
    if (!avatarFile && !bannerFile) {
      res.status(400).json({ error: "Escolha uma foto, GIF, vídeo ou banner." });
      return;
    }

    const userId = currentUserId(req);
    const oldUser = findUserById(userId)!;
    let avatar: Awaited<ReturnType<typeof persistMedia>> | undefined;
    let banner: Awaited<ReturnType<typeof persistMedia>> | undefined;
    try {
      if (avatarFile) avatar = await persistMedia(avatarFile, "avatar");
      if (bannerFile) banner = await persistMedia(bannerFile, "banner");
      updateProfileMedia(userId, {
        ...(avatar && {
          avatarPath: avatar.url,
          avatarMediaType: avatar.mediaType,
        }),
        ...(banner && {
          bannerPath: banner.url,
          bannerMediaType: banner.mediaType,
        }),
      });
      await Promise.all([
        avatar ? removeStoredMedia(oldUser.avatar_path) : undefined,
        banner ? removeStoredMedia(oldUser.banner_path) : undefined,
      ]);
      emitProfileUpdate(userId);
      res.json({ user: getPublicUser(userId, presenceLookup()) });
    } catch (error) {
      await Promise.all([
        avatar ? removeStoredMedia(avatar.url) : undefined,
        banner ? removeStoredMedia(banner.url) : undefined,
      ]);
      if (error instanceof InvalidMediaError) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  },
);

app.post("/api/chats/direct", requireAuth, (req, res) => {
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Escolha uma pessoa válida." });
    return;
  }
  const chat = createDirectChat(
    currentUserId(req),
    parsed.data.userId,
    presenceLookup(),
  );
  if (!chat) {
    res.status(400).json({ error: "Não foi possível criar esta conversa." });
    return;
  }
  emitChatRefresh(chat.members.map((member) => member.id));
  res.status(201).json({ chat });
});

app.post("/api/chats/group", requireAuth, (req, res) => {
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(50),
      memberIds: z.array(z.string().uuid()).min(1).max(50),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Dê um nome ao grupo e escolha participantes." });
    return;
  }
  const chat = createGroupChat(
    currentUserId(req),
    parsed.data.name,
    parsed.data.memberIds,
    presenceLookup(),
  );
  if (!chat) {
    res.status(400).json({ error: "O grupo precisa de participantes válidos." });
    return;
  }
  emitChatRefresh(chat.members.map((member) => member.id));
  res.status(201).json({ chat });
});

app.post("/api/chats/channel", requireAuth, (req, res) => {
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(50),
      memberIds: z.array(z.string().uuid()).max(200).default([]),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Dê um nome válido ao canal." });
    return;
  }
  const channel = createChannelChat(
    currentUserId(req),
    parsed.data.name,
    parsed.data.memberIds,
    presenceLookup(),
  );
  emitChatRefresh(channel!.members.map((member) => member.id));
  res.status(201).json({ chat: channel });
});

app.post("/api/channels/join/:token", requireAuth, (req, res) => {
  const token = routeParam(req, "token");
  if (!/^[A-Za-z0-9_-]{16}$/.test(token)) {
    res.status(400).json({ error: "Link de canal inválido." });
    return;
  }
  const channel = joinChannel(token, currentUserId(req), presenceLookup());
  if (!channel) {
    res.status(404).json({ error: "Este convite não existe mais." });
    return;
  }
  emitChatRefresh(channel.members.map((member) => member.id));
  res.json({ chat: channel });
});

app.post("/api/channels/:chatId/members", requireAuth, (req, res) => {
  const parsed = z
    .object({ memberIds: z.array(z.string().uuid()).min(1).max(200) })
    .safeParse(req.body);
  if (
    !parsed.success ||
    !addChannelMembers(
      routeParam(req, "chatId"),
      currentUserId(req),
      parsed.success ? parsed.data.memberIds : [],
    )
  ) {
    res.status(403).json({ error: "Somente o dono pode adicionar membros." });
    return;
  }
  emitChatRefresh(getChatMemberIds(routeParam(req, "chatId")));
  res.status(204).end();
});

app.get("/api/chats/:chatId/messages", requireAuth, (req, res) => {
  const chatId = routeParam(req, "chatId");
  const receiptUpdates = markChatDelivered(chatId, currentUserId(req));
  if (!receiptUpdates) {
    res.status(404).json({ error: "Conversa não encontrada." });
    return;
  }
  emitReceiptUpdates(receiptUpdates);
  const messages = listMessages(chatId, currentUserId(req))!;
  res.json({ messages });
});

app.post("/api/chats/:chatId/read", requireAuth, (req, res) => {
  const receiptUpdates = markChatRead(
    routeParam(req, "chatId"),
    currentUserId(req),
  );
  if (!receiptUpdates) {
    res.status(404).json({ error: "Conversa não encontrada." });
    return;
  }
  emitReceiptUpdates(receiptUpdates);
  res.status(204).end();
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4_000),
});

app.post("/api/chats/:chatId/messages", requireAuth, (req, res) => {
  const parsed = messageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Escreva uma mensagem de até 4.000 caracteres." });
    return;
  }
  const chatId = routeParam(req, "chatId");
  if (!canPostToChat(chatId, currentUserId(req))) {
    res.status(403).json({ error: "Somente o dono pode publicar neste canal." });
    return;
  }
  const message = createMessage(
    chatId,
    currentUserId(req),
    parsed.data.body,
  );
  if (!message) {
    res.status(404).json({ error: "Conversa não encontrada." });
    return;
  }
  const memberIds = getChatMemberIds(chatId);
  memberIds.forEach((memberId) =>
    io.to(`user:${memberId}`).emit("message:new", message),
  );
  emitChatRefresh(memberIds);
  res.status(201).json({ message });
});

app.get("/api/chats/:chatId", requireAuth, (req, res) => {
  const chat = getChat(
    routeParam(req, "chatId"),
    currentUserId(req),
    presenceLookup(),
  );
  if (!chat) {
    res.status(404).json({ error: "Conversa não encontrada." });
    return;
  }
  res.json({ chat });
});

io.engine.use(sessionMiddleware);

io.on("connection", (socket) => {
  const request = socket.request as typeof socket.request & {
    session?: session.Session & Partial<session.SessionData>;
  };
  const userId = request.session?.userId;
  if (!userId || !findUserById(userId)) {
    socket.disconnect(true);
    return;
  }

  socket.join(`user:${userId}`);
  presenceRegistry.connect(socket.id, userId);
  setLastSeen(userId);
  emitPresence(userId);

  socket.on(
    "presence:report",
    (
      payload: {
        state?: PresenceState;
        chatId?: string;
      },
      acknowledge?: (result: {
        ok: boolean;
        state: PresenceState;
        chatId: string | null;
      }) => void,
    ) => {
      const parsed = z
        .object({
          state: z.enum(["in_chat", "app", "away"]),
          chatId: z.string().uuid().optional(),
        })
        .safeParse(payload);
      if (!parsed.success) {
        acknowledge?.({ ok: false, state: "away", chatId: null });
        return;
      }
      const canEnterChat =
        parsed.data.state === "in_chat" &&
        parsed.data.chatId &&
        isChatMember(parsed.data.chatId, userId);
      const state: PresenceState =
        parsed.data.state === "in_chat" && !canEnterChat
          ? "app"
          : parsed.data.state;
      const chatId =
        state === "in_chat" ? (parsed.data.chatId ?? null) : null;
      presenceRegistry.report(socket.id, state, chatId);
      if (state === "away") setLastSeen(userId);
      emitPresence(userId);
      acknowledge?.({ ok: true, state, chatId });
    },
  );

  socket.on(
    "message:send",
    (
      payload: { chatId?: string; body?: string },
      acknowledge?: (result: { ok: boolean; error?: string }) => void,
    ) => {
      const parsed = z
        .object({ chatId: z.string().uuid(), body: z.string().trim().min(1).max(4_000) })
        .safeParse(payload);
      if (!parsed.success) {
        acknowledge?.({ ok: false, error: "Mensagem inválida." });
        return;
      }
      if (!canPostToChat(parsed.data.chatId, userId)) {
        acknowledge?.({
          ok: false,
          error: "Somente o dono pode publicar neste canal.",
        });
        return;
      }
      const message = createMessage(
        parsed.data.chatId,
        userId,
        parsed.data.body,
      );
      if (!message) {
        acknowledge?.({ ok: false, error: "Conversa não encontrada." });
        return;
      }
      const memberIds = getChatMemberIds(parsed.data.chatId);
      memberIds.forEach((memberId) =>
        io.to(`user:${memberId}`).emit("message:new", message),
      );
      emitChatRefresh(memberIds);
      acknowledge?.({ ok: true });
    },
  );

  socket.on(
    "message:delivered",
    (
      messageId: string,
      acknowledge?: (result: { ok: boolean }) => void,
    ) => {
      const parsed = z.string().uuid().safeParse(messageId);
      const update = parsed.success
        ? markMessageDelivered(parsed.data, userId)
        : null;
      if (update) emitReceiptUpdates([update]);
      acknowledge?.({ ok: Boolean(update) });
    },
  );

  socket.on(
    "receipts:sync",
    (acknowledge?: (result: { updated: number }) => void) => {
      const updates = markPendingMessagesDelivered(userId);
      emitReceiptUpdates(updates);
      acknowledge?.({ updated: updates.length });
    },
  );

  socket.on(
    "chat:read",
    (
      chatId: string,
      acknowledge?: (result: { ok: boolean }) => void,
    ) => {
      const updates =
        typeof chatId === "string" ? markChatRead(chatId, userId) : null;
      if (updates) emitReceiptUpdates(updates);
      acknowledge?.({ ok: updates !== null });
    },
  );

  socket.on("disconnect", () => {
    presenceRegistry.disconnect(socket.id);
    if (presenceRegistry.get(userId).state === "away") setLastSeen(userId);
    emitPresence(userId);
  });
});

const presenceSweep = setInterval(() => {
  presenceRegistry.expireInactive(40_000).forEach((userId) => {
    if (presenceRegistry.get(userId).state === "away") setLastSeen(userId);
    emitPresence(userId);
  });
}, 10_000);
presenceSweep.unref();

app.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof multer.MulterError) {
      res.status(400).json({
        error:
          error.code === "LIMIT_FILE_SIZE"
            ? "O arquivo excede o limite de 12 MB."
            : "Não foi possível receber este arquivo.",
      });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Algo saiu do ritmo. Tente novamente." });
  },
);

if (isProduction) {
  const distDirectory = path.join(process.cwd(), "dist");
  app.use(express.static(distDirectory));
  app.use((req, res, next) => {
    if (req.method === "GET" && req.accepts("html")) {
      res.sendFile(path.join(distDirectory, "index.html"));
      return;
    }
    next();
  });
}

server.listen(port, host, () => {
  console.log(`CaosChat API ouvindo em http://${host}:${port}`);
  console.log(`SQLite disponível em ${dataDirectory}`);
});
