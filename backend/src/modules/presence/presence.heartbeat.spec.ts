import { onePerUser, PresenceService } from './presence.service';
import type { PrismaService } from '../../database/prisma.service';
import type { HeartbeatDto } from './dto/heartbeat.dto';

const user = { sub: 'user-1', orgId: 'org-1', roles: ['admin'] };

function dto(overrides: Partial<HeartbeatDto> = {}): HeartbeatDto {
  return {
    event: 'heartbeat',
    route: '/org/projects',
    sessionId: 'session-1',
    visible: true,
    ...overrides,
  };
}

describe('PresenceService.heartbeat', () => {
  let service: PresenceService;
  let session: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    updateMany: jest.Mock;
  };

  beforeEach(() => {
    session = {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    };
    service = new PresenceService({
      userPageSession: session,
    } as unknown as PrismaService);
  });

  it('marks the session left on leave', async () => {
    await service.heartbeat(user, dto({ event: 'leave' }));
    const args = session.upsert.mock.calls[0] as [
      { create: { status: string }; update: { status: string } },
    ];
    expect(args[0].update.status).toBe('left');
    expect(args[0].create.status).toBe('left');
  });

  it('never reactivates a session that has already left', async () => {
    session.findUnique.mockResolvedValue({ userId: 'user-1', status: 'left' });
    await service.heartbeat(user, dto({ event: 'enter' }));
    await service.heartbeat(user, dto({ event: 'heartbeat' }));
    expect(session.upsert).not.toHaveBeenCalled();
  });

  it("ignores a heartbeat for another user's session", async () => {
    session.findUnique.mockResolvedValue({
      userId: 'user-2',
      status: 'active',
    });
    await service.heartbeat(user, dto());
    expect(session.upsert).not.toHaveBeenCalled();
  });

  it('skips users without an organisation', async () => {
    await service.heartbeat({ ...user, orgId: null }, dto());
    expect(session.findUnique).not.toHaveBeenCalled();
  });
});

describe('onePerUser', () => {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

  it('keeps the most recently opened page for a user with several sessions', () => {
    const rows = onePerUser([
      { userId: 'u1', route: '/org/projects', stuck: false, enteredAt: at(5) },
      { userId: 'u1', route: '/org/leads', stuck: false, enteredAt: at(1) },
      { userId: 'u2', route: '/org', stuck: false, enteredAt: at(3) },
    ]);
    expect(rows.map((r) => r.route)).toEqual(['/org', '/org/leads']);
  });

  it('prefers a stuck session over a newer one', () => {
    const rows = onePerUser([
      {
        userId: 'u1',
        route: '/org/projects/add-new-project',
        stuck: true,
        enteredAt: at(12),
      },
      { userId: 'u1', route: '/org/leads', stuck: false, enteredAt: at(1) },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].route).toBe('/org/projects/add-new-project');
  });
});
