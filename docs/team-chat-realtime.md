# Team Chat — real-time (Socket.IO)

Team Chat's live updates run on the existing API process: no Redis and no extra service. The API (NestJS, port 3000) hosts a Socket.IO namespace. Browsers connect to it directly, or through nginx in production.

| | |
|---|---|
| Namespace | `/team-chat` |
| Path | `/socket.io` (Socket.IO default) |
| Auth | `auth: { token: "<access JWT>" }` in the handshake, the same Bearer token as REST |
| Process | Single API instance. State (rooms, presence counters) is in memory. |

## Auth and access

The handshake runs the same checks as `JwtAuthGuard` + `OrgApprovedGuard`, through the shared `verifyAccessToken` / `assertOrgSessionActive`, plus `team_chat:view`.

A rejected connection gets a `connect_error` with `err.data.code`:

| Code | Client does |
|---|---|
| `TOKEN_MISSING`, `TOKEN_INVALID`, `TOKEN_EXPIRED` | Refreshes the access token once and reconnects |
| `NO_CHAT_ACCESS` | Stops and shows "You don't have access to Team Chat — ask your admin" |
| `ORG_INACTIVE`, `USER_INACTIVE`, `ORG_NOT_READY`, `NO_ORG_ACCESS` | Stops. The next REST call logs the user out, as everywhere else. |

While a socket is connected, the server keeps checking it:

- **Token expiry:** the server emits `session:expired` and disconnects. The client refreshes the token and reconnects.
- **Access changes:** the server re-runs the checks for affected users straight away. If they fail, it emits `access:revoked { code }` and disconnects. These changes trigger a re-check:
  - a user is disabled, deleted or edited (role or password)
  - per-user permissions change
  - org role permissions change
  - system role defaults change
  - org status changes
- **Backstop:** every connected socket is also re-checked every 60 s.

The re-check signals go through `src/common/utils/team-chat-bus.ts`, an in-process EventEmitter.

## Rooms

| Room | Joined by |
|---|---|
| `user:<userId>` | Every socket of that user (all tabs and devices) |
| `conv:<conversationId>` | Sockets of the conversation's members. Joined at connect, then kept in step when members are added or removed and when channels are created or deleted. A removed member leaves the room at once. |
| `org:<orgId>` | Presence updates |

DMs are rooms with exactly their two participants, so no other user (an org admin included) ever receives a DM's events.

## Events

**Server → client.** All of these are emitted only after the database write has committed.

| Event | Payload |
|---|---|
| `message:new` | The full message. It includes `clientMsgId` so the sender can match its optimistic bubble. |
| `message:updated` | The full message (edit, pin, unpin) |
| `message:deleted` | `{ id, conversationId, deletedAt }` |
| `pins:updated` | `{ conversationId }` |
| `reaction:updated` | `{ conversationId, messageId, reactions }`. Clients work out "mine" from `reactions[].users`. |
| `conversation:created` / `conversation:updated` | `{ conversationId }`. The client refetches `GET /org/team-chat/conversations/:id`. |
| `conversation:removed` | `{ conversationId, reason: deleted \| removed \| left }` |
| `members:updated` | `{ conversationId }` |
| `unread:update` | `{ conversationId, unread, conversations: {id: n}, totalUnread }` |
| `presence:update` | `{ userId, online, lastSeenAt }` |
| `typing:update` | `{ conversationId, userId, name, typing }` |
| `session:expired`, `access:revoked` | See above |

**Client → server:** only these two.

| Event | Payload | Notes |
|---|---|---|
| `typing:start` | `{ conversationId }` | Throttled to one per 2 s per socket and conversation. Ignored unless the socket is in that conversation's room. Never stored. |
| `typing:stop` | `{ conversationId }` | |

Everything else is plain REST. After a reconnect, the client refetches the conversation list and calls `GET …/messages?after=<newest cursor>` for the open conversation.

## Presence

- **Connections:** an in-memory connection counter per user.
- **First socket connects:** `presence:update { online: true }`.
- **Last socket closes:** after a grace period (`TEAM_CHAT_PRESENCE_GRACE_MS`, default 10 s) with no reconnect, `team_chat_presence.last_seen_at` is saved and `presence:update { online: false, lastSeenAt }` is emitted.
- **Who sees it:** presence goes only to the `org:<orgId>` room. Every socket in that room has passed `team_chat:view` for that org.
- **What the REST lists show:** the conversation list and member lists include `online` from the same counter.

The `social_leads` presence module is unrelated and unused here.

## Configuration

**Backend (`backend/.env`):**

| Var | Meaning |
|---|---|
| `CHAT_WS_ORIGINS` | Comma-separated browser origins allowed to open the socket. Defaults to `FRONTEND_URL`. List the app host only. |
| `TEAM_CHAT_PRESENCE_GRACE_MS` | Optional. Default 10000. |
| `JWT_ACCESS_EXPIRES_IN` | Existing. Sockets are cut at token expiry. Set it to `1m` locally to test refresh and reconnect. |

**Frontend (build-time env):**

| Var | Meaning |
|---|---|
| `NEXT_PUBLIC_CHAT_WS_URL` | Where the socket connects. Local dev: `http://localhost:3000`. The browser connects straight to the API; there's no Next proxy, because Next rewrites don't carry WebSocket upgrades. Leave it unset in production: the page's own origin is used, and nginx proxies `/socket.io/` to the API. |

## Production: nginx

Add this to the **app host's** `server { }` block, next to the existing locations:

```nginx
# Team Chat real-time (Socket.IO) -> API container
location /socket.io/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # Long-lived connections: Socket.IO pings every 25 s; these only need to
    # exceed that comfortably.
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}
```

Then run `sudo nginx -t && sudo systemctl reload nginx`.

**Deploy changes:**

- Set `CHAT_WS_ORIGINS=https://<app host>` in the server's `backend/.env`. It can be omitted if `FRONTEND_URL` already equals the app origin.
- Leave `NEXT_PUBLIC_CHAT_WS_URL` unset in production.
- No new containers or ports. `docker-compose.prod.yml` already publishes the API on 3000.
- `deploy.yml` needs no change. The new npm packages come in through `npm ci`:
  - API: `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`
  - web: `socket.io-client`

## App host only, not org custom domains

`frontend/proxy.ts` still serves `/org/*` on org custom domains. Team Chat is limited to the app host in two places:

1. **Server (the real boundary):** the socket's CORS allow-list (`CHAT_WS_ORIGINS`) only accepts the app origin. A page on a custom domain can't open the socket.
2. **Client:** `isChatHost()` (`lib/team-chat/socket.ts`, based on the same platform-host list as `proxy.ts`). Off the app host, the org shell doesn't connect, and `/org/team-chat` says "Team Chat isn't available on this domain".

Don't add the `/socket.io/` location to custom-domain server blocks.

## Scaling note

Rooms and presence live in process memory. Running more than one API instance would need a Socket.IO adapter (for example Redis) and shared presence. That's out of scope while there is one API container.
