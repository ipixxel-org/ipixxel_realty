import {
  isSafeStorageKey,
  signLocalUrl,
  verifyLocalUrl,
} from './private-local.util';

describe('local signed upload/download URLs', () => {
  const OLD = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });
  afterAll(() => {
    process.env.JWT_SECRET = OLD;
  });

  const future = () => Math.floor(Date.now() / 1000) + 60;

  it('accepts its own signature', () => {
    const exp = future();
    const parts = ['public-put', 'org/x/a.png', exp, 'image/png', 100];
    expect(verifyLocalUrl(parts, exp, signLocalUrl(parts))).toBe(true);
  });

  it.each([
    ['key', ['public-put', 'org/x/b.png']],
    ['content type', ['public-put', 'org/x/a.png', 0, 'text/html']],
    ['size', ['public-put', 'org/x/a.png', 0, 'image/png', 101]],
    ['purpose', ['put', 'org/x/a.png']],
  ])('rejects a changed %s', (_label, change) => {
    const exp = future();
    const parts: Array<string | number> = [
      'public-put',
      'org/x/a.png',
      exp,
      'image/png',
      100,
    ];
    const sig = signLocalUrl(parts);
    const tampered = [...parts];
    change.forEach((v, i) => {
      if (v !== 0) tampered[i] = v;
    });
    expect(verifyLocalUrl(tampered, exp, sig)).toBe(false);
  });

  it('rejects an expired link even with a valid signature', () => {
    const exp = Math.floor(Date.now() / 1000) - 1;
    const parts = ['public-put', 'k', exp, 'image/png', 1];
    expect(verifyLocalUrl(parts, exp, signLocalUrl(parts))).toBe(false);
  });

  it.each(['../x', 'a/../../x', '/abs', 'a\\b', 'a//b', './a', '', 'a/..'])(
    'rejects unsafe key %p',
    (key) => {
      expect(isSafeStorageKey(key)).toBe(false);
    },
  );

  it('accepts generated-style keys', () => {
    expect(isSafeStorageKey('org/abc/2026/10/general/uuid-file.png')).toBe(
      true,
    );
    expect(isSafeStorageKey('team-chat/org-1/2026/10/uuid-notes.txt')).toBe(
      true,
    );
  });
});
