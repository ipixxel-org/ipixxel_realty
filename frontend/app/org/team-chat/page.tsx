"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Lock } from "lucide-react";
import { Reveal } from "@/components/superadmin/reveal";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import * as chatApi from "@/lib/team-chat/api";
import { TEAM_CHAT_OPEN_EVENT, useTeamChat } from "@/lib/team-chat/context";
import { isChatHost } from "@/lib/team-chat/socket";
import type { ChatUserResult } from "@/lib/team-chat/types";
import { Modal, UserPicker, errorText } from "./chat-ui";
import { ConversationRail } from "./conversation-rail";
import { ThreadView } from "./thread-view";
import "./team-chat.css";

/** The open conversation lives in ?c=<id> so a reload or a shared link keeps it. */
function readSelected(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("c");
}

function writeSelected(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("c", id);
  else url.searchParams.delete("c");
  window.history.replaceState(window.history.state, "", url);
}

const DESKTOP = "(min-width: 769px)";
function subscribeDesktop(cb: () => void) {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export default function OrgTeamChatPage() {
  const { user, isLoading, hasPermission } = useAuth();
  const chat = useTeamChat();
  const { toast } = useToast();
  // undefined = nothing chosen yet; null = explicitly back at the list.
  const [chosen, setChosen] = useState<string | null | undefined>(() => readSelected() ?? undefined);
  const [popup, setPopup] = useState<"none" | "new-channel" | "new-message">("none");
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );

  const select = useCallback((id: string | null) => {
    setChosen(id);
    writeSelected(id);
  }, []);

  // A mention notification clicked while this page is open.
  useEffect(() => {
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === "string" && id) select(id);
    };
    window.addEventListener(TEAM_CHAT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TEAM_CHAT_OPEN_EVENT, onOpen);
  }, [select]);

  // Desktop with nothing chosen yet: open the most recent conversation, and
  // keep it open. Following the top of the rail would switch away whenever
  // another conversation gets a newer message.
  const first = chat?.conversations?.[0]?.id ?? null;
  if (chosen === undefined && isDesktop && first) setChosen(first);
  const activeId = chosen === undefined ? null : chosen;

  if (isLoading || !user) return null;

  if (!isChatHost()) {
    return (
      <NoAccess
        title="Team Chat isn't available on this domain"
        text="Open Team Chat from the main app address you sign in to."
      />
    );
  }
  if (!hasPermission("team_chat", "view") || chat?.status === "no-access") {
    return (
      <NoAccess
        title="You don't have access to Team Chat — ask your admin"
        text="Team Chat is available to roles that have been given access in Roles & Permissions."
      />
    );
  }

  const canCreateChannel = hasPermission("team_chat", "add");

  return (
    <div className="tch-wrap">
      <Reveal delay={1}>
        <div className="tch-header">
          <div className="tch-header-left">
            <div className="tch-header-icon" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="tch-header-content">
              <div className="tch-eyebrow">TEAM CHAT</div>
              <h1 className="tch-title">Team Chat</h1>
              <p className="tch-sub">Internal chat for your organisation – channels and direct messages.</p>
            </div>
          </div>
        </div>
      </Reveal>

      <Reveal delay={2}>
        <div className={`tch-shell${activeId ? " has-active" : ""}`}>
          <ConversationRail
            activeId={activeId}
            onSelect={select}
            canCreateChannel={canCreateChannel}
            onNewChannel={() => setPopup("new-channel")}
            onNewMessage={() => setPopup("new-message")}
          />
          {activeId ? (
            <ThreadView
              key={activeId}
              conversationId={activeId}
              onBack={() => select(null)}
              onOpenConversation={select}
            />
          ) : (
            <section className="tch-center tch-center-empty">
              <div className="tch-thread-empty">
                <h3>Team Chat</h3>
                <p>Pick a channel or a person on the left to start chatting.</p>
              </div>
            </section>
          )}
        </div>
      </Reveal>

      {popup === "new-channel" ? (
        <NewChannelPopup
          onClose={() => setPopup("none")}
          onCreated={(id) => {
            setPopup("none");
            select(id);
          }}
        />
      ) : null}
      {popup === "new-message" ? (
        <NewMessagePopup
          onClose={() => setPopup("none")}
          onPick={async (u) => {
            try {
              let id = u.dmConversationId;
              if (!id) {
                const conv = await chatApi.openDm(u.id);
                chat?.upsertConversation(conv);
                id = conv.id;
              }
              setPopup("none");
              select(id);
            } catch (err) {
              toast({ title: "Couldn't open chat", description: errorText(err, "Please try again"), variant: "error" });
            }
          }}
        />
      ) : null}
    </div>
  );
}

function NoAccess({ title, text }: { title: string; text: string }) {
  return (
    <div className="tch-noaccess">
      <span className="tch-noaccess-icon">
        <Lock size={24} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}

// --- New channel popup ------------------------------------------------------
function NewChannelPopup({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const chat = useTeamChat();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<ChatUserResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickedIds = useMemo(() => new Set(picked.map((u) => u.id)), [picked]);

  const create = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const conv = await chatApi.createChannel({ name: name.trim(), memberIds: picked.map((u) => u.id) });
      chat?.upsertConversation(conv);
      onCreated(conv.id);
    } catch (err) {
      setError(errorText(err, "Couldn't create the channel"));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New channel"
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="tch-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="tch-btn is-primary" onClick={() => void create()} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create channel"}
          </button>
        </>
      }
    >
      <label className="tch-field">
        <span>Channel name</span>
        <input
          autoFocus
          value={name}
          maxLength={80}
          placeholder="e.g. deals-ahmedabad"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void create();
          }}
        />
      </label>
      <div className="tch-field">
        <span>
          Members <em className="tch-optional">(optional — you can add people later)</em>
        </span>
        {picked.length ? (
          <div className="tch-chips">
            {picked.map((u) => (
              <span key={u.id} className="tch-pick-chip">
                {u.name}
                <button type="button" onClick={() => setPicked((p) => p.filter((x) => x.id !== u.id))} aria-label={`Remove ${u.name}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <UserPicker excludeIds={pickedIds} onPick={(u) => setPicked((p) => [...p, u])} />
      </div>
      {error ? <p className="tch-form-error">{error}</p> : null}
    </Modal>
  );
}

// --- New message popup ------------------------------------------------------
const NO_ONE = new Set<string>();
function NewMessagePopup({ onClose, onPick }: { onClose: () => void; onPick: (u: ChatUserResult) => void }) {
  return (
    <Modal title="New message" onClose={onClose}>
      <UserPicker excludeIds={NO_ONE} onPick={onPick} placeholder="Search teammates by name or email" autoFocus />
    </Modal>
  );
}
