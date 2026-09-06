import path from "node:path";
import http from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import { Server } from "socket.io";
import { z } from "zod";
import { SQLiteSessionStore } from "./session-store.js";
import {
  authenticate,
  createDirectChat,
  createGroupChat,
  createMessage,
  createUser,
  findUserById,
  getChat,
  getChatMemberIds,
  listChats,
  listMessages,
  listUsers,
  markChatRead,
  setLastSeen,
} from "./store.js";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

const port = Number(process.env.PORT ?? 3001);
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const sessionMiddleware = session({
  store: new SQLiteSessionStore(),
  secret: process.env.SESSION_SECRET ?? "caoschat-dev-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: 30 * 24 * 60 * 60 * 1_000,
  },
});

app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(sessionMiddleware);

const onlineConnections = new Map<string, number>();
const onlineIds = () => new Set(onlineConnections.keys());

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

function publicCurrentUser(userId: string) {
  const user = findUserById(userId)!;
  return {
    id: user.id,
    displayName: user.display_name,
    lastSeenAt: user.last_seen_at,
    online: onlineConnections.has(user.id),
  };
}

function emitChatRefresh(memberIds: string[]) {
  memberIds.forEach((memberId) => {
    io.to(`user:${memberId}`).emit("chats:refresh");
  });
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
  res.json({ user: publicCurrentUser(currentUserId(req)) });
});

app.get("/api/users", requireAuth, (req, res) => {
  res.json({ users: listUsers(currentUserId(req), onlineIds()) });
});

app.get("/api/chats", requireAuth, (req, res) => {
  res.json({ chats: listChats(currentUserId(req), onlineIds()) });
});

app.post("/api/chats/direct", requireAuth, (req, res) => {
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Escolha uma pessoa válida." });
    return;
  }
  const chat = createDirectChat(
    currentUserId(req),
    parsed.data.userId,
    onlineIds(),
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
    onlineIds(),
  );
  if (!chat) {
    res.status(400).json({ error: "O grupo precisa de participantes válidos." });
    return;
  }
  emitChatRefresh(chat.members.map((member) => member.id));
  res.status(201).json({ chat });
});

app.get("/api/chats/:chatId/messages", requireAuth, (req, res) => {
  const messages = listMessages(routeParam(req, "chatId"), currentUserId(req));
  if (!messages) {
    res.status(404).json({ error: "Conversa não encontrada." });
    return;
  }
  res.json({ messages });
});

app.post("/api/chats/:chatId/read", requireAuth, (req, res) => {
  if (!markChatRead(routeParam(req, "chatId"), currentUserId(req))) {
    res.status(404).json({ error: "Conversa não encontrada." });
    return;
  }
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
  const message = createMessage(
    routeParam(req, "chatId"),
    currentUserId(req),
    parsed.data.body,
  );
  if (!message) {
    res.status(404).json({ error: "Conversa não encontrada." });
    return;
  }
  const memberIds = getChatMemberIds(routeParam(req, "chatId"));
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
    onlineIds(),
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
  onlineConnections.set(userId, (onlineConnections.get(userId) ?? 0) + 1);
  setLastSeen(userId);
  io.emit("presence:update", { userId, online: true });

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

  socket.on("chat:read", (chatId: string) => {
    if (typeof chatId === "string") markChatRead(chatId, userId);
  });

  socket.on("disconnect", () => {
    const remaining = (onlineConnections.get(userId) ?? 1) - 1;
    if (remaining <= 0) {
      onlineConnections.delete(userId);
      const lastSeenAt = new Date().toISOString();
      setLastSeen(userId, lastSeenAt);
      io.emit("presence:update", { userId, online: false, lastSeenAt });
    } else {
      onlineConnections.set(userId, remaining);
    }
  });
});

app.use(
  (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "Algo saiu do ritmo. Tente novamente." });
  },
);

if (process.env.NODE_ENV === "production") {
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

server.listen(port, () => {
  console.log(`CaosChat API disponível em http://localhost:${port}`);
});
