import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { HeartbeatDto } from './dto/heartbeat.dto';

const MINUTE_MS = 60 * 1000;

/** A session counts as live while its last heartbeat is this recent. */
const LIVE_WINDOW_MS = 2 * MINUTE_MS;
/** "Still actively interacting" = last keydown/click/scroll/input this recent. */
const INTERACTION_WINDOW_MS = 3 * MINUTE_MS;
/** This many failed submits flags the user regardless of time on page. */
const ERROR_THRESHOLD = 2;

/**
 * Task pages where staying too long (while still interacting, with no
 * success event in the audit log since they arrived) means the user is
 * probably stuck. `successActions` are AuditLog.action values.
 */
export const TASK_PAGES: Array<{
  pattern: RegExp;
  label: string;
  thresholdMinutes: number;
  successActions: string[];
}> = [
  {
    pattern: /^\/org\/projects\/add-new-project\/?$/,
    label: 'Create project',
    thresholdMinutes: 10,
    successActions: ['project_created'],
  },
  {
    pattern: /^\/org\/projects\/all-units\/create\/?$/,
    label: 'Create unit',
    thresholdMinutes: 8,
    successActions: ['unit_created', 'standalone_unit_created'],
  },
  {
    pattern: /^\/org-builder\/?$/,
    label: 'Landing page builder',
    thresholdMinutes: 25,
    successActions: ['landing_page_published'],
  },
];

export function taskPageFor(route: string) {
  return TASK_PAGES.find((page) => page.pattern.test(route)) ?? null;
}

export type StuckReason = 'time' | 'errors' | null;

/** Pure stuck rule — `completed` is whether a success event was found. */
export function stuckReason(
  session: {
    route: string;
    enteredAt: Date;
    lastInteractionAt: Date | null;
    errorCount: number;
  },
  completed: boolean,
  now: Date,
): StuckReason {
  if (session.errorCount >= ERROR_THRESHOLD) return 'errors';
  const task = taskPageFor(session.route);
  if (!task || completed) return null;
  const onPageMs = now.getTime() - session.enteredAt.getTime();
  const interacting =
    !!session.lastInteractionAt &&
    now.getTime() - session.lastInteractionAt.getTime() <=
      INTERACTION_WINDOW_MS;
  return onPageMs > task.thresholdMinutes * MINUTE_MS && interacting
    ? 'time'
    : null;
}

/**
 * One row per user for the Live now card: a user with several tabs open
 * shows once. A stuck session wins; otherwise the page they opened last.
 */
export function onePerUser<
  T extends { userId: string; stuck: boolean; enteredAt: Date },
>(rows: T[]): T[] {
  const byUser = new Map<string, T>();
  for (const row of rows) {
    const current = byUser.get(row.userId);
    const better =
      !current ||
      (row.stuck !== current.stuck
        ? row.stuck
        : row.enteredAt.getTime() > current.enteredAt.getTime());
    if (better) byUser.set(row.userId, row);
  }
  // Longest on page first.
  return [...byUser.values()].sort(
    (a, b) => a.enteredAt.getTime() - b.enteredAt.getTime(),
  );
}

@Injectable()
export class PresenceService {
  constructor(private readonly prisma: PrismaService) {}

  async heartbeat(user: JwtPayload, dto: HeartbeatDto) {
    if (!user.orgId) return { ok: true };

    // A session belongs to whoever opened it — ignore anyone else's id.
    const existing = await this.prisma.userPageSession.findUnique({
      where: { sessionId: dto.sessionId },
      select: { userId: true, status: true },
    });
    if (existing && existing.userId !== user.sub) return { ok: true };
    // "left" is final. Requests can arrive out of order (the enter/heartbeat
    // of a page the user already navigated away from landing after its
    // leave); letting those reactivate the row leaves a ghost session that
    // shows the user on two pages at once.
    if (existing?.status === 'left') return { ok: true };

    const now = new Date();
    const lastInteractionAt =
      typeof dto.lastInteractionAt === 'number'
        ? new Date(Math.min(dto.lastInteractionAt, now.getTime()))
        : undefined;
    const status = dto.event === 'leave' ? 'left' : 'active';

    const update = {
      lastHeartbeatAt: now,
      visible: dto.visible,
      status,
      ...(lastInteractionAt ? { lastInteractionAt } : {}),
      ...(dto.errorCount !== undefined ? { errorCount: dto.errorCount } : {}),
    };
    try {
      await this.prisma.userPageSession.upsert({
        where: { sessionId: dto.sessionId },
        create: {
          userId: user.sub,
          orgId: user.orgId,
          route: dto.route,
          sessionId: dto.sessionId,
          visible: dto.visible,
          errorCount: dto.errorCount ?? 0,
          lastInteractionAt: lastInteractionAt ?? now,
          status,
        },
        update,
      });
    } catch (err: unknown) {
      // Enter and leave for the same new session raced on the insert. Only a
      // leave is worth re-applying; a lost enter/heartbeat is harmless.
      if (
        !(err instanceof Prisma.PrismaClientKnownRequestError) ||
        err.code !== 'P2002'
      ) {
        throw err;
      }
      if (status === 'left') {
        await this.prisma.userPageSession.updateMany({
          where: { sessionId: dto.sessionId, userId: user.sub },
          data: update,
        });
      }
    }
    return { ok: true };
  }

  async listLive() {
    const now = new Date();
    const sessions = await this.prisma.userPageSession.findMany({
      where: {
        status: 'active',
        lastHeartbeatAt: { gte: new Date(now.getTime() - LIVE_WINDOW_MS) },
      },
      orderBy: { enteredAt: 'asc' },
      take: 200,
    });
    if (sessions.length === 0) return [];

    const [users, orgs] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: [...new Set(sessions.map((s) => s.userId))] } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          userRoles: { select: { role: { select: { name: true } } } },
        },
      }),
      this.prisma.organisation.findMany({
        where: { id: { in: [...new Set(sessions.map((s) => s.orgId))] } },
        select: { id: true, name: true },
      }),
    ]);
    const userById = new Map(users.map((u) => [u.id, u]));
    const orgById = new Map(orgs.map((o) => [o.id, o]));

    const rows = await Promise.all(
      sessions.map(async (session) => {
        const task = taskPageFor(session.route);
        // Only look for a success event once the session is otherwise overdue.
        const completed =
          !!task &&
          stuckReason(session, false, now) === 'time' &&
          (await this.prisma.auditLog.count({
            where: {
              orgId: session.orgId,
              actorId: session.userId,
              action: { in: task.successActions },
              createdAt: { gte: session.enteredAt },
            },
          })) > 0;
        const reason = stuckReason(session, completed, now);
        const user = userById.get(session.userId);
        return {
          sessionId: session.sessionId,
          orgId: session.orgId,
          orgName: orgById.get(session.orgId)?.name ?? 'Unknown organisation',
          userId: session.userId,
          userName:
            [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
            user?.email ||
            'Unknown user',
          role: user?.userRoles.map((r) => r.role.name).join(', ') || null,
          phone: user?.phoneNumber ?? null,
          route: session.route,
          pageLabel: task?.label ?? session.route,
          enteredAt: session.enteredAt,
          minutesOnPage: Math.floor(
            (now.getTime() - session.enteredAt.getTime()) / MINUTE_MS,
          ),
          visible: session.visible,
          errorCount: session.errorCount,
          stuck: reason !== null,
          stuckReason: reason,
        };
      }),
    );

    return onePerUser(rows).sort((a, b) => Number(b.stuck) - Number(a.stuck));
  }
}
