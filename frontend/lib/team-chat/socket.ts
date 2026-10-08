import { io, type Socket } from "socket.io-client";
import { getStoredAccessToken, refreshAccessToken } from "@/lib/api";
import { isPlatformHost } from "@/lib/platform-hosts";

export type ChatConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "no-access"
  | "ended";

/** Codes the server sends in connect_error / access:revoked. */
const REFRESHABLE = new Set(["TOKEN_EXPIRED", "TOKEN_INVALID", "TOKEN_MISSING"]);
const FINAL = new Set(["ORG_INACTIVE", "USER_INACTIVE", "ORG_NOT_READY", "NO_ORG_ACCESS"]);

/**
 * Team Chat runs on the app host only, never on an organisation's custom
 * domain (proxy.ts still serves /org/* there). The API enforces the same
 * thing with its socket origin allow-list (FRONTEND_URL).
 */
export function isChatHost(): boolean {
  return typeof window !== "undefined" && isPlatformHost(window.location.host);
}

/**
 * Where the chat socket connects. NEXT_PUBLIC_CHAT_WS_URL points at the API
 * directly (local dev: http://localhost:3000); unset, the page's own origin
 * is used, where nginx proxies /socket.io/ to the API.
 */
export function chatSocketUrl(): string {
  const configured = process.env.NEXT_PUBLIC_CHAT_WS_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return typeof window === "undefined" ? "" : window.location.origin;
}

interface Callbacks {
  onStatus: (status: ChatConnectionStatus) => void;
  /** Connected again after a drop: refetch anything that may have been missed. */
  onResync: () => void;
}

/**
 * One Socket.IO connection to the `/team-chat` namespace with token handling:
 * the handshake reads the current access token each time, an expired or
 * rejected token is refreshed once and the socket reconnects, and a
 * permission loss stops reconnecting for good.
 */
export function createChatSocket({ onStatus, onResync }: Callbacks) {
  let everConnected = false;
  let stopped = false;
  let refreshing = false;

  const socket: Socket = io(`${chatSocketUrl()}/team-chat`, {
    path: "/socket.io",
    autoConnect: false,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    auth: (cb) => cb({ token: getStoredAccessToken() ?? "" }),
  });

  const stop = (status: ChatConnectionStatus) => {
    stopped = true;
    onStatus(status);
    socket.disconnect();
  };

  const refreshAndReconnect = async () => {
    if (refreshing || stopped) return;
    refreshing = true;
    onStatus("reconnecting");
    try {
      const ok = await refreshAccessToken();
      if (!ok) return stop("ended");
      if (!stopped) socket.connect();
    } finally {
      refreshing = false;
    }
  };

  const handleCode = (code: string | undefined) => {
    if (code === "NO_CHAT_ACCESS") return stop("no-access");
    if (code && FINAL.has(code)) return stop("ended");
    if (code && REFRESHABLE.has(code)) return void refreshAndReconnect();
    return undefined;
  };

  socket.on("connect", () => {
    onStatus("connected");
    if (everConnected) onResync();
    everConnected = true;
  });

  socket.on("connect_error", (err: Error & { data?: { code?: string } }) => {
    if (stopped) return;
    const code = err.data?.code;
    if (code) {
      handleCode(code);
      return;
    }
    // Network / server down: socket.io keeps retrying on its own.
    onStatus("reconnecting");
  });

  // The server cuts the socket when the token expires; refresh and come back.
  socket.on("session:expired", () => void refreshAndReconnect());
  socket.on("access:revoked", (p: { code?: string }) => {
    handleCode(p?.code ?? "NO_CHAT_ACCESS");
  });

  socket.on("disconnect", (reason) => {
    if (stopped) return;
    if (reason === "io server disconnect") {
      // Server-initiated: session:expired / access:revoked decide what next.
      // If neither arrived (e.g. the API restarted cleanly), try again.
      window.setTimeout(() => {
        if (!stopped && !refreshing && !socket.connected) void refreshAndReconnect();
      }, 1500);
    }
    onStatus("reconnecting");
  });

  onStatus("connecting");
  socket.connect();

  return {
    socket,
    close: () => stop("ended"),
  };
}
