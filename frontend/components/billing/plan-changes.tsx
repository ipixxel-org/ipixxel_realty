"use client";

import { useState } from "react";
import { Icon } from "@/components/icons";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatINR, planPrice } from "@/lib/billing/pricing";
import type { BillingPlan } from "@/lib/billing/types";
import { BillingBanner, PicksSummary } from "./banners";
import { useBillingEnv, useBillingQuery, useOrgBilling } from "./context";
import { BillingDialog, DialogActions } from "./dialog";
import { Banner, BLink, countLabel, ErrorNote, Kv, Loading, Section } from "./ui";

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

export function DowngradeScreen({ planId }: { planId: string }) {
  const { client, nav, canEdit } = useBillingEnv();
  const { overview, refresh } = useOrgBilling();
  const { toast } = useToast();
  const { data: plans } = useBillingQuery((c) => c.listPlans(), []);
  const { data: retention } = useBillingQuery((c) => c.getRetentionChoices({ targetPlanId: planId }), [planId]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!overview || !plans) return <Loading />;
  const target = plans.find((p) => p.id === planId);
  if (!target) return <ErrorNote message="That plan doesn't exist." />;
  const o = overview;
  const onFree = o.status === "free" || o.status === "moved_to_basic";

  if (o.status === "downgrade_scheduled") return <BillingBanner overview={o} />;
  if (onFree || target.rank >= o.plan.rank) {
    return (
      <Banner
        tone="amber"
        icon="info"
        title={onFree ? "You're already on Basic — there's nothing to downgrade" : `${target.name} isn't smaller than your ${o.plan.name} plan`}
        actions={
          <BLink to="plans" className="btn btn-primary btn-sm">
            See plans
          </BLink>
        }
      />
    );
  }

  const effective = o.graceEndsAt ?? o.periodEnd;
  const over = o.usage.filter((u) => target.limits[u.key] !== null && u.used > target.limits[u.key]!);
  const fewerPages = (target.modules.metaPages ?? Infinity) < (o.plan.modules.metaPages ?? Infinity);

  async function schedule() {
    setBusy(true);
    try {
      await client.scheduleDowngrade({ planId: target!.id });
      await refresh();
      setConfirm(false);
      toast({ variant: "success", title: "Downgrade scheduled", description: `${target!.name} starts on ${effective ? formatDate(effective) : "your renewal date"}.` });
      nav.go("overview");
    } catch (e) {
      toast({ variant: "error", title: "Couldn't schedule the downgrade", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bl-stack">
      <Section title={`Downgrade ${o.plan.name} → ${target.name}`} sub="Nothing changes until the end of the period you've paid for.">
        <div className="bl-grid3">
          <Kv label="Takes effect">{effective ? formatDate(effective) : "—"}</Kv>
          <Kv label="Until then">{o.plan.name} — everything as today</Kv>
          <Kv label="Then you pay">{target.isFree ? "Nothing — Basic is free" : `${formatINR(planPrice(target, o.interval))} + GST / ${o.interval === "yearly" ? "year" : "month"}`}</Kv>
        </div>
      </Section>

      {over.length ? (
        <Banner
          tone="amber"
          icon="alert"
          title={`You're over ${target.name}'s limits`}
          actions={
            <BLink to="chooseWhatStays" params={{ target: target.id }} className="btn btn-primary btn-sm">
              Choose what stays
            </BLink>
          }
        >
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {over.map((u) => (
              <li key={u.key}>
                You have {u.used} {u.label.toLowerCase()}; {target.name} allows {target.limits[u.key]}.
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 6 }}>On {effective ? formatDate(effective) : "that date"} the extra ones are paused, not deleted. Choose which stay, or we keep the ones below.</div>
          {retention ? (
            <PicksSummary
              retention={{
                targetPlanId: target.id,
                targetPlanName: target.name,
                isDefault: retention.isDefault,
                users: retention.users.filter((x) => x.selected).map((x) => x.name),
                projects: retention.projects.filter((x) => x.selected).map((x) => x.name),
                landingPages: retention.landingPages.filter((x) => x.selected).map((x) => x.name),
              }}
            />
          ) : null}
        </Banner>
      ) : (
        <Banner tone="green" icon="check" title={`Everything fits on ${target.name}`}>
          Your users, projects and landing pages are all within {target.name}&apos;s limits.
        </Banner>
      )}

      {!target.modules.teamChat || !target.modules.metaLeadAds || fewerPages ? (
        <Banner tone="gray" icon="info" title="Features that change">
          {!target.modules.teamChat ? "Team chat becomes read-only history. " : ""}
          {!target.modules.metaLeadAds ? "Meta lead ads switches off. " : fewerPages ? `Meta lead ads drops to ${countLabel(target.modules.metaPages, "connected page", "connected pages")}. ` : ""}
          Leads from your forms and landing pages keep coming in.
        </Banner>
      ) : null}

      <div className="bl-row">
        <button type="button" className="btn btn-primary" disabled={!canEdit} onClick={() => setConfirm(true)}>
          <Icon name="arrow-down" size={15} /> Confirm downgrade
        </button>
        <BLink to="plans" className="btn btn-ghost">
          Keep {o.plan.name}
        </BLink>
      </div>
      <ConfirmDialog
        open={confirm}
        title={`Downgrade to ${target.name}?`}
        message={`You keep ${o.plan.name} until ${effective ? formatDate(effective) : "the end of the period"}. You can undo this any time before then.`}
        confirmLabel="Schedule downgrade"
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={() => void schedule()}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Cancel */

const REASONS = ["Too expensive", "Missing a feature we need", "Project finished / paused", "Switching to another tool", "Other"];

export function CancelScreen() {
  const { client, nav, canEdit } = useBillingEnv();
  const { overview, refresh } = useOrgBilling();
  const { toast } = useToast();
  const { data: plans } = useBillingQuery((c) => c.listPlans(), []);
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!overview || !plans) return <Loading />;
  const o = overview;
  if (o.plan.isFree) return <Banner tone="gray" icon="info" title="You're on Basic — there's no paid plan to cancel." />;
  if (o.status === "cancellation_scheduled") return <BillingBanner overview={o} />;
  const endsOn = o.graceEndsAt ?? o.periodEnd;
  const free = plans.find((p) => p.isFree) as BillingPlan;

  async function cancel() {
    setBusy(true);
    try {
      await client.cancelPlan({ reason: reason || undefined });
      await refresh();
      setConfirm(false);
      toast({ variant: "success", title: "Cancellation scheduled", description: `${o.plan.name} stays active until ${endsOn ? formatDate(endsOn) : "the end date"}.` });
      nav.go("overview");
    } catch (e) {
      toast({ variant: "error", title: "Couldn't cancel", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bl-stack">
      <Section title={`Cancel ${o.plan.name}`}>
        <div className="bl-grid3">
          <Kv label="Plan ends">{endsOn ? formatDate(endsOn) : "—"}</Kv>
          <Kv label="Until then">Full {o.plan.name} access</Kv>
          <Kv label="After that">{free.name} (free)</Kv>
        </div>
        <div className="bl-muted" style={{ marginTop: 14 }}>
          No further charges{o.renewalMode === "auto" ? " — automatic payments stop too" : ""}. Nothing is deleted: whatever doesn&apos;t fit on {free.name} is paused, and leads keep
          coming in.
        </div>
        {o.retention ? <PicksSummary retention={o.retention} /> : null}
        <div className="field" style={{ marginTop: 16, marginBottom: 0, maxWidth: 360 }}>
          <label>Why are you cancelling? (optional)</label>
          <select className="inp" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason…</option>
            {REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      </Section>
      <div className="bl-row">
        <button type="button" className="btn btn-danger" disabled={!canEdit} onClick={() => setConfirm(true)}>
          Cancel plan
        </button>
        <BLink to="chooseWhatStays" className="btn btn-ghost">
          Choose what stays first
        </BLink>
        <BLink to="overview" className="btn btn-ghost">
          Keep {o.plan.name}
        </BLink>
      </div>
      <ConfirmDialog
        open={confirm}
        danger
        title={`Cancel ${o.plan.name}?`}
        message={`Access continues until ${endsOn ? formatDate(endsOn) : "the end of the period"}. After that you move to ${free.name}. You can undo this before then.`}
        confirmLabel="Yes, cancel"
        busy={busy}
        onClose={() => setConfirm(false)}
        onConfirm={() => void cancel()}
      />
    </div>
  );
}
