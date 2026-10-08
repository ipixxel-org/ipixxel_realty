import { TeamChatPresenceService } from './team-chat-presence.service';

describe('TeamChatPresenceService', () => {
  let presence: TeamChatPresenceService;
  const OLD = process.env.TEAM_CHAT_PRESENCE_GRACE_MS;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env.TEAM_CHAT_PRESENCE_GRACE_MS = '10000';
    presence = new TeamChatPresenceService();
  });
  afterEach(() => {
    presence.onModuleDestroy();
    jest.useRealTimers();
    process.env.TEAM_CHAT_PRESENCE_GRACE_MS = OLD;
  });

  it('reports online only for the first socket', () => {
    expect(presence.connected('u1', 'org')).toBe(true);
    expect(presence.connected('u1', 'org')).toBe(false);
    expect(presence.isOnline('u1')).toBe(true);
    expect(presence.onlineUserIds('org')).toEqual(['u1']);
    expect(presence.onlineUserIds('other')).toEqual([]);
  });

  it('goes offline only after the last socket closes and the grace period passes', () => {
    const offline = jest.fn();
    presence.connected('u1', 'org');
    presence.connected('u1', 'org');
    presence.disconnected('u1', offline);
    jest.advanceTimersByTime(20000);
    expect(offline).not.toHaveBeenCalled();
    presence.disconnected('u1', offline);
    jest.advanceTimersByTime(9999);
    expect(offline).not.toHaveBeenCalled();
    expect(presence.isOnline('u1')).toBe(true);
    jest.advanceTimersByTime(1);
    expect(offline).toHaveBeenCalledWith('org');
    expect(presence.isOnline('u1')).toBe(false);
  });

  it('a reconnect inside the grace period keeps the user online silently', () => {
    const offline = jest.fn();
    presence.connected('u1', 'org');
    presence.disconnected('u1', offline);
    jest.advanceTimersByTime(5000);
    expect(presence.connected('u1', 'org')).toBe(false);
    jest.advanceTimersByTime(20000);
    expect(offline).not.toHaveBeenCalled();
    expect(presence.isOnline('u1')).toBe(true);
  });
});
