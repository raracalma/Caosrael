import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";

const port = 41_000 + Math.floor(Math.random() * 1_000);
const baseUrl = `http://127.0.0.1:${port}`;
const dataDirectory = mkdtempSync(path.join(tmpdir(), "caoschat-test-"));
let server: ChildProcess;
let serverOutput = "";

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // O processo ainda está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API não iniciou.\n${serverOutput}`);
}

async function jsonRequest(
  pathname: string,
  options: RequestInit = {},
  cookie?: string,
) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers,
    },
  });
  const data = response.status === 204 ? null : await response.json();
  return { response, data };
}

async function register(displayName: string) {
  const result = await jsonRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ displayName, password: "senha123" }),
  });
  expect(result.response.status).toBe(201);
  const cookie = result.response.headers.get("set-cookie")?.split(";")[0];
  expect(cookie).toBeTruthy();
  return {
    cookie: cookie!,
    user: (result.data as { user: { id: string; displayName: string } }).user,
  };
}

beforeAll(async () => {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    COOKIE_SECURE: "false",
    PORT: String(port),
    DATA_DIR: dataDirectory,
    DISABLE_DEMO_SEED: "true",
  };
  delete environment.SESSION_SECRET;

  server = spawn(
    process.execPath,
    ["--import", "tsx", path.join(process.cwd(), "server/index.ts")],
    {
      cwd: process.cwd(),
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout?.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr?.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  await waitForServer();
}, 10_000);

afterAll(() => {
  server?.kill("SIGTERM");
  rmSync(dataDirectory, { recursive: true, force: true });
});

describe("fluxo principal do CaosChat", () => {
  it("percorre sent → delivered → read entre duas contas", async () => {
    expect(existsSync(path.join(dataDirectory, ".session-secret"))).toBe(true);

    const ana = await register("Ana Teste");
    const bia = await register("Bia Teste");

    const direct = await jsonRequest(
      "/api/chats/direct",
      {
        method: "POST",
        body: JSON.stringify({ userId: bia.user.id }),
      },
      ana.cookie,
    );
    expect(direct.response.status).toBe(201);
    const chatId = (direct.data as { chat: { id: string } }).chat.id;

    const connectSocket = async (cookie: string) => {
      const socket: Socket = io(baseUrl, {
        extraHeaders: { Cookie: cookie },
        transports: ["websocket"],
      });
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", () => resolve());
        socket.once("connect_error", reject);
      });
      return socket;
    };
    const [anaSocket, biaSocket] = await Promise.all([
      connectSocket(ana.cookie),
      connectSocket(bia.cookie),
    ]);

    const received = new Promise<{
      id: string;
      body: string;
      chatId: string;
      deliveryStatus: string;
    }>((resolve) => {
      biaSocket.once("message:new", resolve);
    });
    const sent = await jsonRequest(
      `/api/chats/${chatId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ body: "Mensagem ao vivo" }),
      },
      ana.cookie,
    );
    expect(sent.response.status).toBe(201);
    expect(
      (sent.data as { message: { deliveryStatus: string } }).message
        .deliveryStatus,
    ).toBe("sent");
    const receivedMessage = await received;
    expect(receivedMessage).toMatchObject({
      chatId,
      body: "Mensagem ao vivo",
      deliveryStatus: "sent",
    });

    const deliveredReceipt = new Promise<{
      messageId: string;
      deliveryStatus: string;
    }>((resolve) => {
      anaSocket.once("receipt:updated", resolve);
    });
    biaSocket.emit("message:delivered", receivedMessage.id);
    await expect(deliveredReceipt).resolves.toMatchObject({
      messageId: receivedMessage.id,
      deliveryStatus: "delivered",
    });

    const afterDelivery = await jsonRequest(
      `/api/chats/${chatId}/messages`,
      {},
      ana.cookie,
    );
    expect(
      (
        afterDelivery.data as {
          messages: Array<{ id: string; deliveryStatus: string }>;
        }
      ).messages.find((message) => message.id === receivedMessage.id)
        ?.deliveryStatus,
    ).toBe("delivered");

    const biaChats = await jsonRequest("/api/chats", {}, bia.cookie);
    expect(
      (biaChats.data as { chats: Array<{ unreadCount: number }> }).chats[0]
        .unreadCount,
    ).toBe(1);

    const readReceipt = new Promise<{
      messageId: string;
      deliveryStatus: string;
    }>((resolve) => {
      anaSocket.once("receipt:updated", resolve);
    });
    biaSocket.emit("chat:read", chatId);
    await expect(readReceipt).resolves.toMatchObject({
      messageId: receivedMessage.id,
      deliveryStatus: "read",
    });

    const afterRead = await jsonRequest(
      `/api/chats/${chatId}/messages`,
      {},
      ana.cookie,
    );
    expect(
      (
        afterRead.data as {
          messages: Array<{ id: string; deliveryStatus: string }>;
        }
      ).messages.find((message) => message.id === receivedMessage.id)
        ?.deliveryStatus,
    ).toBe("read");

    const group = await jsonRequest(
      "/api/chats/group",
      {
        method: "POST",
        body: JSON.stringify({
          name: "Grupo de teste",
          memberIds: [bia.user.id],
        }),
      },
      ana.cookie,
    );
    expect(group.response.status).toBe(201);
    expect(
      (group.data as { chat: { type: string; members: unknown[] } }).chat,
    ).toMatchObject({ type: "group", members: expect.any(Array) });

    anaSocket.disconnect();
    biaSocket.disconnect();
  });
});
