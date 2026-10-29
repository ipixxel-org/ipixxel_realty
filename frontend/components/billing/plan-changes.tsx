"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { isOverdue, planChangeRoute } from "@/lib/billing/direction";
import { formatDate, packagePriceText, planPrice } from "@/lib/billing/pricing";
import type { BillingInterval } from "@/lib/billing/types";
import { planChangeBlock } from "@/lib/billing/requests";
import { ScheduledChangeNote } from "./banners";
import { useBillingEnv, useBillingQuery, useOrgBilling } from "./context";
import { BillingDialog, DialogActions } from "./dialog";
import { WhatStaysOptions, type WhatStaysPick } from "./choose-what-stays";
import { Banner, BillingRedirect, BLink, countLabel, ErrorNote, Kv, Loading, Section } from "./ui";

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <BillingDialog
      open={open}
      onClose={onClose}
      title={title}
      description={message}
      footer={
        <DialogActions>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Go back
          </button>
          <button type="button" className={`btn btn-sm ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={onConfirm}>
            {busy ? "Saving…" : confirmLabel}
          </button>
        </DialogActions>
      }
    />
  );
}

/* --------------------------------------------------------------- Downgrade */

const REASONS = ["Too expensive", "Missing a feature we need", "Project finished / paused", "Switching to another tool", "Other"];

/** "23 Dec 2026", or a fallback when there's no date. */
const onDate = (iso: string | null | undefined, fallback: string) => (iso ? formatDate(iso) : fallback);

export function DowngradeScreen({
  planId,
  interval: wanted,
  initialPick = null,
}: {
  planId: string;
  interval?: BillingInterval;
  /** Back from Choose what stays (`pick=saved`): "I'll choose what stays" stays selected. */
  initialPick?: WhatStaysPick["choice"];
}) {
  const { client, nav, canEdit } = useBillingEnv();
  const { overview, refresh } = useOrgBilling();
  const { toast } = useToast();
  const { data: plans } = useBillingQuery((c) => c.listPlans(), []);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  // Over the smaller plan's limits: "Keep the default picks" / "I'll choose what stays", picked every time.
  const [wsPick, setWsPick] = useState<WhatStaysPick>({ choice: null, ready: false });
  if (!overview || !plans) return <Loading />;
  const target = plans.find((p) => p.id === planId);
  if (!target) return <ErrorNote message="That plan doesn't exist." />;
  const o = overview;
  const onFree = o.status === "free" || o.status === "moved_to_basic";
  const interval = wanted ?? o.interval;
  // Same plan, yearly → monthly, is a downgrade too (it starts at renewal).
  const toMonthly = target.id === o.plan.id && o.interval === "yearly" && interval === "monthly";
  const per = interval === "yearly" ? "year" : "month";

  // A change is already scheduled: the message and "Keep <plan>" instead of the form.
  const block = planChangeBlock(o);
  if (block?.reason === "change_scheduled") return <ScheduledChangeNote overview={o} />;
  // Renewal overdue (either mode): Basic happens now; a paid plan is paid at the checkout.
  const overdue = isOverdue(o);
  // Same rule as the plan cards: a bigger plan (or any paid plan while
  // overdue) belongs on the checkout, not here.
  const route = planChangeRoute(o, target, interval);
  if (route === "checkout") return <BillingRedirect to="checkout" params={{ plan: target.id, interval }} />;
  if (route !== "downgrade") {
    return (
      <Banner
        tone="amber"
        icon="info"
        title={onFree ? "You're already on Basic — our smallest plan" : `You're already on ${o.plan.name} (${o.interval})`}
        actions={
          <BLink to="plans" className="btn btn-primary btn-sm">
            See plans
          </BLink>
        }
      />
    );
  }

  // Basic uses the end-of-term move to the free plan underneath; the reason is saved with it.
  const toBasic = target.isFree;
  // The paid term is already over: moving to Basic happens straight away.
  const now = toBasic && (o.status === "expired" || overdue);
  const effective = now ? null : (o.graceEndsAt ?? o.periodEnd);
  const when = onDate(effective, "the end of your paid period");
  const over = o.usage.filter((u) => target.limits[u.key] !== null && u.used > target.limits[u.key]!);
  // Until "choose what stays" is live, nothing can be paused: the org has to fit first.
  const canPause = client.isMock || client.isReal("saveRetentionChoices");
  const blocked = over.length > 0 && !canPause;
  // "Choose what stays" is part of the change: one of the two options, picked every time.
  const needsConfirm = over.length > 0 && canPause && !wsPick.ready;
  const fewerPages = (target.modules.metaPages ?? Infinity) < (o.plan.modules.metaPages ?? Infinity);

  async function schedule() {
    setBusy(true);
    try {
      const extra = over.length > 0 && wsPick.choice ? { whatStaysChoice: wsPick.choice } : {};
      const next = toBasic
        ? await client.cancelPlan({ reason: reason || undefined, ...extra })
        : await client.scheduleDowngrade({ planId: target!.id, interval, ...extra });
      await refresh();
      setConfirm(false);
      if (next.plan.isFree) toast({ variant: "success", title: `You're on ${target!.name} now` });
      else toast({ variant: "success", title: `Change to ${target!.name} scheduled for ${when}`, description: `You keep ${o.plan.name} until then.` });
      nav.go("overview");
    } catch (e) {
      toast({ variant: "error", title: "Couldn't schedule the plan change", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bl-stack">
      <Section
        title={toMonthly ? `Switch ${o.plan.name} to monthly billing` : `Change plan ${o.plan.name} → ${target.name}`}
        sub="Nothing changes until the end of the period you've paid for."
      >
        <div className="bl-grid3">
          <Kv label="Takes effect">{now ? "Straight away" : effective ? formatDate(effective) : "—"}</Kv>
          <Kv label="Until then">{o.plan.name} — everything as today</Kv>
          <Kv label="Then you pay">{target.isFree ? `Nothing — ${target.name} is free` : `${packagePriceText(planPrice(target, interval))} / ${per}`}</Kv>
        </div>
      </Section>

      {blocked ? (
        <Banner tone="amber" icon="alert" title={`You're over ${target.name}'s limits`}>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {over.map((u) => (
              <li key={u.key}>
                You have {u.used} {u.label.toLowerCase()}; {target.name} allows {target.limits[u.key]}.
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 6 }}>Remove or deactivate the extra ones first, then come back to schedule the plan change. Nothing changes until then.</div>
        </Banner>
      ) : over.length ? (
        <Banner tone="amber" icon="alert" title={`You're over ${target.name}'s limits`}>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {over.map((u) => (
              <li key={u.key}>
                You have {u.used} {u.label.toLowerCase()}; {target.name} allows {target.limits[u.key]}.
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 6, marginBottom: 8 }}>
            {now ? "Straight away" : `On ${effective ? formatDate(effective) : "that date"}`} the extra ones are paused, not deleted. Pick what stays:
          </div>
          <WhatStaysOptions
            targetPlanId={target.id}
            initialChoice={initialPick}
            chooseParams={{ back: "downgrade", interval }}
            onChange={setWsPick}
          />
        </Banner>
      ) : (
        <Banner tone="green" icon="check" title={`Everything fits on ${target.name}`}>
          Your users, projects, landing pages and templates are all within {target.name}&apos;s limits.
        </Banner>
      )}

      {!target.modules.teamChat || !target.modules.metaLeadAds || fewerPages ? (
        <Banner tone="gray" icon="info" title="Features that change">
          {!target.modules.teamChat ? "Team chat becomes read-only history. " : ""}
          {!target.modules.metaLeadAds ? "Meta lead ads switches off. " : fewerPages ? `Meta lead ads drops to ${countLabel(target.modules.metaPages, "connected page", "connected pages")}. ` : ""}
          Leads from your forms and landing pages keep coming in.
        </Banner>
      ) : null}

      {toBasic ? (
        <div className="field" style={{ marginBottom: 0, maxWidth: 360 }}>
          <label htmlFor="bl-basic-reason">Why are you moving to {target.name}? (optional)</label>
          <select id="bl-basic-reason" className="inp" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason…</option>
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="bl-row">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canEdit || blocked || !!block || needsConfirm}
          title={
            block
              ? block.message
              : blocked
                ? `Get within ${target.name}'s limits first`
                : needsConfirm
                  ? `Pick what stays on ${target.name} first`
                  : undefined
          }
          onClick={() => setConfirm(true)}
        >
          <Icon name="arrow-down" size={15} /> {toMonthly ? "Confirm switch to monthly" : toBasic ? `Move to ${target.name}` : "Confirm plan change"}
        </button>
        <BLink to="plans" className="btn btn-ghost">
          Keep {o.plan.name}
        </BLink>
      </div>
      <ConfirmDialog
        open={confirm}
        title={
          toMonthly
            ? "Switch to monthly billing?"
            : now
              ? `Move to ${target.name} now?`
              : `${toBasic ? "Move" : "Change"} to ${target.name} on ${when}?`
        }
        message={
          now
            ? overdue
              ? `Your ${o.plan.name} renewal is overdue, so the move happens straight away. Anything over ${target.name}'s limits is paused, not deleted.`
              : `Your ${o.plan.name} term has ended, so the move happens straight away.`
            : `You keep ${o.plan.name} until then.`
        }
        confirmLabel={toBasic ? `Move to ${target.name}` : "Schedule plan change"}
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={() => void schedule()}
      />
    </div>
  );
}

/* ------------------------------------------------------------ Move to Basic */

/** Settings → Billing → Move to Basic: the plan change screen for the free plan (old /cancel links land here). */
export function MoveToBasicScreen() {
  const { data: plans, error } = useBillingQuery((c) => c.listPlans(), []);
  if (error) return <ErrorNote message={error} />;
  if (!plans) return <Loading />;
  const free = plans.find((p) => p.isFree);
  if (!free) return <ErrorNote message="The free plan isn't available right now." />;
  return <DowngradeScreen planId={free.id} />;
}
