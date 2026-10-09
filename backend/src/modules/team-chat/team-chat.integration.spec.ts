/**
 * Team Chat access rules against a real PostgreSQL database.
 *
 * Opt-in: runs only when TEAM_CHAT_TEST_DATABASE_URL points at a throwaway
 * database with all migrations applied (never your dev/prod DATABASE_URL).
 * Each run creates its own orgs/users with random ids, so it can be re-run.
 *
 *   TEAM_CHAT_TEST_DATABASE_URL=postgresql://.../chat_scratch npx jest team-chat.integration
 */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { JwtPayload } from '../../common/types/jwt-payload.interface';
import { hasOrgPermission } from '../../common/guards/permission.guard';
import {
  ensureGeneralChannel,
  teamChatUserActivated,
  teamChatUserDeactivated,
} from '../../common/utils/team-chat-membership.util';
import { TeamChatAccessService } from './team-chat-access.service';
import { TeamChatConversationsService } from './team-chat-conversations.service';
import { TeamChatMessagesService } from './team-chat-messages.service';
import { TeamChatPresenceService } from './team-chat-presence.service';
import { TeamChatRealtimeService } from './team-chat-realtime.service';
import { TeamChatUnreadService } from './team-chat-unread.service';

const DB_URL = process.env.TEAM_CHAT_TEST_DATABASE_URL;
const suite = DB_URL ? describe : describe.skip;

suite('Team Chat access rules (integration)', () => {
  let prisma: PrismaClient;
  let conv: TeamChatConversationsService;
  let msgs: TeamChatMessagesService;

  const run = randomUUID().slice(0, 8);
  const orgA = `org-a-${run}`;
  const orgB = `org-b-${run}`;
  const users: Record<string, JwtPayload> = {};
  let n = 0;
  const cid = () => `client-${run}-${++n}`;

  async function role(key: string) {
    const existing = await prisma.role.findFirst({
      where: { orgId: null, key },
    });
    return (
      existing ??
      prisma.role.create({ data: { key, name: key, scope: 'organisation' } })
    );
  }

  async function user(name: string, orgId: string, roleKey: string) {
    const id = randomUUID();
    const r = await role(roleKey);
    await prisma.user.create({
      data: {
        id,
        orgId,
        firstName: name,
        email: `${name}-${run}@chat.test`,
        passwordHash: 'x',
        status: 'active',
        onboardingStep: 'completed',
        userRoles: { create: { roleId: r.id } },
      },
    });
    await teamChatUserActivated(prisma, orgId, id);
    users[name] = { sub: id, orgId, roles: [roleKey] };
    return users[name];
  }

  const rail = async (who: JwtPayload) =>
    (await conv.list(who)).conversations.map((c) => c.id);

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: DB_URL } } });
    const access = new TeamChatAccessService(prisma as never);
    const unread = new TeamChatUnreadService(prisma as never);
    // Never attached to a socket server here, so every push is a no-op.
    const realtime = new TeamChatRealtimeService(prisma as never, unread);
    conv = new TeamChatConversationsService(
      prisma as never,
      access,
      unread,
      realtime,
      new TeamChatPresenceService(),
    );
    msgs = new TeamChatMessagesService(
      prisma as never,
      access,
      unread,
      realtime,
    );

    await prisma.organisation.createMany({
      data: [
        { id: orgA, name: 'Chat Org A', slug: orgA },
        { id: orgB, name: 'Chat Org B', slug: orgB },
      ],
    });
    await user('admin', orgA, 'admin');
    await user('manager', orgA, 'manager');
    await user('sales', orgA, 'sales');
    await user('sales2', orgA, 'sales');
    await user('tele', orgA, 'telecaller');
    await user('outsider', orgB, 'admin');
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  // -------------------------------------------------------------------------

  it('gives every org exactly one General, with every active member', async () => {
    await Promise.all(
      [1, 2, 3, 4, 5].map(() => ensureGeneralChannel(prisma, orgA)),
    );
    const generals = await prisma.teamChannel.findMany({
      where: { orgId: orgA, kind: 'general' },
    });
    expect(generals).toHaveLength(1);
    const members = await prisma.teamChannelMember.count({
      where: { channelId: generals[0].id },
    });
    expect(members).toBe(5);
    const joined = await prisma.teamMessage.count({
      where: {
        channelId: generals[0].id,
        kind: 'system',
        body: { endsWith: ' joined' },
      },
    });
    expect(joined).toBe(5);
  });

  it('blocks non-members from reading, posting or listing members', async () => {
    const ch = await conv.createChannel(users.manager, {
      name: 'deals',
      memberIds: [users.sales.sub],
    });
    await expect(msgs.list(users.tele, ch.id, {})).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      msgs.send(users.tele, ch.id, { body: 'hi', clientMsgId: cid() }),
    ).rejects.toThrow(NotFoundException);
    await expect(conv.members(users.tele, ch.id)).rejects.toThrow(
      NotFoundException,
    );
    expect(await rail(users.tele)).not.toContain(ch.id);
    // ...and nothing auto-joined them (S1).
    expect(
      await prisma.teamChannelMember.count({
        where: { channelId: ch.id, userId: users.tele.sub },
      }),
    ).toBe(0);
  });

  it('keeps DMs invisible to third parties, org admins included', async () => {
    const dm = await conv.openDm(users.sales, { userId: users.tele.sub });
    const m = await msgs.send(users.sales, dm.id, {
      body: 'secret',
      clientMsgId: cid(),
    });

    expect(await rail(users.admin)).not.toContain(dm.id);
    await expect(msgs.list(users.admin, dm.id, {})).rejects.toThrow(
      NotFoundException,
    );
    await expect(msgs.react(users.admin, m.id, '👍')).rejects.toThrow(
      NotFoundException,
    );
    await expect(msgs.remove(users.admin, m.id)).rejects.toThrow(
      NotFoundException,
    );
    await expect(msgs.forward(users.admin, m.id, [dm.id])).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      msgs.search(users.admin, dm.id, { q: 'secret' }),
    ).rejects.toThrow(NotFoundException);

    const seen = await msgs.list(users.tele, dm.id, {});
    expect(seen.messages.map((x) => x.body)).toEqual(['secret']);
  });

  it('blocks cross-org access by id', async () => {
    const general = await prisma.teamChannel.findFirstOrThrow({
      where: { orgId: orgA, kind: 'general' },
    });
    await expect(msgs.list(users.outsider, general.id, {})).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      msgs.send(users.outsider, general.id, { body: 'x', clientMsgId: cid() }),
    ).rejects.toThrow(NotFoundException);
    await expect(
      conv.openDm(users.outsider, { userId: users.sales.sub }),
    ).rejects.toThrow(BadRequestException);
  });

  it('protects General: no delete, leave, manual members, or rename by non-admins', async () => {
    const general = await prisma.teamChannel.findFirstOrThrow({
      where: { orgId: orgA, kind: 'general' },
    });
    await expect(conv.deleteChannel(users.admin, general.id)).rejects.toThrow(
      BadRequestException,
    );
    await expect(conv.leave(users.sales, general.id)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      conv.removeMember(users.admin, general.id, users.sales.sub),
    ).rejects.toThrow(BadRequestException);
    await expect(
      conv.addMembers(users.admin, general.id, { userIds: [users.sales.sub] }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      conv.renameChannel(users.manager, general.id, { name: 'Everyone' }),
    ).rejects.toThrow(ForbiddenException);
    const renamed = await conv.renameChannel(users.admin, general.id, {
      name: 'Everyone',
    });
    expect(renamed.name).toBe('Everyone');
  });

  it('makes a duplicate DM impossible, even when both sides open it at once', async () => {
    const [a, b] = await Promise.all([
      conv.openDm(users.sales2, { userId: users.manager.sub }),
      conv.openDm(users.manager, { userId: users.sales2.sub }),
    ]);
    expect(a.id).toBe(b.id);
    const again = await conv.openDm(users.sales2, {
      userId: users.manager.sub,
    });
    expect(again.id).toBe(a.id);
    // Each side sees the *other* person's name.
    expect(a.name === b.name).toBe(false);
  });

  it('sends idempotently by clientMsgId', async () => {
    const ch = await conv.createChannel(users.sales, {
      name: 'idem',
      memberIds: [users.sales2.sub],
    });
    const id = cid();
    const [x, y] = await Promise.all([
      msgs.send(users.sales, ch.id, { body: 'once', clientMsgId: id }),
      msgs.send(users.sales, ch.id, { body: 'once', clientMsgId: id }),
    ]);
    const z = await msgs.send(users.sales, ch.id, {
      body: 'once',
      clientMsgId: id,
    });
    expect(new Set([x.id, y.id, z.id]).size).toBe(1);
    expect(
      await prisma.teamMessage.count({
        where: { channelId: ch.id, kind: 'text' },
      }),
    ).toBe(1);
    await expect(
      msgs.send(users.sales2, ch.id, { body: 'other', clientMsgId: id }),
    ).rejects.toThrow(ConflictException);
    await expect(
      msgs.send(users.sales, ch.id, { body: '   ', clientMsgId: cid() }),
    ).rejects.toThrow(BadRequestException);
  });

  it('applies the team_chat permission matrix', async () => {
    const can = (who: string, action: 'view' | 'add' | 'edit' | 'delete') =>
      hasOrgPermission(prisma, users[who], 'team_chat', action);
    expect(await can('tele', 'view')).toBe(true);
    expect(await can('tele', 'add')).toBe(false);
    expect(await can('sales', 'add')).toBe(true);
    expect(await can('sales', 'edit')).toBe(false);
    expect(await can('manager', 'edit')).toBe(true);
    expect(await can('manager', 'delete')).toBe(false);
    expect(await can('admin', 'delete')).toBe(true);

    // Rename / members: channel admin OR team_chat:edit.
    const byManager = await conv.createChannel(users.manager, {
      name: 'mgr',
      memberIds: [users.sales.sub, users.sales2.sub],
    });
    await expect(
      conv.renameChannel(users.sales, byManager.id, { name: 'nope' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      conv.removeMember(users.sales, byManager.id, users.sales2.sub),
    ).rejects.toThrow(ForbiddenException);
    const bySales = await conv.createChannel(users.sales, {
      name: 'sales-room',
      memberIds: [users.manager.sub, users.sales2.sub],
    });
    await expect(
      conv.renameChannel(users.manager, bySales.id, { name: 'renamed' }),
    ).resolves.toMatchObject({ name: 'renamed' });
    await expect(
      conv.removeMember(users.manager, bySales.id, users.sales2.sub),
    ).resolves.toMatchObject({ removed: users.sales2.sub });

    // Others' messages: team_chat:delete, channels only.
    const m = await msgs.send(users.sales, byManager.id, {
      body: 'x',
      clientMsgId: cid(),
    });
    await expect(msgs.remove(users.manager, m.id)).rejects.toThrow(
      ForbiddenException,
    );
    await conv.addMembers(users.manager, byManager.id, {
      userIds: [users.admin.sub],
    });
    await expect(msgs.remove(users.admin, m.id)).resolves.toMatchObject({
      body: '',
    });

    const dm = await conv.openDm(users.admin, { userId: users.sales.sub });
    const dmMsg = await msgs.send(users.sales, dm.id, {
      body: 'mine',
      clientMsgId: cid(),
    });
    await expect(msgs.remove(users.admin, dmMsg.id)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(msgs.remove(users.sales, dmMsg.id)).resolves.toMatchObject({
      body: '',
    });
  });

  it('counts unread without own or system messages; reading moves the pointer', async () => {
    const ch = await conv.createChannel(users.sales, {
      name: 'unread',
      memberIds: [users.tele.sub],
    });
    await msgs.send(users.sales, ch.id, { body: 'one', clientMsgId: cid() });
    const two = await msgs.send(users.sales, ch.id, {
      body: 'two',
      clientMsgId: cid(),
    });
    const unread = async (who: JwtPayload) =>
      (await conv.list(who)).conversations.find((c) => c.id === ch.id)!.unread;
    expect(await unread(users.tele)).toBe(2);
    expect(await unread(users.sales)).toBe(0);
    // Fetching does not mark read (B6)...
    await msgs.list(users.tele, ch.id, {});
    expect(await unread(users.tele)).toBe(2);
    // ...the explicit read does.
    const r = await msgs.markRead(users.tele, ch.id, { messageId: two.id });
    expect(r.unread).toBe(0);
  });

  it('keeps one reaction per user: toggle, replace, cleared on delete', async () => {
    const ch = await conv.createChannel(users.sales, {
      name: 'react',
      memberIds: [users.tele.sub],
    });
    const m = await msgs.send(users.sales, ch.id, {
      body: 'react to me',
      clientMsgId: cid(),
    });
    let r = await msgs.react(users.tele, m.id, '👍');
    expect(r.reactions).toEqual([
      expect.objectContaining({ emoji: '👍', count: 1, me: true }),
    ]);
    r = await msgs.react(users.tele, m.id, '❤️');
    expect(r.reactions.map((x) => x.emoji)).toEqual(['❤️']);
    r = await msgs.react(users.tele, m.id, '❤️');
    expect(r.reactions).toEqual([]);
    await msgs.react(users.sales, m.id, '😂');
    await msgs.remove(users.sales, m.id);
    expect(
      await prisma.teamMessageReaction.count({ where: { messageId: m.id } }),
    ).toBe(0);
    await expect(msgs.react(users.tele, m.id, '👍')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('caps pins at 3 and posts a system message per pin', async () => {
    const ch = await conv.createChannel(users.sales, {
      name: 'pins',
      memberIds: [],
    });
    const sent: { id: string }[] = [];
    for (let i = 0; i < 4; i++) {
      sent.push(
        await msgs.send(users.sales, ch.id, {
          body: `p${i}`,
          clientMsgId: cid(),
        }),
      );
    }
    for (const m of sent.slice(0, 3)) await msgs.pin(users.sales, m.id);
    await expect(msgs.pin(users.sales, sent[3].id)).rejects.toThrow(
      ConflictException,
    );
    expect(await msgs.pins(users.sales, ch.id)).toHaveLength(3);
    expect(
      await prisma.teamMessage.count({
        where: {
          channelId: ch.id,
          kind: 'system',
          body: { endsWith: 'pinned a message' },
        },
      }),
    ).toBe(3);
  });

  it('pages on (createdAt, id): before, after and around', async () => {
    const ch = await conv.createChannel(users.sales, {
      name: 'paging',
      memberIds: [],
    });
    for (let i = 0; i < 7; i++) {
      await msgs.send(users.sales, ch.id, {
        body: `m${i}`,
        clientMsgId: cid(),
      });
    }
    const bodies = (p: { messages: { body: string; kind: string }[] }) =>
      p.messages.filter((m) => m.kind !== 'system').map((m) => m.body);
    const latest = await msgs.list(users.sales, ch.id, { limit: 3 });
    expect(bodies(latest)).toEqual(['m4', 'm5', 'm6']);
    expect(latest.hasMoreBefore).toBe(true);
    const older = await msgs.list(users.sales, ch.id, {
      limit: 3,
      before: latest.oldestCursor!,
    });
    expect(bodies(older)).toEqual(['m1', 'm2', 'm3']);
    const newer = await msgs.list(users.sales, ch.id, {
      after: older.newestCursor!,
    });
    expect(bodies(newer)).toEqual(['m4', 'm5', 'm6']);
    const target = older.messages.find((m) => m.body === 'm2')!;
    const around = await msgs.list(users.sales, ch.id, {
      around: target.id,
      limit: 4,
    });
    expect(bodies(around)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4']);
  });

  it('forwards only between conversations the caller belongs to', async () => {
    const src = await conv.createChannel(users.sales, {
      name: 'fwd-src',
      memberIds: [],
    });
    const m = await msgs.send(users.sales, src.id, {
      body: 'pass it on',
      clientMsgId: cid(),
    });
    const notMine = await conv.createChannel(users.manager, {
      name: 'fwd-other',
      memberIds: [],
    });
    await expect(msgs.forward(users.sales, m.id, [notMine.id])).rejects.toThrow(
      NotFoundException,
    );
    const dst = await conv.openDm(users.sales, { userId: users.tele.sub });
    const { messages } = await msgs.forward(users.sales, m.id, [dst.id]);
    expect(messages).toEqual([
      expect.objectContaining({
        conversationId: dst.id,
        body: 'pass it on',
        forwarded: true,
      }),
    ]);
    // The copy is stored as the forwarder's, but can't be reworded.
    await expect(
      msgs.edit(users.sales, messages[0].id, { body: 'changed' }),
    ).rejects.toThrow('Forwarded messages cannot be edited');
  });

  it('notifies mentioned members once, in their own bell', async () => {
    const ch = await conv.createChannel(users.manager, {
      name: 'mentions',
      memberIds: [users.sales.sub],
    });
    const bell = (who: JwtPayload) =>
      prisma.notification.findMany({
        where: {
          recipientId: who.sub,
          type: 'team_chat_mention',
          entityId: ch.id,
        },
      });

    // Non-members can't be mentioned.
    await expect(
      msgs.send(users.manager, ch.id, {
        body: '@tele hi',
        clientMsgId: cid(),
        mentionUserIds: [users.tele.sub],
      }),
    ).rejects.toThrow(BadRequestException);

    const m = await msgs.send(users.manager, ch.id, {
      body: '@sales please check',
      clientMsgId: cid(),
      mentionUserIds: [users.sales.sub, users.manager.sub],
    });
    expect(m.mentions.map((u) => u.id)).toEqual([users.sales.sub]);
    const first = await bell(users.sales);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      orgId: orgA,
      title: 'manager mentioned you in #mentions',
      body: '@sales please check',
      entity: 'TeamChannel',
    });
    expect(await bell(users.manager)).toHaveLength(0); // never yourself

    // Editing with the same mention doesn't notify again.
    await msgs.edit(users.manager, m.id, {
      body: '@sales please check now',
      mentionUserIds: [users.sales.sub],
    });
    expect(await bell(users.sales)).toHaveLength(1);
  });

  it('on deactivation removes the user from channels and makes their DMs read-only', async () => {
    const leaver = await user('leaver', orgA, 'sales');
    const ch = await conv.createChannel(users.sales, {
      name: 'bye',
      memberIds: [leaver.sub],
    });
    const dm = await conv.openDm(users.sales, { userId: leaver.sub });
    await msgs.send(leaver, dm.id, { body: 'last words', clientMsgId: cid() });

    await prisma.user.update({
      where: { id: leaver.sub },
      data: { status: 'disabled' },
    });
    await teamChatUserDeactivated(prisma, orgA, leaver.sub);

    const members = await conv.members(users.sales, ch.id);
    expect(members.map((x) => x.id)).not.toContain(leaver.sub);
    const entry = (await conv.list(users.sales)).conversations.find(
      (c) => c.id === dm.id,
    )!;
    expect(entry.readOnly).toBe(true);
    expect(
      (await msgs.list(users.sales, dm.id, {})).messages.map((x) => x.body),
    ).toContain('last words');
    await expect(
      msgs.send(users.sales, dm.id, { body: 'hello?', clientMsgId: cid() }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('only offers DMs with active users who have team_chat:view', async () => {
    // A custom role gets no chat access until granted.
    const noChat = await user('zednochat', orgA, `custom_${run}`);
    const disabled = await user('zeddisabled', orgA, 'sales');
    await prisma.user.update({
      where: { id: disabled.sub },
      data: { status: 'disabled' },
    });
    const ids = async (q: string) =>
      (await conv.search(users.sales, q)).users.map((u) => u.id);

    let found = await ids('zed');
    expect(found).not.toContain(noChat.sub);
    expect(found).not.toContain(disabled.sub);
    expect(await ids('sales')).not.toContain(users.sales.sub); // never yourself
    expect(await ids('sales')).toContain(users.sales2.sub);

    await expect(
      conv.openDm(users.sales, { userId: noChat.sub }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      conv.openDm(users.sales, { userId: noChat.sub }),
    ).rejects.toThrow("doesn't have access to Team Chat");

    // A per-user grant (the override tier) makes them reachable.
    await prisma.userModulePermission.create({
      data: {
        orgId: orgA,
        userId: noChat.sub,
        moduleKey: 'team_chat',
        canView: true,
      },
    });
    found = await ids('zed');
    expect(found).toContain(noChat.sub);
    await expect(
      conv.openDm(users.sales, { userId: noChat.sub }),
    ).resolves.toMatchObject({ kind: 'dm', name: 'zednochat' });

    // ...and a per-user revoke hides an otherwise-allowed sales user.
    await prisma.userModulePermission.create({
      data: {
        orgId: orgA,
        userId: users.sales2.sub,
        moduleKey: 'team_chat',
        canView: false,
      },
    });
    expect(await ids('sales')).not.toContain(users.sales2.sub);
  });

  it('applies the Admin role setting to the org admin too', async () => {
    const outsider = users.outsider; // the only admin in org B
    const can = (action: 'view' | 'delete') =>
      hasOrgPermission(prisma, outsider, 'team_chat', action, true);
    // No row for the Admin role: full access, as before.
    expect(await can('view')).toBe(true);

    // Team Chat switched off for the Admin role (Super Admin's system row
    // and an org row merge the same way; an org row keeps this test local).
    const adminRole = await role('admin');
    await prisma.roleModulePermission.create({
      data: {
        orgId: orgB,
        roleId: adminRole.id,
        moduleKey: 'team_chat',
        canView: false,
      },
    });
    expect(await can('view')).toBe(false);
    expect(await can('delete')).toBe(false);
    // ...without the flag the admin would still pass (the old bug).
    expect(
      await hasOrgPermission(prisma, outsider, 'team_chat', 'view'),
    ).toBe(true);

    // Nobody can find or message them either.
    const second = await user('obadmin2', orgB, 'sales');
    expect(
      (await conv.search(second, 'outsider')).users.map((u) => u.id),
    ).not.toContain(outsider.sub);
    await expect(
      conv.openDm(second, { userId: outsider.sub }),
    ).rejects.toThrow("doesn't have access to Team Chat");
  });
});
