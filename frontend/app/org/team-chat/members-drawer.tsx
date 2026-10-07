"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquare, UserMinus, UserPlus } from "lucide-react";
import { Icon } from "@/components/icons";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/components/ui/toast";
import * as chatApi from "@/lib/team-chat/api";
import { useTeamChat } from "@/lib/team-chat/context";
import { lastSeenLabel } from "@/lib/team-chat/format";
import type { ChatConversation, ChatMember, ChatUserResult } from "@/lib/team-chat/types";
import { Avatar, ConfirmDialog, UserPicker, errorText } from "./chat-ui";

export function MembersDrawer({
  conversation,
  canManage,
  onClose,
  onOpenConversation,
}: {
  conversation: ChatConversation;
  canManage: boolean;
  onClose: () => void;
  onOpenConversation: (id: string | null) => void;
}) {
  const chat = useTeamChat();
  const { user } = useAuth();
  const { toast } = useToast();
  const [members, setMembers] = useState<ChatMember[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<ChatMember | null>(null);
  const myId = user?.id ?? "";

  const load = useCallback(
    () =>
      chatApi
        .listMembers(conversation.id)
        .then(setMembers)
        .catch((err: unknown) => {
          toast({ title: "Couldn't load members", description: errorText(err, ""), variant: "error" });
        }),
    [conversation.id, toast],
  );

  useEffect(() => {
    let cancelled = false;
    chatApi
      .listMembers(conversation.id)
      .then((m) => !cancelled && setMembers(m))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [conversation.id]);

  useEffect(() => {
    if (!chat) return;
    return chat.on<{ conversationId: string }>("members:updated", (p) => {
      if (p.conversationId === conversation.id) void load();
    });
  }, [chat, conversation.id, load]);

  const memberIds = useMemo(() => new Set((members ?? []).map((m) => m.id)), [members]);

  const add = async (u: ChatUserResult) => {
    setBusy(true);
    try {
      const res = await chatApi.addMembers(conversation.id, [u.id]);
      setMembers(res.members);
      setAdding(false);
    } catch (err) {
      toast({ title: "Couldn't add member", description: errorText(err, ""), variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  const message = async (m: ChatMember) => {
    try {
      const conv = await chatApi.openDm(m.id);
      chat?.upsertConversation(conv);
      onOpenConversation(conv.id);
    } catch (err) {
      toast({ title: "Couldn't open chat", description: errorText(err, ""), variant: "error" });
    }
  };

  const title = conversation.kind === "dm" ? "Contact info" : `Members${members ? ` (${members.length})` : ""}`;

  return (
    <aside className="tch-drawer" aria-label={title}>
      <div className="tch-drawer-head">
        <h3>{title}</h3>
        <button type="button" className="tch-icon-action" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>
      {canManage ? (
        <div className="tch-drawer-add">
          {adding ? (
            <>
              <UserPicker excludeIds={memberIds} onPick={(u) => void add(u)} placeholder="Add people to this channel" />
              <button type="button" className="tch-btn is-link" onClick={() => setAdding(false)} disabled={busy}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="tch-btn" onClick={() => setAdding(true)}>
              <UserPlus size={16} /> Add members
            </button>
          )}
        </div>
      ) : null}
      <ul className="tch-member-list">
        {members === null ? (
          <li className="tch-loading">
            <Loader2 className="tch-spin" />
          </li>
        ) : (
          members.map((m) => {
            const p = chat?.presenceOf(m.id, { online: m.online, lastSeenAt: m.lastSeenAt });
            const online = !!p?.online && m.active;
            return (
              <li key={m.id} className="tch-member">
                <Avatar id={m.id} name={m.name} size={34} online={online} />
                <span className="tch-member-main">
                  <strong>
                    {m.name}
                    {m.id === myId ? <em> (you)</em> : null}
                  </strong>
                  <small>
                    {!m.active ? "Inactive" : online ? "online" : lastSeenLabel(p?.lastSeenAt ?? null) || m.email}
                  </small>
                </span>
                {m.role === "admin" && conversation.kind === "channel" ? <span className="tch-role">Admin</span> : null}
                {m.id !== myId && conversation.kind !== "dm" && m.active ? (
                  <button type="button" className="tch-icon-action" title={`Message ${m.name}`} onClick={() => void message(m)}>
                    <MessageSquare size={15} />
                  </button>
                ) : null}
                {canManage && m.id !== myId ? (
                  <button type="button" className="tch-icon-action" title={`Remove ${m.name}`} onClick={() => setRemoving(m)}>
                    <UserMinus size={15} />
                  </button>
                ) : null}
              </li>
            );
          })
        )}
      </ul>
      {removing ? (
        <ConfirmDialog
          title="Remove member?"
          message={<>Remove {removing.name} from #{conversation.name}?</>}
          confirmLabel="Remove"
          danger
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            const res = await chatApi.removeMember(conversation.id, removing.id);
            setMembers(res.members);
          }}
        />
      ) : null}
    </aside>
  );
}

