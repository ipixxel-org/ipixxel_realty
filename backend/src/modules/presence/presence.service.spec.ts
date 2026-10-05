import { stuckReason, taskPageFor } from './presence.service';

const MIN = 60 * 1000;
const now = new Date('2026-10-01T12:00:00Z');

function session(overrides: {
  route?: string;
  minutesOnPage?: number;
  minutesSinceInteraction?: number | null;
  errorCount?: number;
}) {
  const sinceInteraction =
    overrides.minutesSinceInteraction === undefined
      ? 0
      : overrides.minutesSinceInteraction;
  return {
    route: overrides.route ?? '/org/projects/add-new-project',
    enteredAt: new Date(now.getTime() - (overrides.minutesOnPage ?? 0) * MIN),
    lastInteractionAt:
      sinceInteraction === null
        ? null
        : new Date(now.getTime() - sinceInteraction * MIN),
    errorCount: overrides.errorCount ?? 0,
  };
}

describe('taskPageFor', () => {
  it('matches the three task pages', () => {
    expect(taskPageFor('/org/projects/add-new-project')?.thresholdMinutes).toBe(
      10,
    );
    expect(
      taskPageFor('/org/projects/all-units/create')?.thresholdMinutes,
    ).toBe(8);
    expect(taskPageFor('/org-builder')?.thresholdMinutes).toBe(25);
  });

  it('ignores ordinary pages', () => {
    expect(taskPageFor('/org/projects')).toBeNull();
    expect(taskPageFor('/org/settings')).toBeNull();
  });
});

describe('stuckReason', () => {
  it('is not stuck before the threshold', () => {
    expect(stuckReason(session({ minutesOnPage: 9 }), false, now)).toBeNull();
  });

  it('is stuck past the threshold while still interacting', () => {
    expect(stuckReason(session({ minutesOnPage: 11 }), false, now)).toBe(
      'time',
    );
  });

  it('is not stuck when the user has gone idle', () => {
    expect(
      stuckReason(
        session({ minutesOnPage: 30, minutesSinceInteraction: 4 }),
        false,
        now,
      ),
    ).toBeNull();
    expect(
      stuckReason(
        session({ minutesOnPage: 30, minutesSinceInteraction: null }),
        false,
        now,
      ),
    ).toBeNull();
  });

  it('clears once the task has been completed', () => {
    expect(stuckReason(session({ minutesOnPage: 30 }), true, now)).toBeNull();
  });

  it('never flags time on a non-task page', () => {
    expect(
      stuckReason(
        session({ route: '/org/settings', minutesOnPage: 90 }),
        false,
        now,
      ),
    ).toBeNull();
  });

  it('flags two failed submits on any page, regardless of time', () => {
    expect(stuckReason(session({ errorCount: 1 }), false, now)).toBeNull();
    expect(stuckReason(session({ errorCount: 2 }), false, now)).toBe('errors');
    expect(
      stuckReason(
        session({ route: '/org/settings', errorCount: 3 }),
        true,
        now,
      ),
    ).toBe('errors');
  });
});
