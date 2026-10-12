"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, getPlanCapabilities } from "@/lib/api";
import { setFlash } from "@/lib/flash";
import {
  CardGrid,
  CheckCard,
  Field,
  FormActions,
  FormAlert,
  FormGrid,
  FormPage,
  FormSection,
  // MiniButton, // used by the hidden capabilities section
  PhoneInput,
  // TagList, // used by the hidden feature highlights section
  TextArea,
  TextInput,
  formPageStyles,
} from "@/components/forms/form-page";
import type { Plan, PlanCapability } from "@/lib/types";
import { LIMIT_ROWS, PLANS_TAB, SUBS_FLASH_KEY, SUBS_PATH, type LimitKey } from "./subscriptions-shared";

// Create / edit platform plan — full page (was the plan modal on the
// Subscriptions studio). Same defaults, fields and POST / PATCH bodies.

type PlanFormState = Partial<Plan> & { features?: string[]; isPopular?: boolean };

function initialForm(plan?: Plan): PlanFormState {
  if (!plan) {
    return {
      name: "",
      priceMonthly: 3500,
      priceYearly: 35000,
      description: "",
      features: ["Everything you need to get started"],
      limits: { projects: 3, users: 2, templates: 20, landingPages: 5 },
      capabilities: {},
    };
  }
  return {
    ...plan,
    features: [...(plan.features || [])],
    limits: { ...(plan.limits ?? { projects: null, users: null, templates: null, landingPages: null }) },
    capabilities: { ...(plan.capabilities ?? {}) },
  };
}

export function PlanForm({ plan }: { plan?: Plan }) {
  const router = useRouter();
  const isEdit = plan !== undefined;
  const [planForm, setPlanForm] = useState<PlanFormState>(() => initialForm(plan));
  // const [featureInput, setFeatureInput] = useState(""); // hidden feature highlights section
  const [capabilities, setCapabilities] = useState<PlanCapability[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPlanCapabilities()
      .then((list) => {
        if (!cancelled) setCapabilities(list || []);
      })
      .catch(() => {
        if (!cancelled) setCapabilities([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const formLimit = (key: LimitKey): number | null => {
    const v = (planForm.limits as Record<string, number | null> | undefined)?.[key];
    return v == null ? null : v;
  };

  const setFormLimit = (key: LimitKey, value: number | null) => {
    setPlanForm((p) => ({
      ...p,
      limits: { projects: null, users: null, templates: null, landingPages: null, landingPagesCreate: null, ...(p.limits ?? {}), [key]: value },
    }));
  };

  // Helpers for the hidden feature highlights / capabilities sections.
  // const toggleCapability = (key: string, on: boolean) => {
  //   setPlanForm((p) => ({ ...p, capabilities: { ...(p.capabilities ?? {}), [key]: on } }));
  // };
  //
  // const setAllCapabilities = (enable: boolean) => {
  //   const updated: Record<string, boolean> = {};
  //   for (const cap of capabilities) updated[cap.key] = enable;
  //   setPlanForm((p) => ({ ...p, capabilities: updated }));
  // };
  //
  // const addFeature = () => {
  //   const text = featureInput.trim();
  //   if (!text) return;
  //   setPlanForm((p) => ({ ...p, features: [...(p.features || []), text] }));
  //   setFeatureInput("");
  // };
  //
  // const removeFeature = (index: number) => {
  //   setPlanForm((p) => ({ ...p, features: (p.features || []).filter((_, i) => i !== index) }));
  // };

  async function savePlan(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const name = String(planForm.name || "").trim();
    if (!name) {
      setError("Plan name required");
      return;
    }
    const limits = {
      projects: formLimit("projects"),
      users: formLimit("users"),
      templates: formLimit("templates"),
      landingPagesCreate: formLimit("landingPagesCreate"),
      landingPages: formLimit("landingPages"),
    };
    const capMap: Record<string, boolean> = {};
    for (const cap of capabilities) {
      if (planForm.capabilities?.[cap.key]) capMap[cap.key] = true;
    }
    setSaving(true);
    setError(null);
    try {
      if (plan) {
        await apiFetch<Plan>(`/admin/plans/${encodeURIComponent(plan.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            name,
            slug: planForm.slug,
            description: planForm.description,
            priceMonthly: Number(planForm.priceMonthly || 0),
            priceYearly: Number(planForm.priceYearly || 0),
            features: planForm.features || [],
            limits,
            capabilities: capMap,
            color: planForm.color,
            badge: planForm.badge,
            isPopular: planForm.isPopular,
          }),
        });
        setFlash(SUBS_FLASH_KEY, { message: `Plan “${name}” updated`, tab: PLANS_TAB });
      } else {
        await apiFetch<Plan>("/admin/plans", {
          method: "POST",
          body: JSON.stringify({
            name,
            slug: planForm.slug,
            description: planForm.description || "",
            priceMonthly: Number(planForm.priceMonthly || 3000),
            priceYearly: Number(planForm.priceYearly || 30000),
            features: planForm.features || [],
            limits,
            capabilities: capMap,
            color: planForm.color || "#eef0fe",
            badge: planForm.badge || "b-indigo",
            isPopular: planForm.isPopular || false,
          }),
        });
        setFlash(SUBS_FLASH_KEY, { message: `Plan “${name}” created`, tab: PLANS_TAB });
      }
      router.push(SUBS_PATH);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  }

  // const activeCaps = Object.values(planForm.capabilities || {}).filter(Boolean).length;

  return (
    <FormPage
      eyebrow="Billing · Plans & Subscriptions"
      title={isEdit ? "Edit platform tier plan" : "Create new platform tier plan"}
      subtitle="Configure pricing, numeric quota limits and system capabilities."
      backHref={SUBS_PATH}
      backLabel="Back to Plans & Subscriptions"
    >
      <form className={formPageStyles.panel} onSubmit={savePlan}>
        <FormAlert message={error} />

        <FormSection title="Basic information & pricing" />
        <FormGrid>
          <Field htmlFor="pl-name" label="Plan name *" icon="billing">
            <TextInput
              id="pl-name"
              icon="billing"
              value={String(planForm.name || "")}
              placeholder="e.g. Professional"
              onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))}
            />
          </Field>
          <Field
            htmlFor="pl-slug"
            label="URL slug"
            icon="link"
            hint={
              isEdit
                ? undefined
                : "Slug will be generated automatically if you leave this blank. You can also enter your own slug."
            }
          >
            <TextInput
              id="pl-slug"
              icon="link"
              value={String(planForm.slug || "")}
              placeholder="professional"
              onChange={(e) => setPlanForm((p) => ({ ...p, slug: e.target.value }))}
            />
          </Field>
        </FormGrid>

        <FormGrid>
          <Field htmlFor="pl-monthly" label="Price / month (₹) *" icon="billing">
            <PhoneInput
              id="pl-monthly"
              prefix="₹"
              type="number"
              min={0}
              value={String(planForm.priceMonthly ?? "")}
              onChange={(e) => setPlanForm((p) => ({ ...p, priceMonthly: Number(e.target.value || 0) }))}
            />
          </Field>
          <Field htmlFor="pl-yearly" label="Price / year (₹) *" note="· Save ~15%" icon="billing">
            <PhoneInput
              id="pl-yearly"
              prefix="₹"
              type="number"
              min={0}
              value={String(planForm.priceYearly ?? "")}
              onChange={(e) => setPlanForm((p) => ({ ...p, priceYearly: Number(e.target.value || 0) }))}
            />
          </Field>
        </FormGrid>

        <Field htmlFor="pl-desc" label="Description" icon="document">
          <TextArea
            id="pl-desc"
            rows={2}
            value={String(planForm.description || "")}
            placeholder="Who is this plan designed for?"
            onChange={(e) => setPlanForm((p) => ({ ...p, description: e.target.value }))}
          />
        </Field>

        <CardGrid>
          <CheckCard
            checked={!!planForm.isPopular}
            onChange={(checked) => setPlanForm((p) => ({ ...p, isPopular: checked }))}
            title="★ Highlight as Popular Plan"
          />
        </CardGrid>

        <FormSection title="Resource quotas & limits" />
        <CardGrid>
          {LIMIT_ROWS.map((row) => {
            const v = formLimit(row.key);
            const unlimited = v === null;
            return (
              <div key={row.key} className={formPageStyles.tile}>
                <div className={formPageStyles.tileLabel}>{row.label}</div>
                <div className={formPageStyles.tileRow}>
                  <TextInput
                    aria-label={row.label}
                    type="number"
                    min={0}
                    step={1}
                    value={unlimited ? "" : String(v)}
                    disabled={unlimited}
                    placeholder="Unlimited"
                    onChange={(e) => {
                      const raw = e.target.value;
                      const n = raw === "" ? 0 : Math.max(0, Math.floor(Number(raw) || 0));
                      setFormLimit(row.key, n);
                    }}
                  />
                  <label className={formPageStyles.inlineCheck}>
                    <input
                      type="checkbox"
                      checked={unlimited}
                      onChange={(e) => setFormLimit(row.key, e.target.checked ? null : 0)}
                    />
                    Unlimited
                  </label>
                </div>
              </div>
            );
          })}
        </CardGrid>

        {/*
          Plan feature highlights & module capabilities are hidden for now (not needed
          in the UI yet). State, the capability catalog fetch and the save payload are
          kept as-is, so existing plans retain their features/capabilities on edit.

        <FormSection title={`Plan feature highlights (${planForm.features?.length || 0})`} />
        <div className={formPageStyles.inlineRow}>
          <TextInput
            aria-label="Feature bullet point"
            icon="check"
            value={featureInput}
            placeholder="Add feature bullet point (e.g. 24/7 Dedicated Support) & press Enter"
            onChange={(e) => setFeatureInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addFeature();
              }
            }}
          />
          <button type="button" className={formPageStyles.btn} onClick={addFeature}>
            + Add Feature
          </button>
        </div>
        <TagList
          items={planForm.features || []}
          onRemove={removeFeature}
          empty='No feature bullet points added yet. Type above and click "+ Add Feature".'
        />

        <FormSection
          title={`Module capabilities & access · ${activeCaps} / ${capabilities.length} active`}
          actions={
            <>
              <MiniButton onClick={() => setAllCapabilities(true)}>Enable All</MiniButton>
              <MiniButton onClick={() => setAllCapabilities(false)}>Disable All</MiniButton>
            </>
          }
        />
        {capabilities.length === 0 ? (
          <div className={formPageStyles.emptyNote}>Loading capability catalog from server...</div>
        ) : (
          <CardGrid>
            {capabilities.map((cap) => (
              <CheckCard
                key={cap.key}
                checked={!!planForm.capabilities?.[cap.key]}
                onChange={(checked) => toggleCapability(cap.key, checked)}
                title={cap.label}
                description={cap.description}
                status={["ACTIVE", "OFF"]}
              />
            ))}
          </CardGrid>
        )}
        */}

        <FormActions
          cancelHref={SUBS_PATH}
          busy={saving}
          busyLabel="Saving…"
          submitLabel={isEdit ? "Save Plan Changes" : "Create & Publish Plan"}
          submitIcon={isEdit ? "check" : "plus"}
        />
      </form>
    </FormPage>
  );
}
