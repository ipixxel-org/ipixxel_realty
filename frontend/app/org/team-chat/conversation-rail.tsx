"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { openDm, searchChat } from "@/lib/team-chat/api";
import { useTeamChat } from "@/lib/team-chat/context";
import type { ChatConversation, ChatSearchResult, ChatUserResult } from "@/lib/team-chat/types";
import { Avatar, errorText } from "./chat-ui";

export function ConversationRail({
  activeId,
  onSelect,
  canCreateChannel,
  onNewChannel,
  onNewMessage,
}: {
  activeId: string | null;
  onSelect: (id: string) => void;
  canCreateChannel: boolean;
  onNewChannel: () => void;
  onNewMessage: () => void;
}) {
  const chat = useTeamChat();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const term = q.trim();
  const [found, setFound] = useState<{ term: string; result: ChatSearchResult } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!term) return;
    const mine = ++seq.current;
    const t = window.setTimeout(async () => {
      let result: ChatSearchResult = { conversations: [], users: [] };
      try {
        result = await searchChat(term);
      } catch {
        // Shown as "no matches".
      }
      if (mine === seq.current) setFound({ term, result });
    }, 250);
    return () => window.clearTimeout(t);
  }, [term]);

  if (!chat) return null;
  const searching = !!term && found?.term !== term;
  const results = term && found?.term === term ? found.result : null;
  const conversations = chat.conversations;

  const pick = (id: string) => {
    setQ("");
    onSelect(id);
  };

  const openPerson = async (u: ChatUserResult) => {
    if (u.dmConversationId) return pick(u.dmConversationId);
    setOpening(u.id);
    try {
      const conv = await openDm(u.id);
      chat.upsertConversation(conv);
      pick(conv.id);
    } catch (err) {
      toast({ title: "Couldn't open chat", description: errorText(err, "Please try again"), variant: "error" });
    } finally {
      setOpening(null);
    }
  };

  // Already sorted by latest activity; split as before into the two lists.
  const channels = (conversations ?? []).filter((c) => c.kind !== "dm");
  const dms = (conversations ?? []).filter((c) => c.kind === "dm");
  const onlyGeneral = !!conversations && conversations.length > 0 && conversations.every((c) => c.kind === "general");

  return (
    <aside className="tch-left" aria-label="Conversations">
      <div className="tch-search-row">
        <div className="tch-search-input-box">
          <Icon name="search" size={15} />
          <input
            type="text"
            placeholder="Search channels & people..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search channels and people"
          />
          {q ? (
            <button type="button" className="tch-clear" onClick={() => setQ("")} aria-label="Clear search">
              <Icon name="close" size={13} />
            </button>
          ) : null}
        </div>
      </div>

      {chat.status === "reconnecting" ? <div className="tch-conn-banner">Reconnecting…</div> : null}

      {term ? (
        searching || !results ? (
          <div className="tch-rail-note">Searching…</div>
        ) : (
          <SearchResults
            q={term}
            results={results}
            activeId={activeId}
            opening={opening}
            onConversation={pick}
            onPerson={openPerson}
          />
        )
      ) : conversations === null ? (
        chat.railError ? (
          <div className="tch-rail-note">
            <p>{chat.railError}</p>
            <button type="button" className="tch-btn-msg" onClick={() => void chat.reloadRail()}>
              Try again
            </button>
          </div>
        ) : (
          <div className="tch-rail-note">Loading…</div>
        )
      ) : (
        <>
          <div className="tch-section">
            <div className="tch-sec-title-row">
              <span>CHANNELS</span>
              {canCreateChannel ? (
                <button type="button" className="tch-sec-plus" title="Add Channel" onClick={onNewChannel}>
                  +
                </button>
              ) : null}
            </div>
            {channels.map((c) => (
              <ChannelRow key={c.id} conv={c} active={c.id === activeId} onClick={() => onSelect(c.id)} />
            ))}
          </div>

          <div className="tch-section">
            <div className="tch-sec-title-row">
              <span>DIRECT MESSAGES</span>
              <button type="button" className="tch-sec-plus" title="Start DM" onClick={onNewMessage}>
                +
              </button>
            </div>
            {dms.map((c) => (
              <DmRow key={c.id} conv={c} active={c.id === activeId} onClick={() => onSelect(c.id)} />
            ))}
            {dms.length === 0 ? (
              <div className="tch-rail-note is-left">
                {onlyGeneral
                  ? "It's just General for now. Search above or use + to message a colleague."
                  : "No direct messages yet."}
              </div>
            ) : null}
          </div>
        </>
      )}
    </aside>
  );
}

/** The open conversation is being read; don't flash a badge for it. */
function UnreadBadge({ count, active }: { count: number; active: boolean }) {
  if (active || count <= 0) return null;
  return <span className="tch-badge-count is-unread">{count > 99 ? "99+" : count}</span>;
}

function ChannelRow({ conv, active, onClick }: { conv: ChatConversation; active: boolean; onClick: () => void }) {
  const typing = useTeamChat()?.typingIn(conv.id).length ?? 0;
  return (
    <button type="button" className={`tch-channel-btn ${active ? "active" : ""}`} onClick={onClick}>
      <div className="tch-channel-left">
        <span className="tch-hash">#</span>
        <span className="tch-row-name">{conv.name}</span>
        {typing ? <span className="tch-row-typing">typing…</span> : null}
      </div>
      <UnreadBadge count={conv.unread} active={active} />
    </button>
  );
}

function DmRow({ conv, active, onClick }: { conv: ChatConversation; active: boolean; onClick: () => void }) {
  const chat = useTeamChat();
  const peer = conv.peer;
  const online =
    !!peer &&
    !conv.readOnly &&
    !!chat?.presenceOf(peer.id, { online: peer.online, lastSeenAt: peer.lastSeenAt }).online;
  const typing = (chat?.typingIn(conv.id).length ?? 0) > 0;
  return (
    <button type="button" className={`tch-dm-btn ${active ? "active" : ""}`} onClick={onClick}>
      <Avatar id={peer?.id ?? conv.id} name={conv.name} online={online} />
      <span className="tch-row-name">{conv.name}</span>
      {typing ? <span className="tch-row-typing">typing…</span> : null}
      <UnreadBadge count={conv.unread} active={active} />
    </button>
  );
}

function SearchResults({
  q,
  results,
  activeId,
  opening,
  onConversation,
  onPerson,
}: {
  q: string;
  results: ChatSearchResult;
  activeId: string | null;
  opening: string | null;
  onConversation: (id: string) => void;
  onPerson: (u: ChatUserResult) => void;
}) {
  // DMs show up under People (one entry per person).
  const channels = results.conversations.filter((c) => c.kind !== "dm");
  if (channels.length === 0 && results.users.length === 0) {
    return (
      <div className="tch-rail-note">
        <p>No people or channels match “{q}”.</p>
        <small>Only colleagues who have Team Chat access can be messaged.</small>
      </div>
    );
  }
  return (
    <>
      {channels.length ? (
        <div className="tch-section">
          <div className="tch-sec-title-row">
            <span>CHANNELS</span>
          </div>
          {channels.map((c) => (
            <ChannelRow key={c.id} conv={c} active={c.id === activeId} onClick={() => onConversation(c.id)} />
          ))}
        </div>
      ) : null}
      {results.users.length ? (
        <div className="tch-section">
          <div className="tch-sec-title-row">
            <span>PEOPLE</span>
          </div>
          {results.users.map((u) => (
            <button
              key={u.id}
              type="button"
              className="tch-dm-btn"
              onClick={() => onPerson(u)}
              disabled={opening === u.id}
              title={u.email}
            >
              <Avatar id={u.id} name={u.name} />
              <span className="tch-row-name">{u.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
