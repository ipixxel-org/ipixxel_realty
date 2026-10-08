import { Injectable, OnModuleDestroy } from '@nestjs/common';

/** How long a user stays "online" after their last socket closes, so a page
 *  reload or a brief network drop doesn't flash "last seen". */
export function presenceGraceMs(): number {
  const ms = Number(process.env.TEAM_CHAT_PRESENCE_GRACE_MS);
  return Number.isFinite(ms) && ms >= 0 ? ms : 10_000;
}

interface Entry {
  orgId: string;
  sockets: number;
  offlineTimer: NodeJS.Timeout | null;
}

/**
 * Who is online, per this API process: a connection counter per user (one
 * user may have several tabs/devices). In memory on purpose — single API
 * instance, no Redis. Only the "last seen" time is persisted, when a user
 * actually goes offline.
 */
@Injectable()
export class TeamChatPresenceService implements OnModuleDestroy {
  private readonly users = new Map<string, Entry>();

  /** Counts a new socket. True when the user just came online (they were
   *  neither connected nor inside the grace period). */
  connected(userId: string, orgId: string): boolean {
    const entry = this.users.get(userId);
    if (entry) {
      entry.sockets += 1;
      if (entry.offlineTimer) {
        clearTimeout(entry.offlineTimer);
        entry.offlineTimer = null;
      }
      return false;
    }
    this.users.set(userId, { orgId, sockets: 1, offlineTimer: null });
    return true;
  }

  /** Counts a closed socket. When it was the user's last one, waits the grace
   *  period and then calls `onOffline` — unless they reconnected meanwhile. */
  disconnected(userId: string, onOffline: (orgId: string) => void): void {
    const entry = this.users.get(userId);
    if (!entry) return;
    entry.sockets = Math.max(0, entry.sockets - 1);
    if (entry.sockets > 0 || entry.offlineTimer) return;
    entry.offlineTimer = setTimeout(() => {
      const current = this.users.get(userId);
      if (current !== entry || entry.sockets > 0) return;
      this.users.delete(userId);
      onOffline(entry.orgId);
    }, presenceGraceMs());
    entry.offlineTimer.unref?.();
  }

  isOnline(userId: string): boolean {
    return this.users.has(userId);
  }

  onlineUserIds(orgId: string): string[] {
    return [...this.users.entries()]
      .filter(([, e]) => e.orgId === orgId)
      .map(([id]) => id);
  }

  onModuleDestroy() {
    for (const e of this.users.values()) {
      if (e.offlineTimer) clearTimeout(e.offlineTimer);
    }
    this.users.clear();
  }
}
