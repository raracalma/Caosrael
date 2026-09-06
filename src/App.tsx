import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronRight,
  LogOut,
  MessageCircleMore,
  MessagesSquare,
  Plus,
  Search,
  Send,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { api } from "./api";
import type { Chat, Message, ReceiptUpdate, User } from "./types";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function colorFor(value: string) {
  const colors = ["sage", "amber", "berry", "ocean", "moss", "clay"];
  let hash = 0;
  for (const character of value) {
    hash = character.charCodeAt(0) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function Avatar({
  name,
  online,
  group,
  size = "medium",
}: {
  name: string;
  online?: boolean;
  group?: boolean;
  size?: "small" | "medium" | "large";
}) {
  return (
    <div className={`avatar avatar--${size} avatar--${colorFor(name)}`}>
      {group ? <Users size={size === "large" ? 24 : 19} /> : initials(name)}
      {online && <span className="avatar__online" aria-label="online" />}
    </div>
  );
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo">
      <span className="logo__mark">
        <MessageCircleMore />
        <i />
      </span>
      {!compact && <span>CaosChat</span>}
    </div>
  );
}

type AuthMode = "login" | "register";

function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (user: User) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const authenticate = async (
    selectedMode: AuthMode,
    name = displayName,
    pass = password,
  ) => {
    setBusy(true);
    setError("");
    try {
      const result =
        selectedMode === "login"
          ? await api.login(name, pass)
          : await api.register(name, pass);
      onAuthenticated(result.user);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível entrar.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void authenticate(mode);
  };

  return (
    <main className="auth">
      <section className="auth__story">
        <Logo />
        <div className="auth__story-copy">
          <span className="eyebrow">
            <Sparkles size={15} /> conversas no seu ritmo
          </span>
          <h1>
            Menos ruído.
            <br />
            Mais <em>presença.</em>
          </h1>
          <p>
            Um espaço simples e acolhedor para reunir as pessoas e ideias que
            importam.
          </p>
        </div>
        <div className="auth__floating-message auth__floating-message--one">
          <Avatar name="Ana" size="small" />
          <div>
            <b>Ana</b>
            <span>Você chegou? 🌿</span>
          </div>
        </div>
        <div className="auth__floating-message auth__floating-message--two">
          <span>Cheguei. Bora conversar!</span>
          <Check size={14} />
        </div>
        <small>Feito para conexões reais — sem pressa.</small>
      </section>

      <section className="auth__panel">
        <div className="auth__mobile-logo">
          <Logo />
        </div>
        <div className="auth__card">
          <span className="auth__kicker">Bem-vindo ao CaosChat</span>
          <h2>{mode === "login" ? "Que bom ter você aqui." : "Crie seu espaço."}</h2>
          <p>
            {mode === "login"
              ? "Entre para continuar suas conversas."
              : "Só precisamos do seu nome e uma senha."}
          </p>

          <div className="auth__tabs" role="tablist">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              className={mode === "register" ? "active" : ""}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Criar conta
            </button>
          </div>

          <form onSubmit={submit} className="auth__form">
            <label>
              Seu nome
              <input
                autoFocus
                autoComplete="username"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Como devemos chamar você?"
                minLength={2}
                maxLength={40}
                required
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Mínimo de 6 caracteres"
                minLength={6}
                maxLength={100}
                required
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="button button--primary" disabled={busy}>
              {busy
                ? "Só um instante…"
                : mode === "login"
                  ? "Entrar no CaosChat"
                  : "Criar minha conta"}
              {!busy && <ChevronRight size={18} />}
            </button>
          </form>

          <div className="demo-access">
            <span>Acesso rápido para demonstração</span>
            <div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void authenticate("login", "Ana Demo", "demo1234")}
              >
                Entrar como Ana
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void authenticate("login", "Bruno Demo", "demo1234")
                }
              >
                Entrar como Bruno
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function formatListTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatMessageTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function MessageTicks({ message }: { message: Message }) {
  const read = message.deliveryStatus === "read";
  const delivered = message.deliveryStatus === "delivered";
  const label = read
    ? `Lida por ${message.receiptSummary.read} de ${message.receiptSummary.total}`
    : delivered
      ? `Entregue a ${message.receiptSummary.delivered} de ${message.receiptSummary.total}`
      : "Enviada ao servidor";

  return (
    <span
      className={`message-ticks message-ticks--${message.deliveryStatus}`}
      aria-label={label}
      title={label}
    >
      {delivered || read ? (
        <CheckCheck size={15} strokeWidth={2.4} />
      ) : (
        <Check size={14} strokeWidth={2.4} />
      )}
    </span>
  );
}

function formatDay(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Hoje";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
  }).format(date);
}

function presenceText(chat: Chat, currentUserId: string) {
  if (chat.type === "group") {
    return `${chat.members.length} participantes`;
  }
  const other = chat.members.find((member) => member.id !== currentUserId);
  if (!other) return "";
  if (other.online) return "online agora";
  if (!other.lastSeenAt) return "offline";
  return `visto por último ${formatListTime(other.lastSeenAt)}`;
}

function NewChatModal({
  users,
  onClose,
  onCreateDirect,
  onCreateGroup,
}: {
  users: User[];
  onClose: () => void;
  onCreateDirect: (userId: string) => Promise<void>;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<void>;
}) {
  const [mode, setMode] = useState<"direct" | "group">("direct");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const filtered = users.filter((user) =>
    user.displayName.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")),
  );

  const createDirect = async (userId: string) => {
    setBusy(true);
    setError("");
    try {
      await onCreateDirect(userId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tente novamente.");
      setBusy(false);
    }
  };

  const createGroup = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onCreateGroup(name, selected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tente novamente.");
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-chat-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <span className="eyebrow">comece uma conexão</span>
            <h2 id="new-chat-title">Nova conversa</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar">
            <X size={20} />
          </button>
        </header>
        <div className="modal__tabs">
          <button
            className={mode === "direct" ? "active" : ""}
            onClick={() => setMode("direct")}
          >
            <MessageCircleMore size={17} /> Individual
          </button>
          <button
            className={mode === "group" ? "active" : ""}
            onClick={() => setMode("group")}
          >
            <Users size={17} /> Criar grupo
          </button>
        </div>

        {mode === "group" && (
          <label className="modal__group-name">
            Nome do grupo
            <input
              autoFocus
              value={name}
              maxLength={50}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Papo de domingo"
            />
          </label>
        )}

        <div className="search-field search-field--modal">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar pessoas"
          />
        </div>

        <div className="people-list">
          {filtered.map((person) => {
            const checked = selected.includes(person.id);
            return (
              <button
                key={person.id}
                type="button"
                disabled={busy}
                onClick={() => {
                  if (mode === "direct") {
                    void createDirect(person.id);
                  } else {
                    setSelected((current) =>
                      checked
                        ? current.filter((id) => id !== person.id)
                        : [...current, person.id],
                    );
                  }
                }}
              >
                <Avatar
                  name={person.displayName}
                  online={person.online}
                  size="small"
                />
                <span>
                  <b>{person.displayName}</b>
                  <small>{person.online ? "Online agora" : "Disponível no CaosChat"}</small>
                </span>
                {mode === "group" ? (
                  <i className={`checkbox ${checked ? "checked" : ""}`}>
                    {checked && <Check size={14} />}
                  </i>
                ) : (
                  <ChevronRight size={17} />
                )}
              </button>
            );
          })}
          {!filtered.length && (
            <div className="people-list__empty">Nenhuma pessoa encontrada.</div>
          )}
        </div>
        {error && <div className="form-error modal__error">{error}</div>}
        {mode === "group" && (
          <form onSubmit={createGroup} className="modal__footer">
            <span>
              {selected.length} {selected.length === 1 ? "pessoa" : "pessoas"}
            </span>
            <button
              className="button button--primary"
              disabled={busy || name.trim().length < 2 || selected.length < 1}
            >
              {busy ? "Criando…" : "Criar grupo"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function EmptyConversation({ onNewChat }: { onNewChat: () => void }) {
  return (
    <section className="empty-conversation">
      <div className="empty-conversation__art">
        <span className="empty-conversation__bubble empty-conversation__bubble--one" />
        <MessagesSquare />
        <span className="empty-conversation__bubble empty-conversation__bubble--two" />
      </div>
      <span className="eyebrow">seu espaço de conversa</span>
      <h2>Escolha alguém e deixe o papo fluir.</h2>
      <p>
        Selecione uma conversa ao lado ou comece uma nova. O importante é
        aparecer por inteiro.
      </p>
      <button className="button button--soft" onClick={onNewChat}>
        <Plus size={18} /> Nova conversa
      </button>
    </section>
  );
}

function Messenger({
  currentUser,
  onLogout,
}: {
  currentUser: User;
  onLogout: () => void;
}) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [notice, setNotice] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const selectedChatRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const loadChats = async () => {
    try {
      const result = await api.chats();
      setChats(result.chats);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Erro ao buscar conversas.");
    }
  };

  useEffect(() => {
    void Promise.all([
      loadChats(),
      api.users().then((result) => setUsers(result.users)),
    ]);

    const socket = io();
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("receipts:sync"));
    socket.on("message:new", (message: Message) => {
      if (message.senderId !== currentUser.id) {
        socket.emit("message:delivered", message.id);
      }
      if (message.chatId === selectedChatRef.current) {
        setMessages((current) =>
          current.some((item) => item.id === message.id)
            ? current
            : [...current, message],
        );
        socket.emit("chat:read", message.chatId);
      }
    });
    socket.on("receipt:updated", (receipt: ReceiptUpdate) => {
      const applyReceipt = (message: Message) =>
        message.id === receipt.messageId
          ? {
              ...message,
              deliveryStatus: receipt.deliveryStatus,
              statusUpdatedAt: receipt.statusUpdatedAt,
              receiptSummary: receipt.receiptSummary,
            }
          : message;
      setMessages((current) => current.map(applyReceipt));
      setChats((current) =>
        current.map((chat) =>
          chat.lastMessage?.id === receipt.messageId
            ? { ...chat, lastMessage: applyReceipt(chat.lastMessage) }
            : chat,
        ),
      );
    });
    socket.on("chats:refresh", () => void loadChats());
    socket.on(
      "presence:update",
      (presence: { userId: string; online: boolean; lastSeenAt?: string }) => {
        const updateUser = (user: User) =>
          user.id === presence.userId
            ? {
                ...user,
                online: presence.online,
                lastSeenAt: presence.lastSeenAt ?? user.lastSeenAt,
              }
            : user;
        setUsers((current) => current.map(updateUser));
        setChats((current) =>
          current.map((chat) => ({
            ...chat,
            members: chat.members.map(updateUser),
          })),
        );
      },
    );
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const markReadWhenFocused = () => {
      if (document.visibilityState !== "visible") return;
      const chatId = selectedChatRef.current;
      if (chatId && socketRef.current?.connected) {
        socketRef.current.emit("chat:read", chatId);
      }
    };
    window.addEventListener("focus", markReadWhenFocused);
    document.addEventListener("visibilitychange", markReadWhenFocused);
    return () => {
      window.removeEventListener("focus", markReadWhenFocused);
      document.removeEventListener("visibilitychange", markReadWhenFocused);
    };
  }, []);

  useEffect(() => {
    selectedChatRef.current = selectedChatId;
    if (!selectedChatId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    api
      .messages(selectedChatId)
      .then(({ messages: loaded }) => {
        setMessages(loaded);
        return api.markRead(selectedChatId);
      })
      .then(() => {
        setChats((current) =>
          current.map((chat) =>
            chat.id === selectedChatId ? { ...chat, unreadCount: 0 } : chat,
          ),
        );
      })
      .catch((caught) =>
        setNotice(caught instanceof Error ? caught.message : "Erro ao abrir conversa."),
      )
      .finally(() => setLoadingMessages(false));
  }, [selectedChatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4_000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const selectedChat = chats.find((chat) => chat.id === selectedChatId) ?? null;
  const filteredChats = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return chats;
    return chats.filter(
      (chat) =>
        chat.name.toLocaleLowerCase("pt-BR").includes(normalized) ||
        chat.lastMessage?.body.toLocaleLowerCase("pt-BR").includes(normalized),
    );
  }, [chats, search]);

  const openChat = (chatId: string) => {
    setSelectedChatId(chatId);
  };

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selectedChatId) return;
    const socket = socketRef.current;
    if (!socket?.connected) {
      setNotice("Reconectando… tente enviar de novo em um instante.");
      return;
    }
    setDraft("");
    socket.emit(
      "message:send",
      { chatId: selectedChatId, body },
      (result: { ok: boolean; error?: string }) => {
        if (!result.ok) {
          setDraft(body);
          setNotice(result.error ?? "Não foi possível enviar.");
        }
      },
    );
  };

  const createDirect = async (userId: string) => {
    const { chat } = await api.createDirect(userId);
    await loadChats();
    setSelectedChatId(chat.id);
    setShowNewChat(false);
  };

  const createGroup = async (name: string, memberIds: string[]) => {
    const { chat } = await api.createGroup(name, memberIds);
    await loadChats();
    setSelectedChatId(chat.id);
    setShowNewChat(false);
  };

  return (
    <main className={`messenger ${selectedChat ? "messenger--chat-open" : ""}`}>
      <aside className="sidebar">
        <header className="sidebar__top">
          <Logo />
          <button
            className="icon-button icon-button--new"
            onClick={() => setShowNewChat(true)}
            aria-label="Nova conversa"
          >
            <Plus size={20} />
          </button>
        </header>
        <div className="sidebar__profile">
          <Avatar name={currentUser.displayName} online size="small" />
          <div>
            <b>{currentUser.displayName}</b>
            <span>Disponível</span>
          </div>
          <button className="icon-button" onClick={onLogout} aria-label="Sair">
            <LogOut size={17} />
          </button>
        </div>
        <div className="sidebar__inbox-heading">
          <div>
            <span>Mensagens</span>
            <small>{chats.length} conversas</small>
          </div>
          <button onClick={() => setShowNewChat(true)}>
            <Plus size={16} /> Nova
          </button>
        </div>
        <div className="search-field">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar conversas"
            aria-label="Buscar conversas"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="Limpar busca">
              <X size={14} />
            </button>
          )}
        </div>
        <nav className="chat-list" aria-label="Conversas">
          {filteredChats.map((chat) => {
            const other = chat.members.find(
              (member) => member.id !== currentUser.id,
            );
            return (
              <button
                key={chat.id}
                className={`chat-list__item ${
                  selectedChatId === chat.id ? "active" : ""
                }`}
                onClick={() => openChat(chat.id)}
              >
                <Avatar
                  name={chat.name}
                  group={chat.type === "group"}
                  online={chat.type === "direct" && other?.online}
                />
                <span className="chat-list__body">
                  <span className="chat-list__line">
                    <b>{chat.name}</b>
                    <time>{formatListTime(chat.updatedAt)}</time>
                  </span>
                  <span className="chat-list__line">
                    <span className="chat-list__preview">
                      {chat.type === "group" &&
                        chat.lastMessage &&
                        `${chat.lastMessage.senderName.split(" ")[0]}: `}
                      {chat.lastMessage?.body ?? "Conversa criada"}
                    </span>
                    {chat.unreadCount > 0 && (
                      <i className="unread">{Math.min(chat.unreadCount, 99)}</i>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
          {!filteredChats.length && (
            <div className="chat-list__empty">
              <MessageCircleMore size={25} />
              <b>{search ? "Nada por aqui" : "Comece uma conversa"}</b>
              <span>
                {search
                  ? "Tente buscar por outro nome."
                  : "Encontre uma pessoa no botão Nova."}
              </span>
            </div>
          )}
        </nav>
        <footer className="sidebar__footer">
          <i />
          Suas conversas ficam salvas neste dispositivo.
        </footer>
      </aside>

      <section className="conversation">
        {selectedChat ? (
          <>
            <header className="conversation__header">
              <button
                className="icon-button conversation__back"
                onClick={() => setSelectedChatId(null)}
                aria-label="Voltar"
              >
                <ArrowLeft size={21} />
              </button>
              <Avatar
                name={selectedChat.name}
                group={selectedChat.type === "group"}
                online={
                  selectedChat.type === "direct" &&
                  selectedChat.members.some(
                    (member) => member.id !== currentUser.id && member.online,
                  )
                }
                size="small"
              />
              <div>
                <b>{selectedChat.name}</b>
                <span
                  className={
                    presenceText(selectedChat, currentUser.id) === "online agora"
                      ? "online-text"
                      : ""
                  }
                >
                  {presenceText(selectedChat, currentUser.id)}
                </span>
              </div>
              <span className="conversation__brand">CaosChat</span>
            </header>

            <div className="messages" aria-live="polite">
              {loadingMessages ? (
                <div className="messages__loading">
                  <i />
                  <span>Carregando conversa…</span>
                </div>
              ) : (
                messages.map((message, index) => {
                  const sent = message.senderId === currentUser.id;
                  const previous = messages[index - 1];
                  const showDay =
                    !previous ||
                    new Date(previous.createdAt).toDateString() !==
                      new Date(message.createdAt).toDateString();
                  return (
                    <div key={message.id}>
                      {showDay && (
                        <div className="day-separator">
                          <span>{formatDay(message.createdAt)}</span>
                        </div>
                      )}
                      <div
                        className={`message-row ${sent ? "message-row--sent" : ""}`}
                      >
                        <div className="message-bubble">
                          {!sent && selectedChat.type === "group" && (
                            <b className={`sender-name sender-name--${colorFor(message.senderName)}`}>
                              {message.senderName}
                            </b>
                          )}
                          <span>{message.body}</span>
                          <time>
                            {formatMessageTime(message.createdAt)}
                            {sent && <MessageTicks message={message} />}
                          </time>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {!loadingMessages && !messages.length && (
                <div className="messages__begin">
                  <Sparkles size={18} />
                  Esta é uma conversa nova. Diga oi!
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <form className="composer" onSubmit={sendMessage}>
              <div className="composer__input">
                <textarea
                  rows={1}
                  value={draft}
                  maxLength={4_000}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Escreva uma mensagem…"
                  aria-label="Mensagem"
                />
                <span>{draft.length > 3_800 ? 4_000 - draft.length : ""}</span>
              </div>
              <button
                className="send-button"
                disabled={!draft.trim()}
                aria-label="Enviar mensagem"
              >
                <Send size={20} />
              </button>
            </form>
          </>
        ) : (
          <EmptyConversation onNewChat={() => setShowNewChat(true)} />
        )}
      </section>

      {showNewChat && (
        <NewChatModal
          users={users}
          onClose={() => setShowNewChat(false)}
          onCreateDirect={createDirect}
          onCreateGroup={createGroup}
        />
      )}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setCurrentUser(user))
      .catch(() => setCurrentUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setCurrentUser(null);
    }
  };

  if (checkingSession) {
    return (
      <main className="splash">
        <Logo />
        <span>Organizando o caos…</span>
      </main>
    );
  }

  if (!currentUser) {
    return <AuthScreen onAuthenticated={setCurrentUser} />;
  }

  return <Messenger currentUser={currentUser} onLogout={() => void logout()} />;
}
