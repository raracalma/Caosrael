import type { Chat, Message, User } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(payload?.error ?? "Não foi possível completar a ação.");
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  me: () => request<{ user: User }>("/api/auth/me"),
  login: (displayName: string, password: string) =>
    request<{ user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ displayName, password }),
    }),
  register: (displayName: string, password: string) =>
    request<{ user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ displayName, password }),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  users: () => request<{ users: User[] }>("/api/users"),
  chats: () => request<{ chats: Chat[] }>("/api/chats"),
  messages: (chatId: string) =>
    request<{ messages: Message[] }>(`/api/chats/${chatId}/messages`),
  markRead: (chatId: string) =>
    request<void>(`/api/chats/${chatId}/read`, { method: "POST" }),
  createDirect: (userId: string) =>
    request<{ chat: Chat }>("/api/chats/direct", {
      method: "POST",
      body: JSON.stringify({ userId }),
    }),
  createGroup: (name: string, memberIds: string[]) =>
    request<{ chat: Chat }>("/api/chats/group", {
      method: "POST",
      body: JSON.stringify({ name, memberIds }),
    }),
};
