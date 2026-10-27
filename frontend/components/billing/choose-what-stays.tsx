"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/billing/pricing";
import type { RetentionChoices, RetentionItem } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery, useOptionalOrgBilling } from "./context";
import { Banner, BLink, countLabel, ErrorNote, Loading, Section } from "./ui";

type Kind = "users" | "projects" | "landingPages" | "templates";

function TickList({
  title,
  noun,
  items,
  selected,
  limit,
  onToggle,
}: {
  title: string;
  noun: string;
  items: RetentionItem[];
  selected: string[];
  /** null = unlimited (nothing to choose). */
  limit: number | null;
  onToggle: (id: string) => void;
}) {
  const max = limit ?? Infinity;
  const full = selected.length >= max;
  return (
    <Section
      title={title}
      sub={limit === null ? `All ${noun} stay active` : `${limit} ${noun} can stay active`}
      action={<span className={`bl-counter${selected.length > max ? " over" : ""}`}>{limit === null ? `${selected.length} selected` : `${selected.length} of ${limit} selected`}</span>}
      flush
    >
      {items.map((it) => {
        const on = selected.includes(it.id);
        const blocked = !on && full;
        return (
          <label
            key={it.id}
            className={`bl-tick-row${it.locked ? " locked" : ""}`}
            title={it.locked ? "The owner always stays active and can't be unticked." : blocked ? `Untick another one first — only ${limit} can stay.` : undefined}
            style={blocked ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
          >
            <input type="checkbox" checked={on} disabled={it.locked || blocked} onChange={() => onToggle(it.id)} aria-label={it.name} />
            <span className="bl-tick-main">
              <b>
                {it.name} {it.locked ? <Icon name="lock" size={12} style={{ verticalAlign: "-1px", color: "var(--muted)" }} /> : null}
              </b>
              <span className="bl-muted">{it.detail}</span>
            </span>
            <span className="bl-why" title="Why it's picked by default">
              {it.defaultPicked ? "Picked for you · " : ""}
              {it.reason}
            </span>
          </label>
        );
      })}
    </Section>
  );
}

function Editor({ choices, onSaved }: { choices: RetentionChoices; onSaved: (c: RetentionChoices) => void }) {
  const { client, canEdit } = useBillingEnv();
  const billing = useOptionalOrgBilling();
  const { toast } = useToast();
  const pick = (list: RetentionItem[]) => list.filter((x) => x.selected).map((x) => x.id);
  // Templates are missing from older responses (and the walkthrough mock): then there's no Templates section.
  const templates = choices.templates;
  const [sel, setSel] = useState<Record<Kind, string[]>>({
    users: pick(choices.users),
    projects: pick(choices.projects),
    landingPages: pick(choices.landingPages),
    templates: pick(templates ?? []),
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = choices.targetPlan;

  function toggle(kind: Kind, id: string) {
    setDirty(true);
    setSel((s) => ({ ...s, [kind]: s[kind].includes(id) ? s[kind].filter((x) => x !== id) : [...s[kind], id] }));
  }

  function resetDefaults() {
    const d = (list: RetentionItem[]) => list.filter((x) => x.defaultPicked).map((x) => x.id);
    setSel({ users: d(choices.users), projects: d(choices.projects), landingPages: d(choices.landingPages), templates: d(templates ?? []) });
    setDirty(true);
  }

  async function save() {
    setBusy(true);
    try {
      const saved = await client.saveRetentionChoices({
        targetPlanId: t.id,
        userIds: sel.users,
        projectIds: sel.projects,
        landingPageIds: sel.landingPages,
        ...(templates ? { templateIds: sel.templates } : {}),
      });
      setDirty(false);
      onSaved(saved);
      void billing?.refresh();
      const kept = templates
        ? `${sel.users.length} users, ${sel.projects.length} projects, ${sel.landingPages.length} landing pages and ${sel.templates.length} templates`
        : `${sel.users.length} users, ${sel.projects.length} projects and ${sel.landingPages.length} landing pages`;
      toast({ variant: "success", title: "Saved", description: `${kept} stay active on ${t.name}.` });
    } catch (e) {
      toast({ variant: "error", title: "Couldn't save", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bl-stack">
      <Banner tone="info" icon="info" title={`On ${t.name}: ${countLabel(t.limits.users, "user", "users")}, ${countLabel(t.limits.projects, "project", "projects")}, ${countLabel(t.limits.landingPages, "landing page", "landing pages")}${templates ? `, ${countLabel(t.limits.templates, "template", "templates")}` : ""}`}>
        {choices.appliesOn ? `This applies if you move to ${t.name} on ${formatDate(choices.appliesOn)}. ` : `You're on ${t.name} now — changes apply straight away. `}
        Anything you untick is paused, never deleted: paused people can&apos;t sign in, projects become view-only and landing pages go offline. A paused template can&apos;t be
        used for new landing pages; pages already made from it stay live and editable. Leads keep coming in.
        <div style={{ marginTop: 6 }}>
          If you don&apos;t choose, we keep the owner first, then admins, then whoever signed in most recently; the most recently updated projects; and the landing pages with the
          most leads in the last 30 days; and the templates used for the most landing pages (then the most recently used, then the most recently added).
        </div>
      </Banner>
      <TickList title="Users" noun="users" items={choices.users} selected={sel.users} limit={t.limits.users} onToggle={(id) => toggle("users", id)} />
      <TickList
        title="Projects"
        noun={t.limits.projects === 1 ? "project" : "projects"}
        items={choices.projects}
        selected={sel.projects}
        limit={t.limits.projects}
        onToggle={(id) => toggle("projects", id)}
      />
      <TickList
        title="Landing pages"
        noun={t.limits.landingPages === 1 ? "landing page" : "landing pages"}
        items={choices.landingPages}
        selected={sel.landingPages}
        limit={t.limits.landingPages}
        onToggle={(id) => toggle("landingPages", id)}
      />
      {templates ? (
        <TickList
          title="Templates"
          noun={t.limits.templates === 1 ? "template" : "templates"}
          items={templates}
          selected={sel.templates}
          limit={t.limits.templates}
          onToggle={(id) => toggle("templates", id)}
        />
      ) : null}
      <div className="bl-row">
        <button type="button" className="btn btn-primary" disabled={!canEdit || busy} onClick={() => void save()}>
          <Icon name="check" size={15} /> {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={resetDefaults}>
          Reset to the picks we suggest
        </button>
        <BLink to="overview" className="btn btn-ghost">
          Back to billing
        </BLink>
        <span className="bl-muted">{dirty ? "Unsaved changes" : choices.isDefault ? "Showing the picks we suggest" : "Showing your saved choice"}</span>
      </div>
    </div>
  );
}

export function ChooseWhatStaysScreen({ targetPlanId }: { targetPlanId?: string }) {
  const [version, setVersion] = useState(0);
  const { data, error } = useBillingQuery((c) => c.getRetentionChoices({ targetPlanId }), [targetPlanId, version]);
  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading what="your users, projects, pages and templates" />;
  return <Editor key={`${data.targetPlan.id}-${version}`} choices={data} onSaved={() => setVersion((v) => v + 1)} />;
}
