# Team Chat rebuild — handoff

_Last updated 2026-10-08. Read this first in a new session, then `docs/team-chat-investigation.md` (the original audit with bug IDs) and `docs/team-chat-realtime.md` (socket events, nginx, env)._

## Where things stand

- **Branch:** `vidya_new`, clean, pushed to `origin/vidya_new`.
- **Phases:** 0–4 are done and committed (Phase 4 on 2026-10-08). See "Phase 4" below.
- **Commits, oldest first:**

| Commit | What |
|---|---|
| `0c715a3` | Phase 0: disable Teams, WhatsApp and Calling; trim the Team Chat UI |
| `0a05e9b` | Phase 1: schema, permissions and REST API |
| `a20fb87` | DM search only offers active users who have `team_chat:view` |
| `f872728` | Signed local uploads; the private bucket has its own R2 credentials |
| `605cc4b` | Docs: pre-existing schema drift (not fixed) |
| `039f3da` | Phase 2: Socket.IO real-time and the live UI |
| `011327d` | Popups for new channel/message; two-sided messages |
| `d9c4447` | Phase 3: file sharing and emoji picker |

- **Merge warning:** `origin/main` is 17 commits ahead of where this branch started. Those commits overlap with this branch in:
  - `backend/prisma/schema.prisma`
  - `backend/src/app.module.ts`
  - `backend/src/modules/auth/auth.service.ts`
  - `frontend/app/org/team-chat/page.tsx`
  - `frontend/components/org/shell.tsx`
  - `frontend/package.json`

  Expect conflicts when merging. Keep **this branch's** Team Chat page.

## How the user wants to work (must follow)

- **Commits:** never commit. At each checkpoint, give a commit message (ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`) and the exact file list. Then wait for the user to reply "committed".
- **End of every phase:**
  1. Run `npm run build` in both `backend` and `frontend`.
  2. Run the tests.
  3. Stop with a summary.

  Test failures that already existed must not increase: backend jest **8** (all in `leads.service.spec.ts`), frontend vitest **25** (5 files).
- **UI look:** keep the existing design.
  - Same `.tch-*` markup and colours: green `#059669`, grey borders `#e5e7eb`, `16px` cards.
  - Rebuild behaviour, not the look. Append CSS; never rewrite the stylesheet.
  - The user rejected a WhatsApp reskin. They did ask for messages on two sides (yours on the right), which is now in place.
- **Database migrations:** use only scratch databases on the dev Postgres:
  - `chat_scratch_fresh` / `chat_scratch_main`
  - URL: `postgresql://postgres:Vidya%40651@localhost:5432/...`
  - psql is at `/c/Program Files/PostgreSQL/18/bin/psql.exe`

  Never touch the normal dev `DATABASE_URL`. Drop scratch databases when done (`WITH (FORCE)` is allowed) and say so.
- **Secrets:** never print or log secret values.
- **Paid services:** none new. Socket.IO runs on the single API instance, with no Redis.
- **Disabled modules:** reversible only, tagged `[DISABLED-TEAMS]`, `[DISABLED-WHATSAPP]` or `[DISABLED-CALLING]`. Never drop their tables.
- **Answers:** plain language when the user asks "what's done / what's left". They forward it to others.

## What each phase built

### Phase 0
- **Disabled modules:** Teams, WhatsApp and Calling are switched off. Nav items are hidden, and their routes render "Coming soon".
- **Team Chat page:** the old right panel was removed, leaving 2 columns.

### Phase 1: data, permissions, REST
- **Schema** (`access` schema, migration `20261007120000_team_chat_rebuild`, guarded and idempotent, with data repair):
  - `TeamChannel`: kind `general | channel | dm`, a unique `dmKey`, `lastMessageAt`.
  - `TeamChannelMember`: role, read pointer `lastReadAt` / `lastReadMessageId`.
  - `TeamMessage`: kind `text | file | system`, `parentId`, `forwarded`, `editedAt`, `deletedAt` (soft delete), pin fields, `clientMsgId` (idempotent send).
  - Also `TeamMessageAttachment`, `TeamMessageMention`, `TeamMessageReaction` (one reaction per user per message) and `TeamChatPresence` (`lastSeenAt`).
- **General channel:** one per org. Members are kept in sync by hooks in `common/utils/team-chat-membership.util.ts`, called from:
  - user invite / approve / status change / delete (`org-users.util.ts`)
  - onboarding finalize
  - auth signup
  - admin org creation
- **Permission module `team_chat`:** actions view, add (create channels), edit (manage channels), delete. Default roles: admin all; manager view, add and edit; sales view and add; telecaller view. Custom roles get nothing until granted.
- **The access rule:** every read and write goes through the caller's own membership row. A non-member gets the same 404 as a missing record, including org admins, so DMs stay private.
- **REST API:** `org/team-chat/*`.
  - conversations and rail
  - channels CRUD
  - members
  - DMs (find or create)
  - search
  - messages with cursor paging (`before` / `after` / `around`)
  - in-conversation search
  - pins (max 3)
  - read
  - edit
  - delete
  - forward
  - reactions
  - attachment presign and signed download

### Checkpoint 2 fixes
- **DM search:** `/search` and `POST /dms` only allow active same-org users who have `team_chat:view`. Uses the batched `usersWithOrgPermission` in `permission.guard.ts`.
- **Local uploads:** `PUT /uploads/local-put` is now HMAC-signed (key, content type, size, expiry). Bytes are counted while streaming, path traversal is rejected, and the route returns 404 when R2 is configured.
- **Private bucket:** chat files use their own credentials and S3 client:
  - `R2_PRIVATE_BUCKET_NAME`
  - `R2_PRIVATE_ACCESS_KEY_ID`
  - `R2_PRIVATE_SECRET_ACCESS_KEY`
  - optional `R2_PRIVATE_ACCOUNT_ID` / `R2_PRIVATE_ENDPOINT`

  If these are missing, the API returns **503** and never falls back to the public bucket. Local `private-uploads/` is used only when no R2 is configured at all.

### Phase 2: real-time and live UI
- **Gateway:** `team-chat.gateway.ts`, namespace `/team-chat`, path `/socket.io`.
  - The handshake runs the same checks as the REST guards. They were extracted as `verifyAccessToken` and `assertOrgSessionActive`, plus a `team_chat:view` check.
  - Origin allow-list `CHAT_WS_ORIGINS` (defaults to `FRONTEND_URL`), enforced for both websocket and polling via `allowRequest`.
  - The socket is cut at token expiry (`session:expired`).
  - Access is re-checked immediately on user, role, permission or org changes, through the in-process bus `common/utils/team-chat-bus.ts`, plus a 60 s sweep (`access:revoked`).
- **Rooms:** `user:` / `conv:` / `org:`.
- **Events, emitted only after commit, from `team-chat-realtime.service.ts`:**
  - `message:new`, `message:updated`, `message:deleted`
  - `pins:updated`
  - `reaction:updated`
  - `conversation:created`, `conversation:updated`, `conversation:removed`
  - `members:updated`
  - `unread:update` (includes the total)
  - `presence:update`
  - `typing:update`

  Clients send only `typing:start` / `typing:stop` (throttled to 2 s, never stored).
- **Presence:** an in-memory counter per user with a 10 s grace period (`TEAM_CHAT_PRESENCE_GRACE_MS`). `last_seen_at` is written on going offline.
- **Frontend data layer:** `lib/team-chat/`. `TeamChatProvider` is mounted once in `components/org/shell.tsx`.
  - one socket
  - the rail
  - unread total, shown as a badge on the nav item on every org page
  - presence and typing
  - token refresh and reconnect, with catch-up via `?after=`
- **Page:** `app/org/team-chat/`. Split into `page.tsx`, `conversation-rail.tsx`, `thread-view.tsx`, `members-drawer.tsx` and `chat-ui.tsx`.
  - Rail: CHANNELS / DIRECT MESSAGES with badges, online dots and "typing…".
  - Thread: infinite scroll, date dividers, a "New messages" line, jump to latest, optimistic send with retry, drafts.
  - Header: search in conversation, members panel, rename / leave / delete.
  - Popups for new channel and new message, opened by the section "+" icons.
  - Mobile below 768px: list or thread.
  - A "no access" page.
- **App host only:** chat runs on the app host only (`lib/platform-hosts.ts`, shared with `proxy.ts`). `proxy.ts` still serves `/org/*` on custom domains, so the page says "not available on this domain".
- **Verified live:** a scripted run of 42/42 checks with real socket clients against a throwaway API (scripts are in the old session's scratchpad and not kept).

### Phase 3: files and emoji
- **Composer** (`composer.tsx`):
  - attach button, drag-and-drop onto the thread, paste
  - up to 10 files per message
  - a tray with previews, a progress bar (XHR), cancel and retry
  - the caption is the message text
- **Display:** `attachments-view.tsx` shows a photo/video grid and file cards. `media-lightbox.tsx` (lazy) is the full-screen viewer, using `yet-another-react-lightbox` with Video, Zoom and Counter.
- **Emoji:** `emoji-popover.tsx`, lazy-loaded `emoji-picker-react`, `EmojiStyle.NATIVE` (no CDN).
- **API additions:**
  - `DELETE /attachments/:id` cancels your own unsent upload. It deletes the stored object only if no forwarded copy shares it.
  - Uploads never sent are cleaned up after 24 h, triggered on the next presign.
  - Previews read "📷 Photo", "🎥 Video" or "📎 name".
- **Verified live:** 20/20 checks on local private storage. **Not yet verified against a real R2 private bucket.**

### Phase 4: message actions
- **Menu:** desktop hover shows two icons beside the bubble: react, and "more" (Reply, Forward, Copy text, Pin/Unpin, Edit, Delete). On mobile (≤768px), long-press the bubble to open a bottom sheet with the same items. Rules are in `messageActions()` (`message-actions.tsx`). Edit is for your own text messages only. Delete covers your own messages, and other people's in channels with `team_chat:delete` (never in DMs). Read-only DMs keep only Forward, Copy and Delete.
- **Reactions:** a quick bar of 6 emoji plus "+", which opens the full emoji picker. Popovers use `position: fixed`, so the scrolling thread can't clip them.
- **Reply / edit:** a banner above the composer. Esc cancels. Edit mode hides the attach button. Clicking a reply quote jumps to the original message.
- **Pins:** a bar at the top of the thread shows one pin at a time. Clicking it jumps to that message and moves to the next pin. It also has an unpin button. Pinned bubbles show "Pinned by X".
- **Mentions:** typing `@` suggests active members (not you). Arrow keys, Enter/Tab and Esc work. `mentionUserIds` are the members whose `@Full Name` is in the text. Mentions are highlighted in bubbles, with yours in green.
- **Mention notifications:** a new `NotificationType` `team_chat_mention` (migration `20261008120000_team_chat_mention_notification`, an additive enum value). It goes to the existing org bell (entity `TeamChannel`, entityId = conversation id). Edits notify only people newly mentioned. Notifications are best-effort and never fail the send. Clicking one opens the conversation (`TEAM_CHAT_OPEN_EVENT` if Team Chat is already open).
- **Forward:** a conversation picker (search, multi-select, up to 20).
- **Delete channel:** you must type the channel name to confirm (`ConfirmDialog requireText`).
- **Rail:** an edit to the latest message updates the rail preview live.
- **Lint note:** with the React Compiler, a `setX` used in an inline JSX callback after the early returns breaks memoisation of every `useCallback` that uses `setX`. Put such handlers in named functions before the early returns.

## Architecture decisions (settled)

- **Real-time:** Socket.IO on the existing API process; state is in memory. More than one API instance would need an adapter, which is out of scope.
- **Reads and writes:** REST for all writes. The socket only pushes after commit. Clients refetch entities on `conversation:*` events rather than receiving per-viewer payloads.
- **Message payloads:** broadcast in the sender's view. Clients work out "my reaction" from `reactions[].users`. `clientMsgId` is broadcast too, so senders can match their optimistic messages.
- **Unread counts:** per-member read pointer on `(createdAt, id)`. System messages, deleted messages and your own messages never count. Before your first read, the join time is the pointer.
- **Lifecycle hooks:** called with the plain Prisma client after the triggering change commits, never inside a transaction, because they publish to the bus.
- **Deleting messages:** soft delete only. The body is cleared, and attachments are hidden but kept.
- **Removing someone from a DM:** a disabled or deleted DM peer makes the DM read-only. Nothing is deleted.
- **Old API removed:** the `/org/team-chat` overview endpoint and the old types in `lib/api.ts` / `lib/types.ts` are gone.

## Reversed or changed along the way

- **UI reskin rolled back.** A WhatsApp-style reskin was reverted to the original `.tch-*` design. The user then asked for:
  - no header buttons
  - New channel / New message as popups instead of full pages
  - no "+" beside search
  - a proper people-search input
  - two-sided bubbles
- **Third column stays out.** The user chose to keep 2 columns. Members open as a panel; pins come in Phase 4.
- **List rows have no preview text.** Rows show only name, badge, online dot and typing, to keep the old look. A grey preview line was offered as an optional extra and not requested.

## What's left

1. **Phase 4: message actions.** Built (see above). It still needs the user's two-browser check. The original task list follows. Reply and edit go through the existing `PATCH /messages/:id`; the rest of the API already exists.
   - **Menu:** hover (desktop) or long-press (mobile) with Reply, Forward, Copy, Pin/Unpin, Edit (own text messages) and Delete (own messages, or others' in channels with `team_chat:delete`; never in DMs).
   - **Reactions:** a quick bar of 6 emoji plus "+", which opens the existing emoji popover. Reaction chips already exist.
   - **Pins:** a pinned-messages strip or bar in the thread (max 3, and the API enforces it).
   - **Mentions:** `@` autocomplete from conversation members, sent as `mentionUserIds`. Mention notifications are new work: hook into the existing org notifications (bell).
   - **Channel delete:** proper delete-channel confirmation. A confirm dialog exists; check it meets the spec.
   - **Forward:** a picker of conversations, using `POST /messages/:id/forward`.
2. **Final documentation** of Team Chat (update the investigation and realtime docs).
3. **Deploy steps (user or DevOps):**
   - the nginx `/socket.io/` block from `docs/team-chat-realtime.md`
   - `CHAT_WS_ORIGINS=https://<app host>`
   - the private R2 variables
4. **Real R2 check:** once the `R2_PRIVATE_*` vars are in `backend/.env`, check presign → PUT → signed GET against R2. Quote exact errors.
5. **Two-browser manual test** by the user. Not done by Claude: there's no browser automation on this machine.
6. **Merge** `origin/main` into `vidya_new` (conflicts expected; see above).

Out of scope: read ticks and push notifications.

## Open questions

- **Mention notifications:** should they reuse the existing org notification bell (`getOrgNotifications`), or does the user want something else?
- **Deleting a message:** should it also delete its stored files for good, or keep them hidden (current behaviour)?
- **Edits:** any time limit on editing messages? There is none now.
- **Merging main:** who does the merge with `main`, and when (before or after Phase 4)?
- **Schema drift:** `docs/schema-drift-notes.md` lists pre-existing migration drift that was not fixed. It needs a decision, especially the `templates.category` / `is_paid` drop.

## Local dev on this machine

- **Ports:** the API runs on **port 4000** (`backend/.env` `PORT=4000`, `FRONTEND_URL=http://localhost:3000`). The frontend (`next dev`) runs on **3000**.
- **Frontend env:** `frontend/.env.local` (git-ignored) has `BACKEND_URL=http://localhost:4000` and `NEXT_PUBLIC_CHAT_WS_URL=http://localhost:4000`.
- **Public R2 is set locally, private R2 isn't.** Chat uploads locally return 503 until the private variables are added (intended).
- **Prisma DLL lock:** `prisma generate` hits EPERM while `start:dev` runs. Stop it first.
- **Lint:** `npm run lint` in the backend runs `--fix`. Lint specific files with `npx eslint <files>` instead.
- **Builds:** `next.config.ts` ignores TypeScript errors at build time, so run `npx tsc --noEmit` and grep for the chat files.
- **Line endings:** many backend files are CRLF. Edit with the Edit tool, or a script that normalises line endings.
- **Seed login:** `rohan@skylinedev.in` / `Welcome@123`.
- **Live checks:** run a throwaway API from `backend/dist/src/main.js`:
  - port 4100, with R2 vars blanked
  - `DATABASE_URL` pointing at a scratch database
  - log in through `/auth/login` with `portal: 'organisation'`
  - drive it with `socket.io-client` from `frontend/node_modules`

## Key files

| Area | Path |
|---|---|
| Backend chat module | `backend/src/modules/team-chat/` (controller, gateway, realtime, unread, presence, access, conversations, messages, attachments, shared, dto, specs) |
| Membership hooks | `backend/src/common/utils/team-chat-membership.util.ts` |
| Access-change bus | `backend/src/common/utils/team-chat-bus.ts` |
| Guards | `backend/src/common/guards/` (`verifyAccessToken`, `assertOrgSessionActive`, `hasOrgPermission`, `usersWithOrgPermission`) |
| Private storage | `backend/src/common/storage/` (`storage.service.ts`, `private-files.controller.ts`, `private-local.util.ts`) |
| Frontend data layer | `frontend/lib/team-chat/` (`api`, `context`, `socket`, `format`, `types`, `uploads`) |
| Frontend page | `frontend/app/org/team-chat/` |
| Docs | `docs/team-chat-investigation.md`, `docs/team-chat-realtime.md`, `docs/schema-drift-notes.md`, this file |
