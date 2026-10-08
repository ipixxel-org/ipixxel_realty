# Team Chat — As-Is Investigation

_Read-only investigation, 2026-10-07. Branch inspected: `vidya_new` @ `de45b74`, plus every local and remote branch (see §2.1, "Cross-branch status"). No code, schema, config or branches were changed. The only file added is this one._

Legend used throughout:
- **Real / end-to-end**: backend and the UI on `main` are wired together.
- **Backend only**: an API exists, but no UI on `main` calls it.
- **UI only / mock**: rendered in the UI from hardcoded data, with no API behind it.
- **Partial**: some of the pieces exist.

---

## 1. Executive summary

1. **The backend is real; the UI that ships today is a mock.** A `team-chat` NestJS module exists: 5 REST endpoints, 3 Prisma tables, 1 migration (`backend/src/modules/team-chat/*`, `backend/prisma/migrations/20260912120000_add_team_chat/migration.sql`). It is registered in `backend/src/app.module.ts:43,95`.
2. **The `/org/team-chat` page on `main` / `vidya_new` doesn't call the API.** It imports the five API helpers (`frontend/app/org/team-chat/page.tsx:9-15`) but never uses them. Every channel, DM, message, pinned message, member and shared lead comes from hardcoded constants (`page.tsx:51-118`, `588-684`). Sent messages exist only in React state and disappear on reload (`page.tsx:172-197`). Creating a channel or a DM does nothing (`page.tsx:236-243`, `287-289`).
3. **A wired UI existed and was overwritten.** The first version, from commit `a96e227` (2026-09-12, Shubham Kumar), called every endpoint and **polled every 8 s** (`a96e227:frontend/app/org/team-chat/page.tsx:264-285`). Commit `0027a9a` (2026-09-26, a UI redesign) replaced it with a static mock-up, and `07d7027` (2026-09-30) kept it a mock. The wired version still exists unchanged only on `vidya`, `origin/vidya` and `copilot/fix-deploy-to-server-job` (blob `45dc6af3`).
4. **The model is Slack-style channels plus 1:1 DMs, not WhatsApp-style.** It supports plain-text messages, an optional "tagged lead" card, and a per-member `lastReadAt` pointer for unread counts. There are no attachments, edits, deletes, replies, reactions, receipts, typing indicator or presence.
5. **There is no real-time infrastructure anywhere in the repo, on any branch.** I found no WebSocket, Socket.IO, SSE or Redis code, and none in the lockfiles. The API runs as one Docker container with no Redis (`docker-compose.prod.yml`). Auth is a 15-minute Bearer JWT stored in `localStorage`.
6. **The backend has serious defects that must be fixed before any UI is re-wired.**
   - Any org member can open and auto-join any channel or DM by ID, so private DMs are not private (`team-chat.service.ts:86-96`).
   - DM find-or-create is asymmetric and creates duplicate DMs (`:203-214`).
   - There is no pagination: the full history is returned on every poll (`:98-102`).
   - The rail query is N+1 (`:76-78`, `:272-285`).
   - Hard-deleting a user cascades to every channel they created, including other people's messages (`schema.prisma:558`).
7. **Maturity: about 15–20% of a WhatsApp-like product.** What exists is a usable backend MVP for text channels and DMs. On production (`main` deploys, `.github/workflows/deploy.yml:33-36`), users see a fake chat.

---

## 2. Architecture as-is

### 2.1 Discovery: files involved

| Layer | File | Status |
|---|---|---|
| Prisma models | `backend/prisma/schema.prisma:531-608` (`TeamChannel`, `TeamChannelMember`, `TeamMessage`) | Real |
| Migration | `backend/prisma/migrations/20260912120000_add_team_chat/migration.sql` | Real (applied by `prisma migrate deploy` in `deploy.yml:135`; not verified on the prod DB) |
| Nest module | `backend/src/modules/team-chat/team-chat.module.ts` | Real |
| Controller | `backend/src/modules/team-chat/team-chat.controller.ts` | Real |
| Service | `backend/src/modules/team-chat/team-chat.service.ts` (376 lines) | Real |
| DTOs | `backend/src/modules/team-chat/dto/{create-channel,create-dm,create-message}.dto.ts` | Real |
| Registration | `backend/src/app.module.ts:43,95` | Real |
| API client | `frontend/lib/api.ts:1893-1928` (`getTeamChatOverview`, `getTeamChannel`, `createTeamChannel`, `createTeamDm`, `sendTeamMessage`) | Present, **unused on `main`** |
| Types | `frontend/lib/types.ts:2559-2620` | Present |
| Page | `frontend/app/org/team-chat/page.tsx` (690 lines) | **UI only / mock** |
| Styles | `frontend/app/org/team-chat/team-chat.css` (883 lines), also imported globally in `frontend/app/org/layout.tsx:10` | UI |
| Nav entry | `frontend/components/org/shell.tsx:83` (link), `:120` (gated on `teams:view`), `:175` (title) | Real link |
| Entry points | `frontend/app/org/teams/[id]/page.tsx:447-448` ("Open team chat" → `?team=<id>`), `frontend/app/org/teams/page.tsx:398-411`, `frontend/components/org/team-fields.tsx:198-214` | Links only. The current page ignores `?team=` |
| Settings toggle | `frontend/app/org/settings/page.tsx:~2986-2987` ("Team Chat notifications") | **Mock**: static `<Toggle on />`, flagged by the `TODO: static ... not persisted/wired` comment at `:~2993` |
| Tests | None. No spec under `backend/` or `frontend/__tests__/` mentions chat | ❌ |
| Seed data | None (`backend/prisma/seed.ts` has no chat rows) | ❌ |

**Not team chat (reported separately as required):**
- `frontend/app/org/whatsapp/inbox/page.tsx` (101 lines) is a **mock**. It uses hardcoded `CONVERSATIONS` and `MESSAGES` arrays (`:8-27`) and makes no API import. The same is true of all `/org/whatsapp/*` and `/org/calling/*` pages: 14 files, 1,094 lines, none importing `@/lib/api`, all built on hardcoded arrays (e.g. `calling/call-logs/page.tsx:21`, `calling/queue/page.tsx:9`). They arrived in `62d2712` (2026-08-26).
- **Support ticket chat** (`/org/support/[id]`, `/admin-console/support/[id]`) is a separate, real feature. Orgs use it to message the iPixxel team (`5fc47cf`, 2026-09-11). It polls every 15 s (`frontend/app/org/support/[id]/page.tsx:42,118`). It is the pattern Team Chat was copied from (`team-chat.service.ts:57-60`).

#### Git history

| Commit | Date | Author | What changed |
|---|---|---|---|
| `5fc47cf` | 2026-09-11 | shubhamdev33-admin | Support ticket chat (precedent for polling) |
| `a96e227` | 2026-09-12 | Shubham Kumar | **Team chat introduced**: schema, migration, module, API helpers, types, and a **wired** 844-line page with 8 s polling. Bundled with lead forms and billing changes |
| `0027a9a` | 2026-09-26 | Shubham Kumar | "add organization dashboard pages, UI components" rewrote `team-chat/page.tsx` (+/-1343) into a **static mock** and added `team-chat.css`. The wiring was lost; the commit message doesn't mention it |
| `07d7027` | 2026-09-30 | shubhamdev33-admin | Converted the chat modals to full-width in-page views. The commit message says "API calls are unchanged", which is true only because there were none left |

The backend service is byte-identical on every branch that has it (blob `a7c01301`). It hasn't been touched since `a96e227`.

#### Cross-branch status

| Branch(es) | `team-chat/page.tsx` | Meaning |
|---|---|---|
| `main`, `vidya_new`, `social_leads`, `origin/main`, `origin/feature`, `origin/vidya_new`, `old-origin/*` (most) | `1e343856` (= `07d7027`) | Mock |
| `shubham`, `origin/shubham`, `old-origin/vidya_new` | `f5f5f2da` (= `0027a9a`) | Mock (pre-FormPage) |
| `vidya`, `origin/vidya`, `*/copilot/fix-deploy-to-server-job` | `45dc6af3` (= `a96e227`) | **Wired version, 8 s polling** |
| `fixes`, `origin/prod`, `origin/fixes` | n/a | Predates team chat |

**Unmerged and relevant:** `social_leads` commit `bcfcc65` (2026-10-05, VidyaChandrub, "temp - activity tracker") adds a `presence` module. It provides `POST /presence/heartbeat` and `GET /admin/presence/live`, a `UserPageSession` table, and a 30 s client heartbeat (`social_leads:frontend/hooks/usePagePresence.ts:16,118`). It tracks *which page* a user is on so super-admins can see who is stuck. It is **not chat presence**, but it's the closest thing to an online/last-seen signal in the repo. It isn't on `main`.

No branch contains WebSocket, SSE, Redis or any other chat work. `git grep` across all refs for `websocket|socket.io|@nestjs/websockets|ioredis|redis|EventSource|text/event-stream|@Sse|WebSocketGateway|bullmq|pusher|ably` only matches comments that say "no websockets".

### 2.2 Data model

All three tables live in `@@schema("access")`.

**`TeamChannel`** → `access.team_channels` (`schema.prisma:542-567`)

| Field | Type | Notes |
|---|---|---|
| `id` | String uuid PK | |
| `orgId` | String → `Organisation` (Cascade) | Tenant key |
| `kind` | String, default `"channel"` | `channel` or `dm`. A free string, not an enum |
| `name` | String | For DMs: the *other* user's display name, as a snapshot (`service:223`) |
| `teamId` | String? → `Team` (SetNull) | Team-linked channel |
| `dmUserId` | String? → `User` (SetNull) | For DMs: "the other participant (never the creator)" |
| `createdById` | String (non-null) → `User?` (**Cascade**) | |
| `createdAt` / `updatedAt` | DateTime | `updatedAt` is not used for ordering anywhere |

Indexes: `@@index([orgId])`, `@@index([teamId])`. There is no unique constraint on DM pairs.

**`TeamChannelMember`** → `access.team_channel_members` (`schema.prisma:572-585`)

| Field | Type | Notes |
|---|---|---|
| `channelId` | String → `TeamChannel` (Cascade) | Composite PK |
| `userId` | String → `User` (Cascade) | Composite PK |
| `lastReadAt` | DateTime? | Per-user read pointer. Null means never opened |
| `joinedAt` | DateTime | |

`@@id([channelId, userId])`, `@@index([userId])`. **No `orgId` column**, so tenancy is inherited through the channel. There is no role, mute, pin or archive field.

**`TeamMessage`** → `access.team_messages` (`schema.prisma:587-608`)

| Field | Type | Notes |
|---|---|---|
| `id` | String uuid PK | No client-generated idempotency key |
| `channelId` | → `TeamChannel` (Cascade) | |
| `orgId` | → `Organisation` (Cascade) | Denormalised tenant key |
| `senderId` | → `User` (**Cascade**) | |
| `body` | String (TEXT) | DTO max 5000 |
| `leadId` | String? → `Lead` (SetNull) | "Tagged lead" card |
| `assignedTo` | String? | Free-text label |
| `createdAt` | DateTime(3) | Millisecond precision. The only ordering key |

Indexes: `@@index([channelId, createdAt])`, `@@index([orgId])`.

**Answers to the data-model questions:**
- **Conversations:** two kinds. Channels can be ad-hoc or team-linked, and are created manually. DMs are 1:1. There are no project-based or auto-created chats. A team link auto-joins team members **only at creation** (`service:152-162`). Members who join or leave the team later are not synced.
- **Participants:** `TeamChannelMember` rows. Membership is also created implicitly by any read or post (see §3.3).
- **Read state:** one `lastReadAt` pointer per member. There are no per-message receipts and no "delivered" state.
- **Attachments:** none. There is no column or table.
- **Soft delete, edit history, reply/parent, reactions, pinned/muted/archived:** none.
- **Tenant isolation:** `TeamChannel` and `TeamMessage` carry `orgId`. `TeamChannelMember` doesn't. Every service query scopes by `orgId`, either directly or via `getOwned` (`service:313-324`) or `channel: { orgId }` (`service:71`). I found **no cross-org read path**. Neither the DB nor any FK enforces that `TeamMessage.orgId` matches `channel.orgId`, or that `leadId` and member `userId` belong to the same org. Only application checks enforce it (`service:191-197`, `326-334`).
- **Indexes for typical chat queries:**
  - Messages by conversation, ordered by time: ✅ covered by `(channel_id, created_at)`. There is no `id` tie-breaker for cursor paging.
  - Unread count: ✅ uses the same index (`channelId` + `createdAt > since`). It runs once per channel per poll, though.
  - Conversation list sorted by last message: ❌. There's no `lastMessageAt` column on `team_channels`. The list is ordered by `joinedAt` (`service:72`) and computed per channel.
  - The membership lookup by user is ✅ `user_id`, but the `channel.orgId` filter needs a join.

### 2.3 API surface

All routes use `@UseGuards(JwtAuthGuard, OrgApprovedGuard)` at controller level (`team-chat.controller.ts:17`). **No `@RequirePermission` / `PermissionGuard`.**

| Method | Path | Request DTO | Response | Service method |
|---|---|---|---|---|
| GET | `/org/team-chat` | — | `{ channels: Summary[], dms: Summary[] }` (all memberships, no paging) | `overview` (`service:69-84`) |
| POST | `/org/team-chat/channels` | `CreateChannelDto { name ≤120, teamId? uuid }` | `Summary` | `createChannel` (`service:146-188`) |
| POST | `/org/team-chat/dms` | `CreateDmDto { userId uuid }` | `Detail` (full thread) | `createDm` (`service:190-230`) |
| GET | `/org/team-chat/channels/:id` | — | `{ channel, messages[] (ALL), members[], sharedLeads[] }`. **Side effects: auto-join and mark read** | `getChannel` (`service:86-140`) |
| POST | `/org/team-chat/channels/:id/messages` | `CreateMessageDto { body ≤5000, leadId? uuid, assignedTo? ≤120 }` | `Message` | `addMessage` (`service:232-266`) |

`Summary` = `{ id, kind, name, teamId, otherUser?, unread, lastMessagePreview (≤90 chars), lastMessageAt, memberCount }` (`service:287-306`).

**Missing endpoints:** list or search channels, rename, delete, leave, add or remove members, edit or delete a message, mark read without fetching, and any paging.

- **Pagination:** none. `getChannel` returns `findMany({ where: { channelId }, orderBy: createdAt asc })` with no `take` (`service:98-102`). The client can't ask for messages newer or older than X.
- **Authorization:**
  - *Another org's conversation by ID:* blocked. `getOwned` filters `{ id, orgId }` and 404s identically (`service:313-324`).
  - *A same-org conversation you're not in:* **allowed.** `getChannel` silently creates a membership for any caller (`service:89-96`). `addMessage` upserts one (`service:242-246`). Any approved member who has a channel or DM UUID can read the full history and post. This includes private DMs between two other people. The only protection is that UUIDs aren't guessable and aren't listed to non-members.
  - *Role permissions:* none server-side. The UI nav hides the link unless the user has `teams:view` (`shell.tsx:120`), but the API accepts any approved org user, including `telecaller` and custom roles.
- **Permissions catalog:** chat is **not** a module in `backend/src/common/utils/permissions.util.ts`. The only "chat" mention is the `support` module description at `:132`. It isn't in `PLATFORM_ROUTE_MODULES` (`:248`) either.

### 2.4 Current "real-time" mechanism

**On `main` today: none.** The mock page makes no network calls for chat. There is no polling, no unread badge, and no sidebar count.

**In the original wired version (`a96e227`, still on `vidya`):**

```
Browser (/org/team-chat mounted)
  ├─ on mount:       GET /api/org/team-chat           → rail (channels + dms with unread, preview)
  ├─ on select:      GET /api/org/team-chat/channels/:id → full thread, server sets lastReadAt=now
  ├─ every 8000 ms:  GET /api/org/team-chat           (always)
  │                  GET /api/org/team-chat/channels/:activeId (if a thread is open)
  │                  → replaces overview + detail state wholesale
  └─ on send:        POST /api/org/team-chat/channels/:id/messages → append returned msg locally
Next.js (PM2 :3001) rewrites /api/* → http://127.0.0.1:3000 (Docker API)
```

Evidence: `a96e227:frontend/app/org/team-chat/page.tsx:214-262` (initial loads), `:264-285` (8 s `setInterval`), `:333-365` (send).

- **Tab hidden?** Polling continues. There's no `visibilitychange` handling in the chat page. Polling stops only when you leave the chat page, because the interval lives in the page component.
- **Chat not open?** No polling. There's nothing global, so you get no badge outside the page. The global 30 s poll in `shell.tsx:421-431` covers notifications and billing only, not chat. `notifications` has no chat hooks (grep found none).
- **Side effect:** every poll of the open thread re-stamps `lastReadAt = now` (`service:105-108`). A hidden tab therefore marks messages as read.

**Estimated cost per 8 s tick.** These counts come from reading the code; I didn't measure them. Prisma 6 runs without the `relationJoins` preview feature (`schema.prisma:1-4`), so every `include` level is a separate SQL query.
- Guards: `OrgApprovedGuard` makes 2 queries per request (organisation and user, `org-approved.guard.ts:81-132`). Two requests per tick means 4.
- `overview`: about 6 queries for memberships and nested includes, plus **about 5 per channel**. That's a `count` plus a `findFirst` that includes sender, lead and lead.project just to build a 90-character preview (`service:276-285`). This is **N+1**: a user in 20 channels or DMs causes about 106 queries per tick.
- `getChannel`: about 5 (`getOwned` with includes) + about 4 (all messages with sender, lead and project) + 1 `updateMany`. The payload is the **entire history** with full lead cards, every 8 s, never a delta.
- Rough total: about 120 queries per user per 8 s for a moderately active user. That's about 15 queries/s per user, or about 750 queries/s for 50 concurrent chat users. Not verified under load.

### 2.5 Frontend (current `main` page)

- **Screens:** one page with three columns. The left rail has channel search and the channel and DM lists. The centre has the header, messages and composer. The right rail has Pinned, Members and Shared Leads. There are also two full-width sub-views: "Create channel" and "Start a direct message" (`page.tsx:227-301`).
- **Data:** entirely hardcoded.
  - `DEFAULT_CHANNELS` (`:51-58`) and `DEFAULT_DMS` (`:60-66`), including hardcoded `online` flags.
  - `INITIAL_MESSAGES` (`:68-112`), including fake reactions and file attachments.
  - `SHARED_LEADS` (`:114-118`).
  - Hardcoded pinned message and members (`:588-651`).
  - The fallback sender name `"Shubham Kumar"` (`:179`).
  - The only real data used is `useOrgUsersList()` in the DM picker. Clicking a user just closes the view (`:281-289`). `useTeamsList()` and `newChannelTeam` are fetched or declared but unused (`:123`, `:135`).
- **State:** local `useState` only. There's no React Query, SWR or Zustand. Sending appends to local state (`:191-194`) and is lost on reload.
- **States:** no loading, error or empty-thread state. The "Today" divider is hardcoded (`:474`).
- **Buttons with no handler:** search-in-channel, members, more (`:460-468`), attach (`:548`), emoji (`:564`), "View all" (`:626`).
- **Mobile:** below 768px the left rail is `display: none` (`team-chat.css:143-151`), so **you can't switch conversations on a phone**. The right rail hides below 1200px (`:134-141`).
- **XSS:** the current page renders text through React (`:210-222`), which is safe. The old wired page used `dangerouslySetInnerHTML` with a hand-rolled escaper for `& < >` (`a96e227:...page.tsx:61-70`, `:590-593`). That's adequate for text-node context, but fragile if anyone re-adopts it.

What the **old wired page** (`a96e227`) had, for reference:
- Real rail with unread badges (`:145-166`) and day separators (Today/Yesterday/date, `:44-58`, `:315-331`).
- Empty states (`:518-519`, `:536-537`, `:569-573`, `:678-686`) and a dismissible error banner (`:465-497`).
- A lead-tag picker that searches CRM leads (`:287-300`, `:638-674`).
- `?team=` auto-select (`:207-228`).
- Send was **not optimistic**: it waited for the server and disabled the button (`:333-365`). There was no retry. On failure it showed an error banner and kept the draft.
- Single-line `<input>`, so no multiline (`:617-628`). One global draft, not one per conversation.
- The "Pinned" box just showed the first message (`:692-704`). The "online" dots were fake, derived from a hash of the user ID (`:715-727`).
- The attach button was a no-op (`:606-608`).

---

## 3. WhatsApp feature-parity table

Status is judged against **what users get on `main`**. The notes say where a backend piece or the old wired UI exists.

### Conversations

| Feature | Status | Evidence / what's missing |
|---|---|---|
| 1:1 direct messages | 🟡 Partial | Backend `POST /dms` find-or-create (`service:190-230`), but it's buggy (§5 B2/B3). UI on main is mock (`page.tsx:60-66`, `:287-289`). Wired only on `vidya` |
| Group chats: create, name | 🟡 Partial | Backend `createChannel` (`service:146-188`). UI on main doesn't submit (`page.tsx:236-243`) |
| Group avatar, description | ❌ | No fields in `TeamChannel`. UI descriptions are hardcoded (`page.tsx:52-57`) |
| Group admin roles | ❌ | No role field on `TeamChannelMember` |
| Add or remove members; leave group | ❌ | No endpoints. Joining happens only implicitly via read or post |
| Auto-created team or project groups | 🟡 Partial | Manual "link to team" auto-joins members at creation only (`service:152-162`). No auto-creation, no sync, no project chats |
| List sorted by latest message, with preview and time | 🟡 Partial | Backend returns `lastMessagePreview` and `lastMessageAt` (`service:301-304`) but orders by `joinedAt` (`:72`). Neither UI sorts. Main UI shows no preview or time |
| Unread per conversation | 🟡 Partial / 🎨 on main | Backend count from `lastReadAt` (`service:272-285`). Main shows hardcoded numbers (`page.tsx:52-56`) |
| Total unread badge in nav | ❌ | Nothing in `shell.tsx`. No endpoint returns a total |
| Pin, mute, archive chats | ❌ | No fields or endpoints. The "Pinned Messages" panel is mock (`page.tsx:588-617`) |
| Search conversations | 🎨 UI-only | Client-side filter of hardcoded channels (`page.tsx:166-170`). DMs aren't filtered |
| Search within messages | 🎨 / ❌ | Icon with no handler (`page.tsx:460`). No backend |

### Messages

| Feature | Status | Evidence / what's missing |
|---|---|---|
| Text with emoji | 🟡 Partial | Backend stores any UTF-8 text (`body` TEXT). Emoji button has no handler (`page.tsx:564`). Typed or pasted emoji would work once wired |
| Multiline text | ❌ | Both UIs use single-line `<input>`, and Enter sends (`page.tsx:551-563`) |
| Link detection / previews | ❌ | None |
| Attachments (image, video, doc, voice) | 🎨 UI-only | Fake file card (`page.tsx:82-86`, `:505-523`). Attach button is a no-op. No schema. Storage exists elsewhere (§4) |
| Reply / quote | ❌ | No `parentId` |
| Forward | ❌ | |
| Edit message | ❌ | No `updatedAt` or `editedAt` on `TeamMessage` and no endpoint |
| Delete for me / for everyone | ❌ | No endpoint. Cascade-only deletes |
| Reactions | 🎨 UI-only | Hardcoded `reactions` (`page.tsx:75`, `:494-502`). No schema |
| @mentions | 🎨 UI-only | Regex highlight only (`page.tsx:210-222`). No autocomplete, no notification, not stored |
| Star / save | ❌ | |
| Copy text | ❌ | No message menu (browser text selection only) |
| Message info (read by, when) | ❌ | No per-message receipts |
| System messages ("X added Y") | ❌ | Channel creation writes an `AuditLog` (`service:175-183`), not a chat message |
| *Domain extra:* tagged lead card | 🟡 Backend only | `leadId` + `assignedTo` with an org check (`service:239`, `:326-334`) and a `sharedLeads` rollup (`:110-114`). Main UI is mock (`page.tsx:526-539`, `:663-683`). Wired on `vidya` |

### Status and presence

| Feature | Status | Evidence / what's missing |
|---|---|---|
| Sent / delivered / read ticks | ❌ | Only a per-user `lastReadAt`. No delivered state. Group read-by isn't derivable per message in the UI, though it could be computed from `lastReadAt` |
| Typing indicator | ❌ | |
| Online status / last seen | 🎨 UI-only | Hardcoded `online` (`page.tsx:61-65`). Old page used fake hash dots. `presence` heartbeat exists on unmerged `social_leads` only (page-tracking, not chat) |
| Date separators | 🎨 on main / ✅ in old UI | Main shows a hardcoded "Today" (`page.tsx:474`). Old UI computed them (`a96e227 :44-58`) |
| Timestamps | 🎨 on main | Main uses hardcoded strings. Backend returns `createdAt` |
| "New messages" divider | ❌ | |

### Delivery and UX

| Feature | Status | Evidence / what's missing |
|---|---|---|
| Infinite scroll for history | ❌ | No pagination in the API (`service:98-102`) |
| Jump to latest | ❌ | Auto-scrolls to bottom on every change only (`page.tsx:149-151`) |
| Scroll position preserved | ❌ | Forced scroll to bottom whenever messages change. In the old UI this fired on every poll that changed length |
| Optimistic send + retry | ❌ | Main: local-only, never sent. Old: waited for server, no retry, no idempotency key |
| Drafts per conversation | ❌ | One global `draft` (`page.tsx:140`) |
| Offline handling | ❌ | Old UI silently swallowed poll errors (`a96e227 :271-281`) |
| Browser / push notifications, sound | ❌ | Settings toggle is static mock (`settings/page.tsx:~2986`). No service worker or push |
| Media gallery | ❌ | |
| Contact / user info panel | 🎨 UI-only | Hardcoded member avatars (`page.tsx:619-652`). Backend returns `members` |
| Block user | ❌ | |

### Not core (checked)

| Feature | Status |
|---|---|
| Polls | ❌ |
| Location sharing | ❌ |
| Disappearing messages | ❌ |
| Broadcast lists | ❌ |
| Voice / video calls | ❌ for team chat. `/org/calling/*` is an unrelated mock |

---

## 4. Infra readiness for WebSockets

| Question | Finding |
|---|---|
| Can WS upgrades pass through the `/api/*` path? | The browser calls `/api/*` on the Next.js origin, and `next.config.ts:29-37` rewrites it to `BACKEND_URL` (`http://127.0.0.1:3000`, `ecosystem.config.cjs:25`). Whether `next start` rewrites proxy `Upgrade: websocket` requests is **not verified in this repo**. It's widely reported as unreliable or unsupported for external-URL rewrites, so plan on it not working. **Recommended assumption:** the browser connects to the API directly, through a reverse-proxy route such as `wss://<app-domain>/ws` or `/socket.io` → `:3000`, bypassing Next. SSE over the rewrite may buffer; also not verified. |
| External reverse proxy needs | Not in the repo. Assumptions: forward `Upgrade` and `Connection` headers (nginx: `proxy_http_version 1.1`, `proxy_set_header Upgrade $http_upgrade`, `Connection "upgrade"`); a long `proxy_read_timeout` (≥ 60 s, plus app-level ping); TLS termination for `wss://`; for SSE, `proxy_buffering off`. Every org custom domain (`org-domain` module) would need the same route. |
| Multi-instance scaling | The API is one container (`docker-compose.prod.yml:18-32`, no `deploy.replicas`). One instance is fine for an in-memory gateway. Two or more would need a pub/sub adapter (`@socket.io/redis-adapter`, or Postgres `LISTEN/NOTIFY`) and sticky sessions if Socket.IO long-polling fallback is enabled. Note that `ecosystem.config.cjs:4-14` also defines a PM2 `realestate-api`, while `deploy.yml:105-122` runs the API in Docker and only the web app in PM2. Clarify which one is authoritative to avoid two API processes. |
| Redis in the deploy? | **No.** Only `postgres` and `api` services (`docker-compose.prod.yml`). No `ioredis`, `redis`, `bullmq` or `socket.io` in any `package-lock.json` (grep count 0). |
| Auth mechanism | Bearer JWT in the `Authorization` header (`jwt-auth.guard.ts:17-23`). Tokens live in `localStorage` (`be.access_token` / `be.refresh_token`, `frontend/lib/api.ts:124-125`). Access tokens expire after 15 min by default (`auth.module.ts:11`), with refresh via `/auth/refresh` (`api.ts:162-190`). No cookies, so a socket can't rely on cookie auth. For a handshake, pass the token in the Socket.IO `auth` payload (or the first WS message, not the query string, to keep it out of logs). Re-authenticate on reconnect and before expiry. `OrgApprovedGuard`'s per-request DB checks (org status, user disabled, `tokenInvalidBefore`, `mustChangePassword`; `org-approved.guard.ts:81-165`) have to be replicated at connect time and re-checked periodically or on events, or a revoked user keeps an open socket. |
| CORS | `enableCors({ origin: true, credentials: true })` (`main.ts:15-18`) reflects any origin. A WS gateway needs its own CORS config. Consider an allow-list. |
| Resource constraints | The deploy refuses to build without ≥ 1 GB swap because the frontend build gets OOM-killed (`deploy.yml:25`, `:111-113`). The box is small. Adding Redis costs roughly 50–100 MB RAM. Idle WebSocket connections are cheap, but N×8 s REST polling with full-history payloads (§2.4) is the bigger load risk. |
| File storage for attachments | Yes, reusable. `StorageService` issues presigned PUT URLs to **Cloudflare R2** (S3-compatible), with a local-disk fallback under `/uploads` (`backend/src/common/storage/storage.service.ts:24-56`, `:100-155`; `main.ts:19-21`). Per-kind MIME and size rules live in `storage.types.ts` (images 5 MB, PDF 15 MB, video 100 MB; `:55-90`). There's an org media library API at `org/media` (`uploads.controller.ts:23-71`). Chat would need a new `kind` (voice notes such as `audio/webm` and `audio/ogg` aren't allowed today), thumbnails (none generated server-side), and access control, because R2 public URLs are unauthenticated. |

---

## 5. Risks, bugs and gaps

### Security / privacy
- **S1. Same-org users can read and join any channel or DM by ID.** `getChannel` auto-creates a membership for any caller (`service:89-96`), and `addMessage` upserts one (`:242-246`). Neither checks prior membership or DM participants. Private DMs are not private within an org. Severity: **High**.
- **S2. No server-side role permission.** The controller has no `@RequirePermission` (`controller.ts:17`). The UI's `teams:view` gate (`shell.tsx:120`) is cosmetic.
- **S3. Tenant consistency is enforced only in app code.** `TeamChannelMember` has no `orgId`. Nothing at the DB level stops a cross-org `userId` member or `leadId`. The current code checks both (`service:191-197`, `:326-334`), but team-linked members are trusted from the `Team` row (`:153-160`).
- **S4. Hard user deletion destroys shared history.** `deleteOrgUser` hard-deletes (`common/utils/org-users.util.ts:378`).
  - `TeamChannel.createdBy` is `onDelete: Cascade` (`schema.prisma:558`; migration FK `team_channels_created_by_id_fkey`), so deleting the creator **deletes the whole channel and everyone's messages**.
  - `TeamMessage.sender` is also Cascade (`:600`), which removes all of the user's messages from shared threads.
  - The migration comment calls `created_by` "Cascade" deliberately. The product impact doesn't appear to have been considered.

### Correctness
- **B1. Race on first open.** `getChannel` uses `create`, not `upsert`, for auto-join (`service:93-95`). Two concurrent first requests (initial fetch plus poll, or two tabs) → P2002 → HTTP 500.
- **B2. DM lookup is asymmetric, so it creates duplicate DMs.** A DM stores `dmUserId = other` (`:207`, `:224`). If A starts a DM with B, the row has `dmUserId=B`. When B later "messages A", the lookup is for `dmUserId=A`, misses, and **creates a second DM**.
- **B3. A DM shows the wrong name to the recipient.** `name` and `otherUser` are always the non-creator (`:223`, `:124-131`, `:292-299`). B sees their own name as the DM title. The old UI's `threadLabel` used `otherUser.name` (`a96e227 :33-35`).
- **B4. A third user joining a DM breaks find-or-create.** Through S1, a third member makes `members.every in [A,B]` (`:208-211`) fail, so a new DM is created next time.
- **B5. Your own messages count as unread.** The unread count doesn't exclude `senderId = me` (`:277-279`), and sending doesn't advance `lastReadAt` (`:232-266`).
- **B6. Reading is implicit and imprecise.** Every poll marks the thread read (`:105-108`), even in a hidden tab. Messages that arrive between the `findMany` (`:98`) and the `updateMany` (`:105`) are marked read without being returned. That window is a few milliseconds, but it's real.
- **B7. Ordering ties.** Messages are ordered by `createdAt` (ms) only (`:100`), with no `id` tie-breaker. Concurrent sends can reorder between fetches, and cursor paging on `createdAt` alone would skip or duplicate rows.
- **B8. Duplicate sends.** There's no idempotency key. A retried POST (network blip, double Enter before `sending` state flushes) inserts twice.
- **B9. Empty messages are accepted.** `body` has no `@IsNotEmpty` (`create-message.dto.ts`, `@IsString @MaxLength(5000)` only). The API accepts `""` or whitespace. Only the UI trims.
- **B10. `updatedAt` "touch" is ineffective and unused.** `teamChannel.update({ data: {} })` (`:261`) intends to bump `updatedAt`. Whether Prisma issues an UPDATE for empty data is **not verified**. Either way, nothing orders by `updatedAt`.
- **B11. Team-linked channels don't sync** when team membership changes (`:152-162` runs once).

### Performance
- **P1. N+1 in `overview`:** about 5 queries per conversation per poll (§2.4).
- **P2. Unbounded payload:** the whole history plus full lead cards on every poll (`:98-102`, `:133-138`).
- **P3. `OrgApprovedGuard` makes 2 DB reads on every request** (`org-approved.guard.ts:81`, `:124`). Under polling, that's paid on every tick.
- **P4. No `lastMessageAt` column**, so the conversation list can't be sorted or paged in SQL.

### Product / code health
- **Q1. Production shows a fake chat.** `main` deploys (`deploy.yml:33-36`), and `/org/team-chat` renders made-up people and messages, including a real-looking name, `"Shubham Kumar"`. Messages users type vanish on reload. This is misleading to customers today.
- **Q2. Dead code.** Five API helpers and the TeamChat types are imported but unused on `main` (`page.tsx:9-15`). `useTeamsList`/`teams` and `newChannelTeam` are unused (`:123`, `:135`). `team-chat.css` is imported both globally (`org/layout.tsx:10`) and by the page (`page.tsx:16`).
- **Q3. Mobile is unusable.** The conversation rail is hidden below 768px (`team-chat.css:143-151`).
- **Q4. No tests** for the team-chat module or page.
- **Q5. The wiring regression went unnoticed.** `0027a9a` dropped all API usage in a "UI components" commit, and `07d7027`'s message asserts API calls are unchanged. Redesign PRs need a functional check.

---

## 6. Open questions for product and tech

1. **Model:** WhatsApp-style (DMs plus ad-hoc groups, all private, invite-only) or Slack-style (discoverable public channels plus DMs), or both? This decides whether S1's "auto-join on read" is ever acceptable.
2. **Who may chat with whom?** Every org user with every other, or scoped by team or hierarchy (e.g. telecallers only with their manager)? Is chat a permission module (`team_chat: view/add/manage`)?
3. **Auto groups:** should every `Team`, and every `Project` (via `TeamProject`), get an auto-managed group whose membership stays in sync?
4. **Retention and compliance:** what happens to messages when a user is deleted or deactivated? Can admins read all chats (audit/export)? Are there retention periods? This affects S4 and soft delete.
5. **Delete and edit semantics:** "delete for everyone" time window? Is edit history visible?
6. **Read receipts in groups:** per-message receipts (costly: rows = messages × members) or per-member read pointers only, which is cheaper and enough for "seen by N"?
7. **Attachments:** allowed types and size caps, voice notes, whether files need private (signed) URLs rather than public R2 URLs, and retention.
8. **Notifications:** in-app bell only, browser push (needs a service worker and VAPID keys), email digests, or mobile push? Will there be a native app?
9. **Lead-tag cards:** keep this CRM-specific feature? Should tagging a lead actually reassign it, or stay a free-text label (`assignedTo`)?
10. **Scale target:** expected concurrent users per org and total. This decides single-instance in-memory vs. a Redis adapter.
11. **Interim:** hide `/org/team-chat` on production until it's real, or restore the `a96e227` wiring as a stopgap?
12. **Deploy topology:** which API runtime is authoritative, Docker or the PM2 entry in `ecosystem.config.cjs`? Who owns the external reverse proxy config, and can it add a WS route?

---

## 7. Recommendation (pros and cons only)

**Option A — Extend the polling design**
- Pros:
  - No new infrastructure, which suits the small, swap-dependent box. It matches the Support chat precedent, and the existing auth works unchanged.
  - Works through the current Next rewrite and any proxy.
  - Incremental: restore the wiring, add cursor/delta endpoints (`?after=<cursor>`), a total-unread endpoint, and `visibilitychange` back-off.
- Cons:
  - Never feels like WhatsApp: 3–8 s latency, and typing indicators and live ticks are impractical.
  - Load grows with users × frequency, even when idle.
  - Every poll pays guard and auth DB reads.
  - Presence would need yet another heartbeat.

**Option B — Introduce WebSockets (e.g. `@nestjs/websockets` + Socket.IO)**
- Pros:
  - Instant delivery, typing, presence, and live read ticks: the "exactly like WhatsApp" bar.
  - Idle cost is low, and server push replaces most polling, including the notification bell.
  - One process today needs no Redis.
- Cons:
  - Needs a direct proxy route that bypasses the Next rewrite (§4), plus reverse-proxy changes outside this repo.
  - Bearer token handshake, 15-min expiry and revocation checks must be re-implemented for long-lived connections.
  - Horizontal scaling later needs Redis (or Postgres `LISTEN/NOTIFY`) and sticky sessions.
  - More moving parts to test, and a REST fallback is still needed for history and for reconnect catch-up.

**Option C — Server-Sent Events for push, REST for sends**
- Pros:
  - Simpler than WS: plain HTTP, easy auth (fetch-based SSE can send the Bearer header), and good enough for new messages, unread counts and read updates.
- Cons:
  - One-way, so typing indicators need extra POSTs.
  - Proxy buffering through the Next rewrite is not verified, so it likely needs the same direct route as WS.
  - Same token-expiry and scaling concerns.

**Regardless of option:** fix S1, S2, S4 and B1–B9 first, and add cursor pagination and a `lastMessageAt` column. Real-time delivery on top of the current access model would push private DMs to anyone who has auto-joined them.
