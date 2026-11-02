"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/billing/pricing";
import type { RetentionChoices, RetentionItem, WhatStaysChoice } from "@/lib/billing/types";
import { useBillingEnv, useBillingQuery, useOptionalOrgBilling, type BillingRoute, type RouteParams } from "./context";
import { Banner, BLink, countLabel, ErrorNote, Loading, Section, WhatStaysLockedNote } from "./ui";

/** Super Admin editing one organisation's choice (any time; applied at once when it's on that plan). */
export interface WhatStaysAdmin {
  orgId: string;
  orgName?: string;
}

type Kind = "users" | "projects" | "landingPages" | "templates";

/**
 * Everything in this list fits the plan (unlimited, or no more than the
 * limit): all of it stays and there's nothing to untick — the plan only
 * pauses what's over its limits.
 */
const allFit = (items: RetentionItem[], limit: number | null) => limit === null || items.length <= limit;

/** Where the page was opened from (`back=`): Save and Cancel return there. */
export interface WhatStaysBack {
  to: BillingRoute;
  params?: RouteParams;
  label: string;
}

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
  const fits = allFit(items, limit);
  return (
    <Section
      title={title}
      sub={fits ? `All ${noun} stay active` : `${limit} ${noun} can stay active`}
      action={<span className={`bl-counter${selected.length > max ? " over" : ""}`}>{limit === null ? `${selected.length} selected` : `${selected.length} of ${limit} selected`}</span>}
      flush
    >
      {items.map((it) => {
        const on = fits || selected.includes(it.id);
        const blocked = fits || (!on && full);
        return (
          <label
            key={it.id}
            className={`bl-tick-row${it.locked ? " locked" : ""}`}
            title={
              it.locked
                ? "The owner always stays active and can't be unticked."
                : fits
                  ? `All of these fit the plan, so they all stay active.`
                  : blocked
                    ? `Untick another one first — only ${limit} can stay.`
                    : undefined
            }
            style={blocked && !fits ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
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

function Editor({
  choices,
  onSaved,
  requestId,
  admin,
  back,
}: {
  choices: RetentionChoices;
  onSaved: (c: RetentionChoices) => void;
  requestId?: string;
  admin?: WhatStaysAdmin;
  back?: WhatStaysBack;
}) {
  const { client, canEdit } = useBillingEnv();
  const billing = useOptionalOrgBilling();
  const { toast } = useToast();
  const t = choices.targetPlan;
  // A list that fits the plan keeps everything (see allFit), so all of it is sent.
  const pick = (list: RetentionItem[], kind: Kind) =>
    allFit(list, t.limits[kind] ?? null) ? list.map((x) => x.id) : list.filter((x) => x.selected).map((x) => x.id);
  // Templates are missing from older responses (and the walkthrough mock): then there's no Templates section.
  const templates = choices.templates;
  const [sel, setSel] = useState<Record<Kind, string[]>>({
    users: pick(choices.users, "users"),
    projects: pick(choices.projects, "projects"),
    landingPages: pick(choices.landingPages, "landingPages"),
    templates: pick(templates ?? [], "templates"),
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  // A refused save, shown here (a toast can sit behind the dialog).
  const [saveError, setSaveError] = useState<string | null>(null);

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
    setSaveError(null);
    try {
      const req = {
        targetPlanId: t.id,
        userIds: sel.users,
        projectIds: sel.projects,
        landingPageIds: sel.landingPages,
        ...(templates ? { templateIds: sel.templates } : {}),
        ...(requestId ? { requestId } : {}),
      };
      const saved = admin ? await client.saveAdminRetentionChoices({ orgId: admin.orgId, ...req }) : await client.saveRetentionChoices(req);
      setDirty(false);
      // Fresh overview before going back, so the page we return to never shows old values.
      await billing?.refresh();
      onSaved(saved);
      const kept = templates
        ? `${sel.users.length} users, ${sel.projects.length} projects, ${sel.landingPages.length} landing pages and ${sel.templates.length} templates`
        : `${sel.users.length} users, ${sel.projects.length} projects and ${sel.landingPages.length} landing pages`;
      toast({ variant: "success", title: "Saved", description: `${kept} stay active on ${t.name}.` });
    } catch (e) {
      setSaveError(e instanceof Error && e.message ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bl-stack">
      <Banner tone="info" icon="info" title={`On ${t.name}: ${countLabel(t.limits.users, "user", "users")}, ${countLabel(t.limits.projects, "project", "projects")}, ${countLabel(t.limits.landingPages, "landing page", "landing pages")}${templates ? `, ${countLabel(t.limits.templates, "template", "templates")}` : ""}`}>
        {admin
          ? choices.appliesOn
            ? `This applies when ${admin.orgName ?? "the organisation"} moves to ${t.name} on ${formatDate(choices.appliesOn)}. `
            : `${admin.orgName ?? "The organisation"} is on ${t.name} now — saving applies straight away and they're notified. `
          : choices.appliesOn
            ? billing?.overview?.plan.id === t.id
              ? // A newer version of their own plan with lower limits.
                `This applies when ${t.name} changes on ${formatDate(choices.appliesOn)}. `
              : `This applies if you move to ${t.name} on ${formatDate(choices.appliesOn)}. `
            : `You're on ${t.name} now — changes apply straight away. `}
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
      {saveError ? (
        <div data-testid="what-stays-save-error">
          <ErrorNote message={saveError} />
        </div>
      ) : null}
      <div className="bl-row">
        <button type="button" className="btn btn-primary" disabled={!canEdit || busy} onClick={() => void save()}>
          <Icon name="check" size={15} /> {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={resetDefaults}>
          Reset to the picks we suggest
        </button>
        {admin ? null : (
          <BLink to={back?.to ?? "overview"} params={back?.params} className="btn btn-ghost">
            {back ? back.label : "Back to billing"}
          </BLink>
        )}
        <span className="bl-muted">{dirty ? "Unsaved changes" : choices.isDefault ? "Showing the picks we suggest" : admin ? "Showing their saved choice" : "Showing your saved choice"}</span>
      </div>
    </div>
  );
}

/** What stays, read-only: once the change was decided or took effect only our team can change it. */
export function WhatStaysReadOnly({ choices, admin = false }: { choices: RetentionChoices; admin?: boolean }) {
  const t = choices.targetPlan;
  const groups = [
    ["Users", choices.users],
    ["Projects", choices.projects],
    ["Landing pages", choices.landingPages],
    ["Templates", choices.templates],
  ] as const;
  return (
    <div className="bl-stack" data-testid="what-stays-read-only">
      {choices.view === "history" ? (
        // An older row: its copy from that time, never edited.
        <Banner tone="gray" icon="clock" title={`What stayed on ${t.name}`}>
          <span data-testid="what-stays-history">
            What stayed when this change applied{choices.viewDate ? ` on ${formatDate(choices.viewDate)}` : ""}. This is history; your current setup may be
            different. See the latest request for what&apos;s active now.
          </span>
        </Banner>
      ) : choices.view === "not_applied" ? (
        <Banner tone="gray" icon="info" title={`Change to ${t.name}`}>
          <span data-testid="what-stays-not-applied">What was requested (not applied).</span>
        </Banner>
      ) : (
        <Banner tone="gray" icon="lock" title={`Active now on ${t.name}`}>
          {admin ? (
            "View only: only the latest request's choice can be changed."
          ) : (
            <>
              {choices.isDefault ? "Our default picks. " : "Your choice. "}
              <WhatStaysLockedNote />
            </>
          )}
        </Banner>
      )}
      {groups.map(([title, items]) => {
        if (!items?.length) return null;
        const kept = items.filter((i) => i.selected);
        const paused = items.filter((i) => !i.selected);
        return (
          <Section key={title} title={title} sub={`${kept.length} of ${items.length} stay active`}>
            <div className="bl-small">
              <div>
                <b>Stays active:</b> {kept.map((i) => i.name).join(", ") || "—"}
              </div>
              <div className="bl-muted">
                <b>Paused:</b> {paused.map((i) => i.name).join(", ") || "—"}
              </div>
            </div>
          </Section>
        );
      })}
      {admin ? null : (
        <div className="bl-row">
          <BLink to="overview" className="btn btn-ghost">
            Back to billing
          </BLink>
        </div>
      )}
    </div>
  );
}

export function ChooseWhatStaysScreen({
  targetPlanId,
  requestId,
  admin,
  back,
  onSaved,
}: {
  targetPlanId?: string;
  /** The request / scheduled change it belongs to (Requests tab, Super Admin rows). */
  requestId?: string;
  admin?: WhatStaysAdmin;
  /** Cancel goes here (the page that opened it). */
  back?: WhatStaysBack;
  onSaved?: (c: RetentionChoices) => void;
}) {
  const { data, error, reload } = useBillingQuery(
    (c) => (admin ? c.getAdminRetentionChoices({ orgId: admin.orgId, targetPlanId, requestId }) : c.getRetentionChoices({ targetPlanId, requestId })),
    [targetPlanId, requestId, admin?.orgId],
  );
  // After a save, show what the save returned, then refetch and show what the
  // server has. (Remounting on the old, pre-save data used to start the editor
  // from the default picks.)
  const [fresh, setFresh] = useState<{ choices: RetentionChoices; before: RetentionChoices | null } | null>(null);
  const [saves, setSaves] = useState(0);
  // The save's answer until the refetch lands (data changes), then the refetch.
  const showFresh = !!fresh && data === fresh.before;
  const shown = showFresh ? fresh.choices : data;
  if (error && !shown) return <ErrorNote message={error} />;
  if (!shown) return <Loading what={admin ? "their users, projects, pages and templates" : "your users, projects, pages and templates"} />;
  if (shown.locked) return <WhatStaysReadOnly choices={shown} admin={!!admin} />;
  return (
    <Editor
      key={`${shown.targetPlan.id}-${saves}-${showFresh ? "saved" : "fetched"}`}
      choices={shown}
      requestId={requestId}
      admin={admin}
      back={back}
      onSaved={(c) => {
        setFresh({ choices: c, before: data });
        setSaves((n) => n + 1);
        reload();
        onSaved?.(c);
      }}
    />
  );
}

/** The picked option and whether the main button may go ahead. */
export interface WhatStaysPick {
  choice: WhatStaysChoice | null;
  /** "Keep the default picks", or "I'll choose" with a saved choice that fits. */
  ready: boolean;
}

/**
 * Over the target plan's limits: two radio options, picked every time (none
 * is selected when the page opens). "Keep the default picks" lists what we'd
 * keep; "I'll choose what stays" opens the Choose what stays screen and,
 * once saved, lists their picks with Edit. `chooseParams` is where that
 * screen's Back returns to (the request or plan change, with this option
 * selected again).
 */
export function WhatStaysOptions({
  targetPlanId,
  initialChoice = null,
  chooseParams,
  onChange,
}: {
  targetPlanId: string;
  /** Only when coming back from Choose what stays (`pick=saved`); otherwise nothing is selected. */
  initialChoice?: WhatStaysChoice | null;
  chooseParams: Record<string, string | undefined>;
  onChange: (pick: WhatStaysPick) => void;
}) {
  const { data, error } = useBillingQuery((c) => c.getRetentionChoices({ targetPlanId }), [targetPlanId]);
  const [choice, setChoice] = useState<WhatStaysChoice | null>(initialChoice);
  const saved = !!data && !data.isDefault;
  // A saved choice counts only while it fits the plan's limits today (they can be
  // lowered after it was saved). Older responses without savedFits: trust it.
  const savedFits = saved && data.savedFits !== false;
  // Nothing goes ahead until the lists are loaded and an option is picked.
  const ready = !!data && (choice === "default" || (choice === "saved" && savedFits));
  useEffect(() => {
    onChange({ choice, ready });
    // onChange is the parent's state setter wrapper; re-run only when the pick changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice, ready]);

  if (error) return <ErrorNote message={error} />;
  if (!data) return <Loading what="what stays" />;
  const groups = [
    ["Users", data.users],
    ["Projects", data.projects],
    ["Landing pages", data.landingPages],
    ["Templates", data.templates],
  ] as const;
  const list = (pick: (i: RetentionItem) => boolean) => (
    <div className="bl-picks bl-small" style={{ marginTop: 4 }}>
      {groups.map(([title, items]) =>
        items?.length ? (
          <div key={title}>
            <b>{title}:</b> {items.filter(pick).map((i) => i.name).join(", ") || "none"}
          </div>
        ) : null,
      )}
    </div>
  );
  const name = `what-stays-${targetPlanId}`;
  const choose = { target: targetPlanId, ...chooseParams };
  return (
    <div className="bl-stack" style={{ gap: 10 }} data-testid="what-stays-options" role="radiogroup" aria-label="What stays">
      <div>
        <label className="bl-row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="radio" name={name} checked={choice === "default"} onChange={() => setChoice("default")} />
          <b>Keep the default picks</b>
        </label>
        <div style={{ marginLeft: 24 }} data-testid="what-stays-defaults">
          {list((i) => i.defaultPicked)}
        </div>
      </div>
      <div>
        <label className="bl-row" style={{ gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="radio" name={name} checked={choice === "saved"} onChange={() => setChoice("saved")} />
          <b>I&apos;ll choose what stays</b>
        </label>
        {choice === "saved" ? (
          <div style={{ marginLeft: 24, marginTop: 4 }} data-testid="what-stays-own">
            {saved && !savedFits ? (
              <>
                <div className="bl-small" style={{ color: "var(--rose)" }} data-testid="what-stays-no-fit">
                  Your earlier choice doesn&apos;t fit {data.targetPlan.name}&apos;s limits any more. Edit it, or keep the default picks.
                </div>
                <BLink to="chooseWhatStays" params={choose} className="btn btn-primary btn-sm" style={{ marginTop: 4 }}>
                  Edit
                </BLink>
              </>
            ) : saved ? (
              <>
                <div className="bl-muted bl-small">Your earlier choice</div>
                {list((i) => i.selected)}
                <BLink to="chooseWhatStays" params={choose} className="btn btn-ghost btn-sm" style={{ marginTop: 4 }}>
                  Edit
                </BLink>
              </>
            ) : (
              <BLink to="chooseWhatStays" params={choose} className="btn btn-primary btn-sm">
                Choose what stays
              </BLink>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
