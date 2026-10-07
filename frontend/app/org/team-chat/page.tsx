"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { Lock } from "lucide-react";
import { Reveal } from "@/components/superadmin/reveal";
import { Field, FormActions, FormPage, TextInput, formPageStyles } from "@/components/forms/form-page";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth-context";
import * as chatApi from "@/lib/team-chat/api";
import { useTeamChat } from "@/lib/team-chat/context";
import { isChatHost } from "@/lib/team-chat/socket";
import type { ChatUserResult } from "@/lib/team-chat/types";
import { UserPicker, errorText } from "./chat-ui";
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
  const [view, setView] = useState<"chat" | "new-channel" | "new-message">("chat");
  const isDesktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );

  const select = useCallback((id: string | null) => {
    setChosen(id);
    writeSelected(id);
  }, []);

  // Desktop with nothing chosen yet: show the most recent conversation.
  const first = chat?.conversations?.[0]?.id ?? null;
  const activeId = chosen === undefined ? (isDesktop ? first : null) : chosen;

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

  if (view === "new-channel") {
    return (
      <NewChannelForm
        onBack={() => setView("chat")}
        onCreated={(id) => {
          setView("chat");
          select(id);
        }}
      />
    );
  }

  if (view === "new-message") {
    return (
      <NewMessageForm
        onBack={() => setView("chat")}
        onPick={async (u) => {
          try {
            let id = u.dmConversationId;
            if (!id) {
              const conv = await chatApi.openDm(u.id);
              chat?.upsertConversation(conv);
              id = conv.id;
            }
            setView("chat");
            select(id);
          } catch (err) {
            toast({ title: "Couldn't open chat", description: errorText(err, "Please try again"), variant: "error" });
          }
        }}
      />
    );
  }

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

          <div className="tch-header-actions">
            <button type="button" className="tch-btn-msg" onClick={() => setView("new-message")}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m2 7 10 6 10-6" />
              </svg>
              <span>New message</span>
            </button>
            {canCreateChannel ? (
              <button type="button" className="tch-btn-channel" onClick={() => setView("new-channel")}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>New channel</span>
              </button>
            ) : null}
          </div>
        </div>
      </Reveal>

      <Reveal delay={2}>
        <div className={`tch-shell${activeId ? " has-active" : ""}`}>
          <ConversationRail
            activeId={activeId}
            onSelect={select}
            canCreateChannel={canCreateChannel}
            onNewChannel={() => setView("new-channel")}
            onNewMessage={() => setView("new-message")}
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

// --- New channel: full-width in-page form (same look as before) -----------
function NewChannelForm({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string) => void }) {
  const chat = useTeamChat();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<ChatUserResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pickedIds = useMemo(() => new Set(picked.map((u) => u.id)), [picked]);

  return (
    <FormPage
      eyebrow="Team · Team Chat"
      title="Create a new channel"
      subtitle="Channels keep conversations about a deal, project or team in one place."
      onBack={onBack}
      backLabel="Back to Team Chat"
    >
      <form
        className={formPageStyles.panel}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
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
        }}
      >
        <Field htmlFor="tc-channel" label="Channel name" icon="team">
          <TextInput
            id="tc-channel"
            icon="team"
            placeholder="e.g. deals-ahmedabad"
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>
        <Field htmlFor="tc-members" label="Members" icon="users" note="(optional — you can add people later)">
          <div id="tc-members" className="tch-member-pick">
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
        </Field>
        {error ? <p className="tch-form-error">{error}</p> : null}
        <FormActions
          onCancel={onBack}
          busy={busy}
          submitDisabled={!name.trim()}
          busyLabel="Creating…"
          submitLabel="Create channel"
          submitIcon="plus"
        />
      </form>
    </FormPage>
  );
}

// --- New direct message: full-width in-page view (same look as before) ----
const NO_ONE = new Set<string>();
function NewMessageForm({ onBack, onPick }: { onBack: () => void; onPick: (u: ChatUserResult) => void }) {
  return (
    <FormPage
      eyebrow="Team · Team Chat"
      title="Start a direct message"
      subtitle="Pick a teammate to message."
      onBack={onBack}
      backLabel="Back to Team Chat"
    >
      <div className={formPageStyles.panel}>
        <UserPicker excludeIds={NO_ONE} onPick={onPick} placeholder="Search teammates by name or email" />
      </div>
    </FormPage>
  );
}
