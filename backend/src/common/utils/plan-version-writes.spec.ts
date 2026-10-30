/**
 * Guard: every subscription write that sets a plan also sets its version
 * (planVersionId), so an org is never left on "whatever the plan is now".
 * Scans the source: each subscription.create / update / updateMany / upsert
 * whose `data: { … }` literal sets planId (or connects a plan) must also set
 * planVersionId / planVersion. Writes that build `data` in a variable first
 * are listed in BUILT_ELSEWHERE and checked by text.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

/** The text of the balanced {…} starting at `open`. */
function block(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

interface Write {
  file: string;
  line: number;
  data: string;
}

function subscriptionWrites(): Write[] {
  const out: Write[] = [];
  const call =
    /\bsubscription\s*\.\s*(create|update|updateMany|upsert)\s*\(\s*\{/g;
  for (const path of sourceFiles(SRC)) {
    const text = readFileSync(path, 'utf8');
    for (const m of text.matchAll(call)) {
      const args = block(text, m.index + m[0].length - 1);
      // Each `data:` / `create:` / `update:` object literal in the call.
      for (const d of args.matchAll(/\b(data|create|update)\s*:\s*\{/g)) {
        out.push({
          file: relative(SRC, path).replace(/\\/g, '/'),
          line: text.slice(0, m.index).split('\n').length,
          data: block(args, d.index + d[0].length - 1),
        });
      }
    }
  }
  return out;
}

const setsPlan = (data: string) =>
  /(^|[\s{,])planId\s*[:,}]/.test(data) ||
  /\bplan\s*:\s*\{\s*connect/.test(data);
const setsVersion = (data: string) => /\bplanVersion(Id)?\s*[:,}]/.test(data);

/** Writes whose data object is built before the call: the file must set the version. */
const BUILT_ELSEWHERE = [
  'modules/org-billing/org-billing.service.ts',
  'modules/subscriptions/subscriptions.service.ts',
];

describe('every subscription write that sets a plan sets its version', () => {
  const writes = subscriptionWrites();

  it('finds the subscription writes (the scan works)', () => {
    expect(writes.length).toBeGreaterThan(20);
    expect(
      writes.filter((w) => setsPlan(w.data)).length,
    ).toBeGreaterThanOrEqual(8);
  });

  it('no data literal sets planId without planVersionId', () => {
    const missing = writes
      .filter((w) => setsPlan(w.data) && !setsVersion(w.data))
      .map((w) => `${w.file}:${w.line}`);
    expect(missing).toEqual([]);
  });

  it('writes that build their data first set the version too', () => {
    for (const file of BUILT_ELSEWHERE) {
      const text = readFileSync(join(SRC, file), 'utf8');
      expect({ file, sets: /planVersion(Id)?\b/.test(text) }).toEqual({
        file,
        sets: true,
      });
    }
  });

  it('the scan catches a write that forgets the version', () => {
    expect(setsPlan('{ planId: plan.id, amount }')).toBe(true);
    expect(setsVersion('{ planId: plan.id, amount }')).toBe(false);
    expect(setsPlan('{ plan: { connect: { id } } }')).toBe(true);
    expect(setsVersion('{ planId, planVersionId, amount }')).toBe(true);
    // Not a plan change.
    expect(
      setsPlan('{ previousPlanId: sub.planId, scheduledPlanId: null }'),
    ).toBe(false);
  });
});
