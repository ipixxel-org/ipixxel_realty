import { BadRequestException } from '@nestjs/common';
import {
  aggregateReactions,
  assertEmoji,
  decodeCursor,
  dmKeyFor,
  dmPeerId,
  encodeCursor,
  messagePreview,
} from './team-chat.shared';
import {
  computeEffectivePermissions,
  PERMISSION_MODULE_KEYS,
} from '../../common/utils/permissions.util';

describe('team chat helpers', () => {
  it('round-trips the (createdAt, id) cursor', () => {
    const m = {
      createdAt: new Date('2026-10-07T10:11:12.345Z'),
      id: 'abc-123',
    };
    expect(decodeCursor(encodeCursor(m))).toEqual(m);
  });

  it('rejects a malformed cursor', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(BadRequestException);
  });

  it('gives both participants the same DM key', () => {
    expect(dmKeyFor('b', 'a')).toBe('a:b');
    expect(dmKeyFor('a', 'b')).toBe('a:b');
    expect(dmPeerId('a:b', 'a')).toBe('b');
    expect(dmPeerId('a:b', 'b')).toBe('a');
    expect(dmPeerId('a:b', 'c')).toBeNull();
    expect(dmPeerId(null, 'a')).toBeNull();
  });

  it.each(['👍', '❤️', '👍🏽', '👨‍👩‍👧', '🇮🇳', '1️⃣'])('accepts emoji %s', (e) => {
    expect(assertEmoji(e)).toBe(e);
  });

  it.each(['', 'a', '👍 👍', 'hi👍', '<script>'])(
    'rejects %p as a reaction',
    (e) => {
      expect(() => assertEmoji(e)).toThrow(BadRequestException);
    },
  );

  it('aggregates reactions per emoji with "me" and who reacted', () => {
    const u = (id: string) => ({
      id,
      firstName: id,
      lastName: null,
      email: `${id}@x`,
    });
    const result = aggregateReactions(
      [
        { emoji: '👍', user: u('a') },
        { emoji: '👍', user: u('b') },
        { emoji: '😂', user: u('c') },
      ],
      'b',
    );
    expect(result).toEqual([
      {
        emoji: '👍',
        count: 2,
        me: true,
        users: [
          { id: 'a', name: 'a' },
          { id: 'b', name: 'b' },
        ],
      },
      { emoji: '😂', count: 1, me: false, users: [{ id: 'c', name: 'c' }] },
    ]);
  });

  it('previews deleted, text and file-only messages', () => {
    const base = { kind: 'text', body: '', deletedAt: null as Date | null };
    expect(messagePreview({ ...base, deletedAt: new Date() })).toBe(
      'This message was deleted',
    );
    expect(messagePreview({ ...base, body: 'hello' })).toBe('hello');
    expect(
      messagePreview({ ...base, attachments: [{ fileName: 'a.pdf' }] }),
    ).toBe('📎 a.pdf');
    const file = (mimeType: string) => ({
      ...base,
      attachments: [{ fileName: 'x', mimeType }],
    });
    expect(messagePreview(file('image/png'))).toBe('📷 Photo');
    expect(messagePreview(file('video/mp4'))).toBe('🎥 Video');
    expect(messagePreview(file('application/pdf'))).toBe('📎 x');
    expect(messagePreview({ ...file('image/png'), body: 'look at this' })).toBe(
      'look at this',
    );
  });
});

describe('team_chat permission defaults', () => {
  const effective = (roleKey: string) =>
    computeEffectivePermissions({
      roleKeys: [roleKey],
      rolePermissions: [],
      userOverrides: [],
    });

  it('is in the org permission catalog', () => {
    expect(PERMISSION_MODULE_KEYS).toContain('team_chat');
    expect(PERMISSION_MODULE_KEYS).not.toContain('teams');
  });

  it.each([
    ['admin', { view: true, add: true, edit: true, delete: true }],
    ['manager', { view: true, add: true, edit: true, delete: false }],
    ['sales', { view: true, add: true, edit: false, delete: false }],
    ['telecaller', { view: true, add: false, edit: false, delete: false }],
    [
      'some_custom_role',
      { view: false, add: false, edit: false, delete: false },
    ],
  ] as const)('%s defaults', (role, expected) => {
    const { has } = effective(role);
    for (const [action, allowed] of Object.entries(expected)) {
      expect([action, has('team_chat', action as 'view')]).toEqual([
        action,
        allowed,
      ]);
    }
  });
});
