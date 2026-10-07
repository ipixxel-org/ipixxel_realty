"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Reveal } from "@/components/superadmin/reveal";
import { Icon } from "@/components/icons";
import { Field, FormActions, FormPage, TextInput, formPageStyles } from "@/components/forms/form-page";
import { useAuth } from "@/lib/auth-context";
import { displayName, initialsFor, useOrgUsersList } from "@/components/org/team-fields";
import {
  getTeamChatOverview,
  getTeamChannel,
  createTeamChannel,
  createTeamDm,
  sendTeamMessage,
} from "@/lib/api";
import "./team-chat.css";

interface ChatMessage {
  id: string;
  sender: {
    id: string;
    name: string;
    avatarColor: string;
  };
  time: string;
  body: string;
  reactions?: { emoji: string; count: number }[];
  attachment?: {
    type: "file" | "lead";
    title: string;
    subtitle?: string;
    size?: string;
  };
}

interface ChannelItem {
  id: string;
  name: string;
  unreadCount?: number;
  membersCount: number;
  description: string;
}

interface DmItem {
  id: string;
  name: string;
  avatarColor: string;
  online?: boolean;
}

const DEFAULT_CHANNELS: ChannelItem[] = [
  { id: "general", name: "General", unreadCount: 12, membersCount: 12, description: "Discuss anything with your team" },
  { id: "sales-team", name: "Sales Team", unreadCount: 5, membersCount: 8, description: "Sales pipelines & daily targets" },
  { id: "marketing", name: "Marketing", unreadCount: 3, membersCount: 6, description: "Campaigns & collateral" },
  { id: "projects", name: "Projects", unreadCount: 4, membersCount: 10, description: "Project launches & inventory updates" },
  { id: "support", name: "Support", unreadCount: 1, membersCount: 4, description: "Customer & platform help" },
  { id: "announcements", name: "Announcements", membersCount: 12, description: "Company wide news and milestones" },
];

const DEFAULT_DMS: DmItem[] = [
  { id: "user-1", name: "Shubham Kumar", avatarColor: "#f97316", online: true },
  { id: "user-2", name: "Aakash Verma", avatarColor: "#3b82f6", online: true },
  { id: "user-3", name: "Priya Patel", avatarColor: "#ec4899", online: false },
  { id: "user-4", name: "Rohit Jain", avatarColor: "#10b981", online: true },
  { id: "user-5", name: "Neha Sharma", avatarColor: "#8b5cf6", online: false },
];

const INITIAL_MESSAGES: Record<string, ChatMessage[]> = {
  general: [
    {
      id: "msg-1",
      sender: { id: "user-1", name: "Shubham Kumar", avatarColor: "#f97316" },
      time: "10:30 AM",
      body: "Hi team, please share the latest leads update for Ahmedabad project.",
      reactions: [{ emoji: "👍", count: 2 }],
    },
    {
      id: "msg-2",
      sender: { id: "user-2", name: "Aakash Verma", avatarColor: "#3b82f6" },
      time: "10:32 AM",
      body: "Sure, sharing the report by EOD.",
      attachment: {
        type: "file",
        title: "Leads_Update_Ahmedabad.xlsx",
        size: "245 KB",
      },
    },
    {
      id: "msg-3",
      sender: { id: "user-3", name: "Priya Patel", avatarColor: "#ec4899" },
      time: "11:15 AM",
      body: "@Shubham Kumar I have assigned 5 new leads to the sales team. Please check.",
      attachment: {
        type: "lead",
        title: "5 leads assigned",
        subtitle: "Ahmedabad West Project",
      },
    },
    {
      id: "msg-4",
      sender: { id: "user-1", name: "Shubham Kumar", avatarColor: "#f97316" },
      time: "11:20 AM",
      body: "Thanks! 👍",
    },
    {
      id: "msg-5",
      sender: { id: "user-4", name: "Rohit Jain", avatarColor: "#8b5cf6" },
      time: "11:45 AM",
      body: "We have a client call at 4 PM. @Aakash Verma please join.",
    },
  ],
};

export default function OrgTeamChatPage() {
  const { user: currentUser } = useAuth();
  const { users } = useOrgUsersList();

  // Active channel/DM state
  const [activeChannelId, setActiveChannelId] = useState<string>("general");
  const [activeDmId, setActiveDmId] = useState<string | null>(null);

  // Search filter for channels
  const [channelSearch, setChannelSearch] = useState("");

  // New channel / new message views (full-width, shown in place of the chat)
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [showDmModal, setShowDmModal] = useState(false);

  // Messages dictionary
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>(INITIAL_MESSAGES);
  const [draft, setDraft] = useState("");

  const msgsEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    msgsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, activeChannelId, activeDmId]);

  // Current active thread info
  const activeChannel = DEFAULT_CHANNELS.find((c) => c.id === activeChannelId);
  const activeDm = DEFAULT_DMS.find((d) => d.id === activeDmId);

  const currentThreadName = activeDm ? activeDm.name : activeChannel?.name || "General";
  const currentThreadSub = activeDm
    ? "Direct message conversation"
    : `${activeChannel?.membersCount || 12} members · ${activeChannel?.description || "Discuss anything with your team"}`;

  const currentThreadKey = activeDm ? `dm-${activeDm.id}` : activeChannelId;
  const currentMessages = messages[currentThreadKey] || [];

  // Filtered channels
  const filteredChannels = useMemo(() => {
    return DEFAULT_CHANNELS.filter((c) =>
      c.name.toLowerCase().includes(channelSearch.toLowerCase())
    );
  }, [channelSearch]);

  const handleSendMessage = () => {
    const text = draft.trim();
    if (!text) return;

    const senderName =
      (currentUser && [currentUser.first_name, currentUser.last_name].filter(Boolean).join(" ")) ||
      currentUser?.email ||
      "Shubham Kumar";
    const newMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      sender: {
        id: currentUser?.id || "user-1",
        name: senderName,
        avatarColor: "#f97316",
      },
      time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
      body: text,
    };

    setMessages((prev) => ({
      ...prev,
      [currentThreadKey]: [...(prev[currentThreadKey] || []), newMsg],
    }));

    setDraft("");
  };

  const handleSelectChannel = (id: string) => {
    setActiveChannelId(id);
    setActiveDmId(null);
  };

  const handleSelectDm = (id: string) => {
    setActiveDmId(id);
    setActiveChannelId("");
  };

  // Helper to render text with @mentions
  const renderMessageText = (body: string) => {
    const parts = body.split(/(@[A-Za-z0-9_.\s]+?)(?=\s|$)/g);
    return parts.map((part, index) => {
      if (part.startsWith("@")) {
        return (
          <span key={index} className="mention">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // --- New channel — full-width in-page view (was a modal). Same field and
  // the same submit behaviour: channels aren't persisted yet, so submitting
  // closes the form and clears the name, exactly as the modal did.
  if (showChannelModal) {
    return (
      <FormPage
        eyebrow="Team · Team Chat"
        title="Create a new channel"
        subtitle="Channels keep conversations about a deal, project or team in one place."
        onBack={() => setShowChannelModal(false)}
        backLabel="Back to Team Chat"
      >
        <form
          className={formPageStyles.panel}
          onSubmit={(e) => {
            e.preventDefault();
            if (!newChannelName.trim()) return;
            setShowChannelModal(false);
            setNewChannelName("");
          }}
        >
          <Field htmlFor="tc-channel" label="Channel name" icon="team">
            <TextInput
              id="tc-channel"
              icon="team"
              placeholder="e.g. deals-ahmedabad"
              value={newChannelName}
              onChange={(e) => setNewChannelName(e.target.value)}
              autoFocus
            />
          </Field>
          <FormActions
            onCancel={() => setShowChannelModal(false)}
            busy={false}
            submitDisabled={!newChannelName.trim()}
            busyLabel="Creating…"
            submitLabel="Create channel"
            submitIcon="plus"
          />
        </form>
      </FormPage>
    );
  }

  // --- New direct message — full-width in-page view (was a modal). Same list
  // (first 10 members); picking one closes the view, exactly as before.
  if (showDmModal) {
    return (
      <FormPage
        eyebrow="Team · Team Chat"
        title="Start a direct message"
        subtitle="Pick a teammate to message."
        onBack={() => setShowDmModal(false)}
        backLabel="Back to Team Chat"
      >
        <div className={formPageStyles.panel}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
            {users.slice(0, 10).map((u) => (
              <button
                key={u.id}
                type="button"
                className="tch-dm-btn"
                style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 12 }}
                onClick={() => {
                  setShowDmModal(false);
                }}
              >
                <div className="tch-avatar-circle" style={{ background: "#2563eb" }}>
                  {initialsFor(displayName(u))}
                </div>
                <b>{displayName(u)}</b>
              </button>
            ))}
          </div>
        </div>
      </FormPage>
    );
  }

  return (
    <div className="tch-wrap">
      {/* Header matching screenshot */}
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
              <p className="tch-sub">
                Internal chat for your organisation – channels and direct messages.
              </p>
            </div>
          </div>

          <div className="tch-header-actions">
            <button
              type="button"
              className="tch-btn-msg"
              onClick={() => setShowDmModal(true)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m2 7 10 6 10-6" />
              </svg>
              <span>New message</span>
            </button>
            <button
              type="button"
              className="tch-btn-channel"
              onClick={() => setShowChannelModal(true)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>New channel</span>
            </button>
          </div>
        </div>
      </Reveal>

      {/* 3-Column Shell */}
      <Reveal delay={2}>
        <div className="tch-shell">
          {/* Left Column (Channels & DMs) */}
          <aside className="tch-left">
            {/* Search and add button */}
            <div className="tch-search-row">
              <div className="tch-search-input-box">
                <Icon name="search" size={15} />
                <input
                  type="text"
                  placeholder="Search channels..."
                  value={channelSearch}
                  onChange={(e) => setChannelSearch(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="tch-btn-add-square"
                title="Create Channel"
                onClick={() => setShowChannelModal(true)}
              >
                <Icon name="plus" size={16} />
              </button>
            </div>

            {/* Channels List */}
            <div className="tch-section">
              <div className="tch-sec-title-row">
                <span>CHANNELS</span>
                <button
                  type="button"
                  className="tch-sec-plus"
                  title="Add Channel"
                  onClick={() => setShowChannelModal(true)}
                >
                  +
                </button>
              </div>

              {filteredChannels.map((c) => {
                const isActive = activeChannelId === c.id && !activeDmId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`tch-channel-btn ${isActive ? "active" : ""}`}
                    onClick={() => handleSelectChannel(c.id)}
                  >
                    <div className="tch-channel-left">
                      <span className="tch-hash">#</span>
                      <span>{c.name}</span>
                    </div>
                    {c.unreadCount ? (
                      <span className="tch-badge-count">{c.unreadCount}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Direct Messages List */}
            <div className="tch-section">
              <div className="tch-sec-title-row">
                <span>DIRECT MESSAGES</span>
                <button
                  type="button"
                  className="tch-sec-plus"
                  title="Start DM"
                  onClick={() => setShowDmModal(true)}
                >
                  +
                </button>
              </div>

              {DEFAULT_DMS.map((d) => {
                const isActive = activeDmId === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    className={`tch-dm-btn ${isActive ? "active" : ""}`}
                    onClick={() => handleSelectDm(d.id)}
                  >
                    <div
                      className="tch-avatar-circle"
                      style={{ background: d.avatarColor }}
                    >
                      {initialsFor(d.name)}
                    </div>
                    <span>{d.name}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Center Column (Chat Main Feed) */}
          <section className="tch-center">
            {/* Header */}
            <header className="tch-center-head">
              <div className="tch-center-title-area">
                <div className="tch-center-channel-name">
                  {!activeDm && <span className="tch-hash">#</span>}
                  <span>{currentThreadName}</span>
                </div>
                <div className="tch-center-sub">{currentThreadSub}</div>
              </div>

              <div className="tch-center-actions">
                <button type="button" className="tch-icon-action" title="Search in channel">
                  <Icon name="search" size={17} />
                </button>
                <button type="button" className="tch-icon-action" title="Members">
                  <Icon name="users" size={17} />
                </button>
                <button type="button" className="tch-icon-action" title="More options">
                  <Icon name="dots" size={17} />
                </button>
              </div>
            </header>

            {/* Message Area */}
            <div className="tch-msgs-area">
              <div className="tch-date-divider">Today</div>

              {currentMessages.map((msg) => (
                <div key={msg.id} className="tch-msg-row">
                  <div
                    className="tch-msg-avatar"
                    style={{ background: msg.sender.avatarColor }}
                  >
                    {initialsFor(msg.sender.name)}
                  </div>
                  <div className="tch-msg-content">
                    <div className="tch-msg-meta">
                      <span className="tch-msg-sender">{msg.sender.name}</span>
                      <span className="tch-msg-time">{msg.time}</span>
                    </div>
                    <div className="tch-msg-text">
                      {renderMessageText(msg.body)}
                    </div>

                    {/* Reactions */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="tch-reaction-pill">
                        {msg.reactions.map((r, i) => (
                          <span key={i}>
                            {r.emoji} {r.count}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Attachment: File */}
                    {msg.attachment?.type === "file" && (
                      <div className="tch-file-card">
                        <div className="tch-file-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="8" y1="13" x2="16" y2="13" />
                            <line x1="8" y1="17" x2="16" y2="17" />
                          </svg>
                        </div>
                        <div className="tch-file-details">
                          <span className="tch-file-name">{msg.attachment.title}</span>
                          <span className="tch-file-size">{msg.attachment.size}</span>
                        </div>
                        <span className="tch-file-dl">
                          <Icon name="download" size={16} />
                        </span>
                      </div>
                    )}

                    {/* Attachment: Lead */}
                    {msg.attachment?.type === "lead" && (
                      <div className="tch-lead-card">
                        <div className="tch-lead-card-left">
                          <div className="tch-lead-icon">
                            <Icon name="profile" size={16} />
                          </div>
                          <div className="tch-lead-info">
                            <span className="tch-lead-title">{msg.attachment.title}</span>
                            <span className="tch-lead-sub">{msg.attachment.subtitle}</span>
                          </div>
                        </div>
                        <Icon name="chevron-right" size={16} />
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={msgsEndRef} />
            </div>

            {/* Input Composer */}
            <div className="tch-composer">
              <button type="button" className="tch-composer-attach" title="Attach file">
                <Icon name="link" size={18} />
              </button>
              <input
                type="text"
                className="tch-composer-input"
                placeholder="Type a message..."
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <button type="button" className="tch-composer-emoji" title="Insert Emoji">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                  <line x1="9" y1="9" x2="9.01" y2="9" />
                  <line x1="15" y1="9" x2="15.01" y2="9" />
                </svg>
              </button>
              <button
                type="button"
                className="tch-composer-send"
                title="Send message"
                onClick={handleSendMessage}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </section>
        </div>
      </Reveal>

    </div>
  );
}