import { Logger, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { PrismaService } from '../../database/prisma.service';
import { verifyAccessToken } from '../../common/guards/jwt-auth.guard';
import { assertOrgSessionActive } from '../../common/guards/org-approved.guard';
import { hasOrgPermission } from '../../common/guards/permission.guard';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import {
  onChatAccessChanged,
  onChatMembership,
  type ChatAccessScope,
  type ChatMembershipEvent,
} from '../../common/utils/team-chat-bus';
import { chatDisplayName } from '../../common/utils/team-chat-membership.util';
import { TeamChatPresenceService } from './team-chat-presence.service';
import {
  convRoom,
  orgRoom,
  TeamChatRealtimeService,
  userRoom,
} from './team-chat-realtime.service';
import { USER_SELECT } from './team-chat.shared';

/** Comma-separated browser origins allowed to open the chat socket
 *  (FRONTEND_URL). */
export function chatSocketOrigins(): string[] {
  const raw = process.env.FRONTEND_URL || '';
  return raw
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/** Codes sent to the client in connect_error / access:revoked. */
type ChatSocketCode =
  | 'TOKEN_MISSING'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'ORG_INACTIVE'
  | 'USER_INACTIVE'
  | 'ORG_NOT_READY'
  | 'NO_ORG_ACCESS'
  | 'NO_CHAT_ACCESS';

class ChatAuthError extends Error {
  readonly data: { code: ChatSocketCode };
  constructor(code: ChatSocketCode, message: string) {
    super(message);
    this.data = { code };
  }
}

interface SocketData {
  user: JwtPayload;
  userId: string;
  orgId: string;
  name: string;
  expiryTimer?: NodeJS.Timeout;
  typingAt: Map<string, number>;
}

type ChatSocket = Socket<
  Record<string, (...args: unknown[]) => void>,
  Record<string, (...args: unknown[]) => void>,
  Record<string, never>,
  SocketData
>;

const TYPING_THROTTLE_MS = 2000;
const RECHECK_INTERVAL_MS = 60_000;

/**
 * Team Chat real-time channel: Socket.IO namespace `/team-chat` on the API's
 * own HTTP server (default path `/socket.io`).
 *
 * Handshake: `auth: { token }` carries the same Bearer access JWT as REST and
 * goes through the same checks as JwtAuthGuard + OrgApprovedGuard, plus
 * team_chat:view. The socket is cut when the token expires (the client
 * refreshes and reconnects), and whenever the user's access may have changed
 * (disabled, deleted, role/permission edits, org disabled) it is re-checked
 * and cut if it no longer passes — plus a periodic sweep as a backstop.
 *
 * Clients only send typing:start / typing:stop; everything else is pushed by
 * TeamChatRealtimeService after REST writes commit.
 */
@WebSocketGateway({
  namespace: '/team-chat',
  cors: {
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Non-browser clients send no Origin; auth still applies.
      cb(null, !origin || chatSocketOrigins().includes(origin));
    },
    credentials: true,
  },
  // CORS only governs the HTTP polling transport; a raw WebSocket upgrade
  // carries an Origin header but is not subject to CORS, so check it here
  // for every transport.
  allowRequest: (
    req: { headers: { origin?: string } },
    cb: (err: string | null | undefined, ok: boolean) => void,
  ) => {
    const origin = req.headers.origin;
    cb(null, !origin || chatSocketOrigins().includes(origin));
  },
})
export class TeamChatGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleDestroy
{
  private readonly logger = new Logger('TeamChatGateway');
  private ns!: Namespace;
  private readonly unsubscribe: Array<() => void> = [];
  private recheckTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly presence: TeamChatPresenceService,
    private readonly realtime: TeamChatRealtimeService,
  ) {}

  afterInit(ns: Namespace) {
    this.ns = ns;
    this.realtime.attach(ns);
    ns.use((socket, next) => {
      this.authenticate(socket as ChatSocket)
        .then(() => next())
        .catch((err: unknown) => {
          if (err instanceof ChatAuthError) return next(err);
          this.logger.warn(
            `handshake failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          next(new ChatAuthError('TOKEN_INVALID', 'Could not authenticate'));
        });
    });
    this.unsubscribe.push(
      onChatAccessChanged((scope) => void this.recheck(scope)),
      onChatMembership((events) => void this.onMembership(events)),
    );
    this.recheckTimer = setInterval(
      () => void this.recheck({}),
      RECHECK_INTERVAL_MS,
    );
    this.recheckTimer.unref?.();
  }

  onModuleDestroy() {
    this.unsubscribe.forEach((fn) => fn());
    if (this.recheckTimer) clearInterval(this.recheckTimer);
  }

  // --- connection lifecycle -----------------------------------------------

  private async authenticate(socket: ChatSocket) {
    const auth = (socket.handshake.auth ?? {}) as { token?: unknown };
    const raw = typeof auth.token === 'string' ? auth.token : '';
    const token = raw.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new ChatAuthError('TOKEN_MISSING', 'Missing token');

    let user: JwtPayload;
    try {
      user = verifyAccessToken(this.jwt, token);
    } catch {
      const decoded = this.jwt.decode<{ exp?: number } | null>(token);
      const expired = !!decoded?.exp && decoded.exp * 1000 <= Date.now();
      throw expired
        ? new ChatAuthError('TOKEN_EXPIRED', 'Token expired')
        : new ChatAuthError('TOKEN_INVALID', 'Invalid token');
    }
    await this.assertAccess(user);

    const me = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.sub },
      select: USER_SELECT,
    });
    socket.data = {
      user,
      userId: user.sub,
      orgId: user.orgId as string,
      name: chatDisplayName(me),
      typingAt: new Map(),
    };
  }

  /** OrgApprovedGuard's rules + team_chat:view, as a ChatAuthError. */
  private async assertAccess(user: JwtPayload) {
    try {
      await assertOrgSessionActive(this.prisma, user);
    } catch (err) {
      const body = (err as { getResponse?: () => unknown }).getResponse?.();
      const tag =
        body && typeof body === 'object' && 'error' in body
          ? String(body.error)
          : '';
      const code: ChatSocketCode =
        tag === 'ORG_INACTIVE' ||
        tag === 'USER_INACTIVE' ||
        tag === 'ORG_NOT_READY'
          ? tag
          : 'NO_ORG_ACCESS';
      throw new ChatAuthError(
        code,
        err instanceof Error ? err.message : 'Access denied',
      );
    }
    if (!(await hasOrgPermission(this.prisma, user, 'team_chat', 'view', true))) {
      throw new ChatAuthError(
        'NO_CHAT_ACCESS',
        "You don't have access to Team Chat",
      );
    }
  }

  async handleConnection(socket: ChatSocket) {
    const { userId, orgId, user } = socket.data;
    if (!userId) return socket.disconnect(true);

    const memberships = await this.prisma.teamChannelMember.findMany({
      where: { userId, orgId, channel: { orgId } },
      select: { channelId: true },
    });
    await socket.join([
      userRoom(userId),
      orgRoom(orgId),
      ...memberships.map((m) => convRoom(m.channelId)),
    ]);

    // Cut the socket when its token expires; the client refreshes and
    // reconnects with the new token.
    if (user.exp) {
      const ms = user.exp * 1000 - Date.now();
      socket.data.expiryTimer = setTimeout(
        () => {
          socket.emit('session:expired', { code: 'TOKEN_EXPIRED' });
          socket.disconnect(true);
        },
        Math.max(0, Math.min(ms, 2_147_000_000)),
      );
    }

    if (this.presence.connected(userId, orgId)) {
      this.realtime.presence(orgId, userId, true, null);
    }
  }

  handleDisconnect(socket: ChatSocket) {
    const { userId, expiryTimer } = socket.data ?? {};
    if (expiryTimer) clearTimeout(expiryTimer);
    if (!userId) return;
    this.presence.disconnected(userId, (orgId) => {
      void this.wentOffline(orgId, userId);
    });
  }

  private async wentOffline(orgId: string, userId: string) {
    const lastSeenAt = new Date();
    try {
      await this.prisma.teamChatPresence.upsert({
        where: { userId },
        create: { userId, orgId, lastSeenAt },
        update: { lastSeenAt, orgId },
      });
    } catch (err) {
      // e.g. the user was deleted meanwhile — nothing to record.
      this.logger.debug?.(
        `presence write skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.realtime.presence(orgId, userId, false, lastSeenAt);
  }

  // --- typing (never persisted) -------------------------------------------

  @SubscribeMessage('typing:start')
  typingStart(
    @ConnectedSocket() socket: ChatSocket,
    @MessageBody() body: { conversationId?: unknown },
  ) {
    this.typing(socket, body, true);
  }

  @SubscribeMessage('typing:stop')
  typingStop(
    @ConnectedSocket() socket: ChatSocket,
    @MessageBody() body: { conversationId?: unknown },
  ) {
    this.typing(socket, body, false);
  }

  private typing(
    socket: ChatSocket,
    body: { conversationId?: unknown } | undefined,
    typing: boolean,
  ) {
    const conversationId =
      typeof body?.conversationId === 'string' ? body.conversationId : '';
    const room = convRoom(conversationId);
    // Room membership is the membership check: sockets are only ever in the
    // rooms of conversations their user belongs to.
    if (!conversationId || !socket.rooms.has(room)) return;
    const { typingAt, userId, name } = socket.data;
    const now = Date.now();
    if (typing) {
      const last = typingAt.get(conversationId) ?? 0;
      if (now - last < TYPING_THROTTLE_MS) return;
      typingAt.set(conversationId, now);
    } else {
      if (!typingAt.has(conversationId)) return;
      typingAt.delete(conversationId);
    }
    socket.to(room).emit('typing:update', {
      conversationId,
      userId,
      name,
      typing,
    });
  }

  // --- access changes & membership hooks ---------------------------------

  /** Re-runs the handshake checks for connected users in `scope`; sockets
   *  that no longer pass are told why and cut. */
  private async recheck(scope: ChatAccessScope) {
    if (!this.ns) return;
    try {
      const sockets = (await this.ns.fetchSockets()) as unknown as ChatSocket[];
      const byUser = new Map<string, ChatSocket[]>();
      for (const s of sockets) {
        const d = s.data;
        if (!d?.userId) continue;
        if (scope.orgId && d.orgId !== scope.orgId) continue;
        if (scope.userId && d.userId !== scope.userId) continue;
        byUser.set(d.userId, [...(byUser.get(d.userId) ?? []), s]);
      }
      for (const list of byUser.values()) {
        const groups = new Map<number, ChatSocket[]>();
        // Sockets of one user may carry tokens with different iat.
        for (const s of list) {
          const iat = s.data.user.iat ?? 0;
          groups.set(iat, [...(groups.get(iat) ?? []), s]);
        }
        for (const group of groups.values()) {
          try {
            await this.assertAccess(group[0].data.user);
          } catch (err) {
            const code =
              err instanceof ChatAuthError ? err.data.code : 'NO_ORG_ACCESS';
            for (const s of group) {
              s.emit('access:revoked', { code });
              s.disconnect(true);
            }
          }
        }
      }
    } catch (err) {
      this.logger.warn(
        `access re-check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** General / channel joins and leaves from user lifecycle hooks. */
  private async onMembership(events: ChatMembershipEvent[]) {
    for (const e of events) {
      if (e.change === 'joined') {
        this.realtime.conversationCreated(e.channelId, [e.userId]);
      } else {
        this.realtime.conversationRemoved(e.channelId, [e.userId], 'removed');
      }
      this.realtime.membersUpdated(e.channelId);
      this.realtime.conversationUpdated(e.channelId);
      this.realtime.messagesNewById(e.orgId, [e.systemMessageId]);
    }
    // A disabled/deleted user's sockets get cut by the access re-check.
    const left = events.filter((e) => e.change === 'left');
    for (const userId of new Set(left.map((e) => e.userId))) {
      await this.recheck({ userId });
    }
  }
}
