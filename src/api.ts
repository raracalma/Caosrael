import type { Chat, Message, User } from "./types";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const isFormData = options?.body instanceof FormData;
  const response = await fetch(url, {
    ...options,
    headers: isFormData
      ? options?.headers
      : {
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
  profile: (userId: string) =>
    request<{ user: User }>(`/api/users/${userId}/profile`),
  updateProfile: (displayName: string, bio: string) =>
    request<{ user: User }>("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ displayName, bio }),
    }),
  uploadProfileMedia: (avatar?: File, banner?: File) => {
    const form = new FormData();
    if (avatar) form.append("avatar", avatar);
    if (banner) form.append("banner", banner);
    return request<{ user: User }>("/api/profile/media", {
      method: "POST",
      body: form,
    });
  },
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
