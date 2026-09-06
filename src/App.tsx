import {
  ArrowLeft,
  Camera,
  Check,
  CheckCheck,
  ChevronRight,
  Copy,
  Folder,
  LogOut,
  Image as ImageIcon,
  Megaphone,
  MessageCircleMore,
  MessagesSquare,
  MoreVertical,
  Plus,
  QrCode,
  Search,
  Send,
  Settings,
  Share2,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { io, type Socket } from "socket.io-client";
import { api } from "./api";
import type {
  Chat,
  ChatFolder,
  Message,
  ReceiptUpdate,
  User,
} from "./types";

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
  avatarUrl,
  avatarMediaType,
  presence,
  group,
  channel,
  size = "medium",
}: {
  name: string;
  avatarUrl?: string | null;
  avatarMediaType?: string | null;
  presence?: "in_chat" | "app" | "away";
  group?: boolean;
  channel?: boolean;
  size?: "small" | "medium" | "large";
}) {
  return (
    <div className={`avatar avatar--${size} avatar--${colorFor(name)}`}>
      {avatarUrl ? (
        avatarMediaType?.startsWith("video/") ? (
          <video src={avatarUrl} autoPlay loop muted playsInline />
        ) : (
          <img src={avatarUrl} alt="" />
        )
      ) : channel ? (
        <Megaphone size={size === "large" ? 24 : 19} />
      ) : group ? (
        <Users size={size === "large" ? 24 : 19} />
      ) : (
        initials(name)
      )}
      {presence && (
        <span
          className={`avatar__presence avatar__presence--${presence}`}
          aria-label={
            presence === "in_chat"
              ? "nesta conversa"
              : presence === "app"
                ? "no aplicativo"
                : "ausente"
          }
        />
      )}
    </div>
  );
}

function userPresenceForChat(
  user: User | undefined,
  chatId?: string,
): "in_chat" | "app" | "away" {
  if (!user || user.presenceState === "away") return "away";
  if (
    chatId &&
    user.presenceState === "in_chat" &&
    user.activeChatId === chatId
  ) {
    return "in_chat";
  }
  return "app";
}

function chatPresence(
  chat: Chat,
  currentUserId: string,
): "in_chat" | "app" | "away" {
  const others = chat.members.filter((member) => member.id !== currentUserId);
  if (
    others.some(
      (member) =>
        member.presenceState === "in_chat" &&
        member.activeChatId === chat.id,
    )
  ) {
    return "in_chat";
  }
  if (others.some((member) => member.presenceState !== "away")) return "app";
  return "away";
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
  if (chat.type !== "direct") {
    const others = chat.members.filter(
      (member) => member.id !== currentUserId,
    );
    const here = others.filter(
      (member) => userPresenceForChat(member, chat.id) === "in_chat",
    ).length;
    const inApp = others.filter(
      (member) => userPresenceForChat(member, chat.id) === "app",
    ).length;
    const peopleLabel =
      chat.type === "channel"
        ? `${chat.members.length} inscritos`
        : `${chat.members.length} participantes`;
    return `${peopleLabel} · ${here} aqui · ${inApp} no app`;
  }
  const other = chat.members.find((member) => member.id !== currentUserId);
  if (!other) return "";
  const presence = userPresenceForChat(other, chat.id);
  if (presence === "in_chat") return "nesta conversa";
  if (presence === "app") return "online em outro lugar";
  if (!other.lastSeenAt) return "offline";
  return `visto por último ${formatListTime(other.lastSeenAt)}`;
}

function NewChatModal({
  users,
  initialMode,
  onClose,
  onCreateDirect,
  onCreateGroup,
  onCreateChannel,
}: {
  users: User[];
  initialMode: "direct" | "group" | "channel";
  onClose: () => void;
  onCreateDirect: (userId: string) => Promise<void>;
  onCreateGroup: (name: string, memberIds: string[]) => Promise<void>;
  onCreateChannel: (name: string, memberIds: string[]) => Promise<void>;
}) {
  const [mode, setMode] = useState<"direct" | "group" | "channel">(
    initialMode,
  );
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const normalizedQuery = query.toLocaleLowerCase("pt-BR");
  const filtered = users.filter((user) =>
    user.displayName.toLocaleLowerCase("pt-BR").includes(normalizedQuery),
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

  const createCollective = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "group") await onCreateGroup(name, selected);
      if (mode === "channel") await onCreateChannel(name, selected);
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
          <button
            className={mode === "channel" ? "active" : ""}
            onClick={() => setMode("channel")}
          >
            <Megaphone size={17} /> Canal
          </button>
        </div>

        {mode !== "direct" && (
          <label className="modal__group-name">
            Nome do {mode === "channel" ? "canal" : "grupo"}
            <input
              autoFocus
              value={name}
              maxLength={50}
              onChange={(event) => setName(event.target.value)}
              placeholder={
                mode === "channel" ? "Ex.: Novidades do Caos" : "Ex.: Papo de domingo"
              }
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
                  avatarUrl={person.avatarUrl}
                  avatarMediaType={person.avatarMediaType}
                  presence={userPresenceForChat(person)}
                  size="small"
                />
                <span>
                  <b>{person.displayName}</b>
                  <small>
                    {person.presenceState === "away"
                      ? "Ausente"
                      : "No CaosChat"}
                  </small>
                </span>
                {mode !== "direct" ? (
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
        {mode !== "direct" && (
          <form onSubmit={createCollective} className="modal__footer">
            <span>
              {selected.length}{" "}
              {mode === "channel"
                ? selected.length === 1
                  ? "convidado"
                  : "convidados"
                : selected.length === 1
                  ? "pessoa"
                  : "pessoas"}
            </span>
            <button
              className="button button--primary"
              disabled={
                busy ||
                name.trim().length < 2 ||
                (mode === "group" && selected.length < 1)
              }
            >
              {busy
                ? "Criando…"
                : mode === "channel"
                  ? "Criar canal"
                  : "Criar grupo"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function ProfileScreen({
  user,
  ownProfile,
  onClose,
  onSaved,
}: {
  user: User;
  ownProfile: boolean;
  onClose: () => void;
  onSaved: (user: User) => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [bio, setBio] = useState(user.bio);
  const [avatar, setAvatar] = useState<File>();
  const [banner, setBanner] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const avatarPreview = useMemo(
    () => (avatar ? URL.createObjectURL(avatar) : user.avatarUrl),
    [avatar, user.avatarUrl],
  );
  const bannerPreview = useMemo(
    () => (banner ? URL.createObjectURL(banner) : user.bannerUrl),
    [banner, user.bannerUrl],
  );
  const avatarMediaType = avatar?.type ?? user.avatarMediaType;

  useEffect(
    () => () => {
      if (avatarPreview?.startsWith("blob:")) URL.revokeObjectURL(avatarPreview);
      if (bannerPreview?.startsWith("blob:")) URL.revokeObjectURL(bannerPreview);
    },
    [avatarPreview, bannerPreview],
  );

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      let updated = (
        await api.updateProfile(displayName.trim(), bio.trim())
      ).user;
      if (avatar || banner) {
        updated = (await api.uploadProfileMedia(avatar, banner)).user;
      }
      onSaved(updated);
      setAvatar(undefined);
      setBanner(undefined);
      setSaved(true);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-screen" role="dialog" aria-modal="true">
      <header className="profile-screen__top">
        <button className="icon-button" onClick={onClose} aria-label="Voltar">
          <ArrowLeft size={21} />
        </button>
        <div>
          <span className="eyebrow">
            {ownProfile ? "seu espaço" : "sobre esta pessoa"}
          </span>
          <b>{ownProfile ? "Editar perfil" : "Perfil"}</b>
        </div>
        <Logo compact />
      </header>

      <div className="profile-screen__scroll">
        <section className="profile-hero">
          <div className="profile-hero__banner">
            {bannerPreview ? (
              <img src={bannerPreview} alt="" />
            ) : (
              <span>
                <Sparkles size={20} />
              </span>
            )}
          </div>
          <div className="profile-hero__identity">
            <Avatar
              name={user.displayName}
              avatarUrl={avatarPreview}
              avatarMediaType={avatarMediaType}
              presence={userPresenceForChat(user)}
              size="large"
            />
            <div>
              <h2>{user.displayName}</h2>
            </div>
          </div>
        </section>

        {ownProfile ? (
          <form className="profile-form" onSubmit={save}>
            <label>
              Nome de exibição
              <input
                value={displayName}
                minLength={2}
                maxLength={40}
                required
                onChange={(event) => setDisplayName(event.target.value)}
              />
            </label>
            <label>
              Bio
              <textarea
                value={bio}
                maxLength={300}
                rows={4}
                placeholder="Conte um pouco sobre você…"
                onChange={(event) => setBio(event.target.value)}
              />
              <small>{bio.length}/300</small>
            </label>
            <div className="profile-media-fields">
              <label className="profile-file">
                <Camera size={19} />
                <span>
                  <b>Foto, GIF ou vídeo</b>
                  <small>JPG, PNG, WebP, GIF até 8 MB; MP4/WebM até 12 MB</small>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                  onChange={(event) => setAvatar(event.target.files?.[0])}
                />
              </label>
              <label className="profile-file">
                <ImageIcon size={19} />
                <span>
                  <b>Banner</b>
                  <small>JPG, PNG, WebP ou GIF até 8 MB</small>
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={(event) => setBanner(event.target.files?.[0])}
                />
              </label>
            </div>
            {error && <div className="form-error">{error}</div>}
            {saved && (
              <div className="profile-success">
                <Check size={16} /> Perfil atualizado.
              </div>
            )}
            <button className="button button--primary" disabled={busy}>
              {busy ? "Salvando…" : "Salvar perfil"}
            </button>
          </form>
        ) : (
          <section className="profile-about">
            <span>Bio</span>
            <p>{user.bio || "Esta pessoa ainda não escreveu uma bio."}</p>
            <div>
              <i
                className={`presence-key presence-key--${userPresenceForChat(user)}`}
              />
              {user.presenceState === "away"
                ? "Ausente agora"
                : "Com o CaosChat aberto"}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SettingsScreen({
  currentUser,
  folders,
  chats,
  onClose,
  onOpenProfile,
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onLogout,
}: {
  currentUser: User;
  folders: ChatFolder[];
  chats: Chat[];
  onClose: () => void;
  onOpenProfile: () => void;
  onCreateFolder: (name: string, chatIds: string[]) => Promise<void>;
  onUpdateFolder: (
    folderId: string,
    name: string,
    chatIds: string[],
  ) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onLogout: () => void;
}) {
  const [section, setSection] = useState<"root" | "folders">("root");
  const [editing, setEditing] = useState<ChatFolder | "new" | null>(null);
  const [name, setName] = useState("");
  const [chatIds, setChatIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const startEditing = (folder: ChatFolder | "new") => {
    setEditing(folder);
    setName(folder === "new" ? "" : folder.name);
    setChatIds(folder === "new" ? [] : folder.chatIds);
    setError("");
  };

  const saveFolder = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (editing === "new") await onCreateFolder(name, chatIds);
      if (editing && editing !== "new") {
        await onUpdateFolder(editing.id, name, chatIds);
      }
      setEditing(null);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  };

  const goBack = () => {
    if (editing) {
      setEditing(null);
      return;
    }
    if (section === "folders") {
      setSection("root");
      return;
    }
    onClose();
  };

  return (
    <div className="settings-screen">
      <header className="profile-screen__top">
        <button className="icon-button" onClick={goBack} aria-label="Voltar">
          <ArrowLeft size={21} />
        </button>
        <div>
          <span className="eyebrow">organize seu espaço</span>
          <b>
            {editing
              ? editing === "new"
                ? "Nova pasta"
                : "Editar pasta"
              : section === "folders"
                ? "Conversas"
                : "Configurações"}
          </b>
        </div>
        <Settings className="settings-screen__mark" size={20} />
      </header>

      <div className="settings-screen__body">
        {section === "root" ? (
          <div className="settings-list">
            <button onClick={onOpenProfile}>
              <Avatar
                name={currentUser.displayName}
                avatarUrl={currentUser.avatarUrl}
                avatarMediaType={currentUser.avatarMediaType}
                size="medium"
              />
              <span>
                <b>Configuração de perfil</b>
                <small>Nome, bio, avatar e banner</small>
              </span>
              <ChevronRight size={18} />
            </button>
            <button onClick={() => setSection("folders")}>
              <span className="settings-list__icon">
                <Folder size={20} />
              </span>
              <span>
                <b>Conversas</b>
                <small>Pastas e organização da lista</small>
              </span>
              <ChevronRight size={18} />
            </button>
            <button className="settings-list__logout" onClick={onLogout}>
              <span className="settings-list__icon">
                <LogOut size={19} />
              </span>
              <span>
                <b>Sair do CaosChat</b>
                <small>Encerrar esta sessão</small>
              </span>
            </button>
          </div>
        ) : editing ? (
          <form className="folder-editor" onSubmit={saveFolder}>
            <label>
              Nome da pasta
              <input
                autoFocus
                value={name}
                maxLength={24}
                required
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Trabalho"
              />
            </label>
            <div className="folder-editor__chats">
              <span>Conversas nesta pasta</span>
              {chats.map((chat) => {
                const checked = chatIds.includes(chat.id);
                return (
                  <button
                    type="button"
                    key={chat.id}
                    onClick={() =>
                      setChatIds((current) =>
                        checked
                          ? current.filter((id) => id !== chat.id)
                          : [...current, chat.id],
                      )
                    }
                  >
                    <span className={`checkbox ${checked ? "checked" : ""}`}>
                      {checked && <Check size={14} />}
                    </span>
                    <span>
                      <b>{chat.name}</b>
                      <small>
                        {chat.type === "direct"
                          ? "Conversa"
                          : chat.type === "group"
                            ? "Grupo"
                            : "Canal"}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="folder-editor__actions">
              {editing !== "new" && (
                <button
                  type="button"
                  className="button folder-editor__delete"
                  onClick={() => {
                    if (editing !== "new") {
                      void onDeleteFolder(editing.id).then(() =>
                        setEditing(null),
                      );
                    }
                  }}
                >
                  Remover
                </button>
              )}
              <button
                className="button button--primary"
                disabled={busy || !name.trim()}
              >
                {busy ? "Salvando…" : "Salvar pasta"}
              </button>
            </div>
          </form>
        ) : (
          <div className="folders-settings">
            <div className="folders-settings__intro">
              <div>
                <span className="eyebrow">até 10 pastas</span>
                <h2>Suas conversas, do seu jeito.</h2>
              </div>
              <button
                className="button button--soft"
                disabled={folders.length >= 10}
                onClick={() => startEditing("new")}
              >
                <Plus size={17} /> Nova pasta
              </button>
            </div>
            <div className="folders-settings__list">
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  disabled={folder.kind !== "custom"}
                  onClick={() => startEditing(folder)}
                >
                  <span className="settings-list__icon">
                    <Folder size={19} />
                  </span>
                  <span>
                    <b>{folder.name}</b>
                    <small>
                      {folder.chatIds.length} conversas ·{" "}
                      {folder.kind === "custom" ? "Personalizada" : "Padrão"}
                    </small>
                  </span>
                  {folder.kind === "custom" && <ChevronRight size={17} />}
                </button>
              ))}
            </div>
            <small className="folders-settings__limit">
              {folders.length}/10 pastas em uso
            </small>
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelInviteModal({
  chat,
  onClose,
}: {
  chat: Chat;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const inviteLink = `${window.location.origin}/join/${chat.channelToken}`;
  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        className="modal channel-invite"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal__header">
          <div>
            <span className="eyebrow">convite do canal</span>
            <h2>{chat.name}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="channel-invite__qr">
          <QRCodeSVG
            value={inviteLink}
            size={184}
            level="M"
            bgColor="#ffffff"
            fgColor="#174f47"
          />
        </div>
        <p>Escaneie o QR Code ou compartilhe o link para entrar no canal.</p>
        <div className="channel-invite__link">
          <span>{inviteLink}</span>
          <button onClick={() => void copyLink()} aria-label="Copiar link">
            {copied ? <Check size={17} /> : <Copy size={17} />}
          </button>
        </div>
        <button
          className="button button--primary"
          onClick={() => {
            if (navigator.share) {
              void navigator.share({ title: chat.name, url: inviteLink });
            } else {
              void copyLink();
            }
          }}
        >
          <Share2 size={17} /> Compartilhar convite
        </button>
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
  onCurrentUserChange,
  initialChatId,
}: {
  currentUser: User;
  onLogout: () => void;
  onCurrentUserChange: (user: User) => void;
  initialChatId?: string | null;
}) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [folders, setFolders] = useState<ChatFolder[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(
    initialChatId ?? null,
  );
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatMode, setNewChatMode] = useState<
    "direct" | "group" | "channel"
  >("direct");
  const [showOverflow, setShowOverflow] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [channelInvite, setChannelInvite] = useState<Chat | null>(null);
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [notice, setNotice] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const currentUserRef = useRef(currentUser);
  const selectedChatRef = useRef<string | null>(null);
  const presenceChatRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  currentUserRef.current = currentUser;

  const loadChats = async () => {
    try {
      const result = await api.chats();
      setChats(result.chats);
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Erro ao buscar conversas.");
    }
  };

  const loadFolders = async () => {
    try {
      const result = await api.folders();
      setFolders(result.folders);
      setActiveFolderId((current) =>
        current && result.folders.some((folder) => folder.id === current)
          ? current
          : result.folders[0]?.id ?? null,
      );
    } catch (caught) {
      setNotice(
        caught instanceof Error ? caught.message : "Erro ao buscar pastas.",
      );
    }
  };

  useEffect(() => {
    if (!initialChatId) return;
    void Promise.all([loadChats(), loadFolders()]).then(() =>
      setSelectedChatId(initialChatId),
    );
  }, [initialChatId]);

  const applyUserUpdate = (updated: User) => {
    if (updated.id === currentUser.id) onCurrentUserChange(updated);
    setUsers((current) =>
      current.map((user) => (user.id === updated.id ? updated : user)),
    );
    setChats((current) =>
      current.map((chat) => ({
        ...chat,
        name:
          chat.type === "direct" &&
          chat.members.some((member) => member.id === updated.id) &&
          updated.id !== currentUser.id
            ? updated.displayName
            : chat.name,
        members: chat.members.map((member) =>
          member.id === updated.id ? updated : member,
        ),
      })),
    );
    setProfileUser((shown) => (shown?.id === updated.id ? updated : shown));
  };

  const openProfile = async (userId: string) => {
    try {
      const { user } = await api.profile(userId);
      setProfileUser(user);
    } catch (caught) {
      setNotice(
        caught instanceof Error ? caught.message : "Perfil não encontrado.",
      );
    }
  };

  useEffect(() => {
    void Promise.all([
      loadChats(),
      loadFolders(),
      api.users().then((result) => setUsers(result.users)),
    ]);

    const socket = io();
    socketRef.current = socket;
    socket.on("connect", () => {
      socket.emit("receipts:sync");
      const chatId = presenceChatRef.current;
      socket.emit("presence:report", {
        state:
          document.visibilityState !== "visible" || !document.hasFocus()
            ? "away"
            : chatId
              ? "in_chat"
              : "app",
        ...(chatId && { chatId }),
      });
    });
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
        if (message.chatId === presenceChatRef.current) {
          socket.emit("chat:read", message.chatId);
        }
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
    socket.on("chats:refresh", () => {
      void Promise.all([loadChats(), loadFolders()]);
    });
    socket.on(
      "presence:changed",
      (presence: {
        userId: string;
        state: User["presenceState"];
        chatId: string | null;
        lastSeenAt: string | null;
      }) => {
        const updateUser = (user: User) =>
          user.id === presence.userId
            ? {
                ...user,
                online: presence.state !== "away",
                presenceState: presence.state,
                activeChatId: presence.chatId,
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
        if (presence.userId === currentUser.id) {
          onCurrentUserChange(updateUser(currentUserRef.current));
        }
        setProfileUser((shown) => (shown ? updateUser(shown) : shown));
      },
    );
    socket.on("profile:updated", (updated: User) => applyUserUpdate(updated));
    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const reportPresence = () => {
      const chatId = presenceChatRef.current;
      const foreground =
        document.visibilityState === "visible" && document.hasFocus();
      if (socketRef.current?.connected) {
        socketRef.current.emit("presence:report", {
          state: foreground ? (chatId ? "in_chat" : "app") : "away",
          ...(foreground && chatId && { chatId }),
        });
        if (foreground && chatId) socketRef.current.emit("chat:read", chatId);
      }
    };
    const heartbeat = window.setInterval(reportPresence, 15_000);
    window.addEventListener("focus", reportPresence);
    window.addEventListener("blur", reportPresence);
    document.addEventListener("visibilitychange", reportPresence);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("focus", reportPresence);
      window.removeEventListener("blur", reportPresence);
      document.removeEventListener("visibilitychange", reportPresence);
    };
  }, []);

  useEffect(() => {
    const chatId =
      profileUser || showNewChat || showSettings || channelInvite
        ? null
        : selectedChatId;
    presenceChatRef.current = chatId;
    if (socketRef.current?.connected && document.visibilityState === "visible") {
      socketRef.current.emit("presence:report", {
        state: chatId ? "in_chat" : "app",
        ...(chatId && { chatId }),
      });
    }
  }, [
    channelInvite,
    profileUser,
    selectedChatId,
    showNewChat,
    showSettings,
  ]);

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
    const activeFolder = folders.find(
      (folder) => folder.id === activeFolderId,
    );
    const folderChats = activeFolder
      ? chats.filter((chat) => activeFolder.chatIds.includes(chat.id))
      : chats;
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return folderChats;
    return folderChats.filter(
      (chat) =>
        chat.name.toLocaleLowerCase("pt-BR").includes(normalized) ||
        chat.lastMessage?.body.toLocaleLowerCase("pt-BR").includes(normalized),
    );
  }, [activeFolderId, chats, folders, search]);

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
    await Promise.all([loadChats(), loadFolders()]);
    setSelectedChatId(chat.id);
    setShowNewChat(false);
  };

  const createGroup = async (name: string, memberIds: string[]) => {
    const { chat } = await api.createGroup(name, memberIds);
    await Promise.all([loadChats(), loadFolders()]);
    setSelectedChatId(chat.id);
    setShowNewChat(false);
  };

  const createChannel = async (name: string, memberIds: string[]) => {
    const { chat } = await api.createChannel(name, memberIds);
    await Promise.all([loadChats(), loadFolders()]);
    setSelectedChatId(chat.id);
    setShowNewChat(false);
    setChannelInvite(chat);
  };

  const openNewChat = (mode: "direct" | "group" | "channel" = "direct") => {
    setNewChatMode(mode);
    setShowOverflow(false);
    setShowNewChat(true);
  };

  const createCustomFolder = async (name: string, chatIds: string[]) => {
    await api.createFolder(name, chatIds);
    await loadFolders();
  };

  const updateCustomFolder = async (
    folderId: string,
    name: string,
    chatIds: string[],
  ) => {
    await api.updateFolder(folderId, name, chatIds);
    await loadFolders();
  };

  const deleteCustomFolder = async (folderId: string) => {
    await api.deleteFolder(folderId);
    if (activeFolderId === folderId) setActiveFolderId(null);
    await loadFolders();
  };

  return (
    <main className={`messenger ${selectedChat ? "messenger--chat-open" : ""}`}>
      <aside className="sidebar">
        <header className="sidebar__top">
          <Logo />
          <button
            className="icon-button"
            onClick={() => setShowOverflow((current) => !current)}
            aria-label="Abrir menu"
          >
            <MoreVertical size={20} />
          </button>
          {showOverflow && (
            <div className="overflow-menu">
              <button onClick={() => openNewChat("group")}>
                <Users size={17} /> Novo grupo
              </button>
              <button onClick={() => openNewChat("channel")}>
                <Megaphone size={17} /> Novo canal
              </button>
              <button
                onClick={() => {
                  setShowOverflow(false);
                  setShowSettings(true);
                }}
              >
                <Settings size={17} /> Configurações
              </button>
            </div>
          )}
        </header>
        <div className="sidebar__inbox-heading">
          <div>
            <span>Conversas</span>
            <small>{chats.length} conversas</small>
          </div>
        </div>
        <div className="folder-tabs" role="tablist" aria-label="Pastas">
          {folders.map((folder) => (
            <button
              key={folder.id}
              role="tab"
              aria-selected={folder.id === activeFolderId}
              className={folder.id === activeFolderId ? "active" : ""}
              onClick={() => setActiveFolderId(folder.id)}
            >
              {folder.name}
              {folder.chatIds.length > 0 && <span>{folder.chatIds.length}</span>}
            </button>
          ))}
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
                  channel={chat.type === "channel"}
                  avatarUrl={chat.type === "direct" ? other?.avatarUrl : null}
                  avatarMediaType={
                    chat.type === "direct" ? other?.avatarMediaType : null
                  }
                  presence={chatPresence(chat, currentUser.id)}
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
                  : "Use o botão + para iniciar uma conversa."}
              </span>
            </div>
          )}
        </nav>
        <footer className="sidebar__bottom">
          <button className="active">
            <MessagesSquare size={20} />
            <span>Conversas</span>
          </button>
          <button onClick={() => setShowSettings(true)}>
            <Settings size={20} />
            <span>Ajustes</span>
          </button>
          <button
            className="sidebar__fab"
            onClick={() => openNewChat("direct")}
            aria-label="Nova conversa"
          >
            <Plus size={24} />
          </button>
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
              <button
                className="conversation__person"
                disabled={selectedChat.type !== "direct"}
                onClick={() => {
                  const other = selectedChat.members.find(
                    (member) => member.id !== currentUser.id,
                  );
                  if (other) void openProfile(other.id);
                }}
              >
                <Avatar
                  name={selectedChat.name}
                  group={selectedChat.type === "group"}
                  channel={selectedChat.type === "channel"}
                  avatarUrl={
                    selectedChat.type === "direct"
                      ? selectedChat.members.find(
                          (member) => member.id !== currentUser.id,
                        )?.avatarUrl
                      : null
                  }
                  avatarMediaType={
                    selectedChat.type === "direct"
                      ? selectedChat.members.find(
                          (member) => member.id !== currentUser.id,
                        )?.avatarMediaType
                      : null
                  }
                  presence={chatPresence(selectedChat, currentUser.id)}
                  size="small"
                />
                <span className="conversation__person-copy">
                  <b>{selectedChat.name}</b>
                  <small
                    className={
                      chatPresence(selectedChat, currentUser.id) === "in_chat"
                        ? "online-text"
                        : ""
                    }
                  >
                    {presenceText(selectedChat, currentUser.id)}
                  </small>
                </span>
              </button>
              {selectedChat.type === "channel" && (
                <button
                  className="icon-button conversation__invite"
                  onClick={() => setChannelInvite(selectedChat)}
                  aria-label="Compartilhar canal"
                >
                  <QrCode size={19} />
                </button>
              )}
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
                          <span className="message-bubble__text">
                            {message.body}
                          </span>
                          <div className="message-meta">
                            <time dateTime={message.createdAt}>
                              {formatMessageTime(message.createdAt)}
                            </time>
                            {sent && <MessageTicks message={message} />}
                          </div>
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

            {selectedChat.type === "channel" &&
            selectedChat.createdBy !== currentUser.id ? (
              <div className="channel-readonly">
                <Megaphone size={17} />
                Somente o dono publica neste canal.
              </div>
            ) : (
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
                    placeholder={
                      selectedChat.type === "channel"
                        ? "Publicar no canal…"
                        : "Escreva uma mensagem…"
                    }
                    aria-label="Mensagem"
                  />
                  <span>
                    {draft.length > 3_800 ? 4_000 - draft.length : ""}
                  </span>
                </div>
                <button
                  className="send-button"
                  disabled={!draft.trim()}
                  aria-label="Enviar mensagem"
                >
                  <Send size={20} />
                </button>
              </form>
            )}
          </>
        ) : (
          <EmptyConversation onNewChat={() => setShowNewChat(true)} />
        )}
      </section>

      {showNewChat && (
        <NewChatModal
          users={users}
          initialMode={newChatMode}
          onClose={() => setShowNewChat(false)}
          onCreateDirect={createDirect}
          onCreateGroup={createGroup}
          onCreateChannel={createChannel}
        />
      )}
      {showSettings && (
        <SettingsScreen
          currentUser={currentUser}
          folders={folders}
          chats={chats}
          onClose={() => setShowSettings(false)}
          onOpenProfile={() => void openProfile(currentUser.id)}
          onCreateFolder={createCustomFolder}
          onUpdateFolder={updateCustomFolder}
          onDeleteFolder={deleteCustomFolder}
          onLogout={onLogout}
        />
      )}
      {profileUser && (
        <ProfileScreen
          user={profileUser}
          ownProfile={profileUser.id === currentUser.id}
          onClose={() => setProfileUser(null)}
          onSaved={(updated) => {
            applyUserUpdate(updated);
            setProfileUser(updated);
          }}
        />
      )}
      {channelInvite && (
        <ChannelInviteModal
          chat={channelInvite}
          onClose={() => setChannelInvite(null)}
        />
      )}
      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [joinedChatId, setJoinedChatId] = useState<string | null>(null);
  const [joinNotice, setJoinNotice] = useState("");

  useEffect(() => {
    api
      .me()
      .then(({ user }) => setCurrentUser(user))
      .catch(() => setCurrentUser(null))
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const match = window.location.pathname.match(/^\/join\/([A-Za-z0-9_-]{16})$/);
    if (!match) return;
    api
      .joinChannel(match[1])
      .then(({ chat }) => {
        setJoinedChatId(chat.id);
        setJoinNotice(`Você entrou no canal ${chat.name}.`);
        window.history.replaceState({}, "", "/");
      })
      .catch((caught) => {
        setJoinNotice(
          caught instanceof Error ? caught.message : "Convite de canal inválido.",
        );
      });
  }, [currentUser]);

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

  return (
    <>
      <Messenger
        currentUser={currentUser}
        onLogout={() => void logout()}
        onCurrentUserChange={setCurrentUser}
        initialChatId={joinedChatId}
      />
      {joinNotice && <div className="toast">{joinNotice}</div>}
    </>
  );
}
