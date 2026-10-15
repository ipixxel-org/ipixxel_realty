"use client";

import { useEffect, useRef, useState } from "react";
import { TEMPLATES, buildTemplateSections } from "@/lib/openpage/data";
import { createTemplate, type TemplateCategory } from "@/lib/openpage/persist";
import { builderPath } from "@/lib/openpage/paths";
import { seedConfigFor } from "@/lib/openpage/site-config";
import {
  buildRealEstateTemplate,
  openPageTemplateIdForDesign,
  realEstateTemplateMeta,
} from "@/lib/openpage/re-templates";
import type { TemplateData } from "@/lib/openpage/types";
import type { Plan } from "@/lib/types";
import {
  CardGrid,
  CheckCard,
  Field,
  FormActions,
  FormAlert,
  FormModal,
  FormSection,
  MiniButton,
  SelectInput,
  TextInput,
  formPageStyles,
} from "@/components/forms/form-page";

// Create landing-page template popup on /admin-console/templates. Same
// fields, tier rule and createTemplate call as the former
// /admin-console/templates/new page; on success it opens the builder.

function thumbnailFor(id: string): string {
  switch (id) {
    case "premium":
      return "hero";
    case "aurelia-reserve":
      return "/templates/aurelia-reserve.jpg";
    case "vista-framed":
      return "/templates/vista-framed.jpg";
    case "future-home":
      return "/templates/future-home.jpg";
    case "modern-living":
      return "/templates/modern-living.jpg";
    case "investment-hub":
      return "/templates/investment-hub.jpg";
    case "vista-curve":
      return "/templates/vista-curve.jpg";
    case "residential":
      return "tower";
    case "commercial":
      return "commercial";
    case "luxury":
      return "interior";
    case "villa":
      return "villa";
    case "plot":
      return "plots";
    case "launch":
      return "overview";
    case "enquiry":
      return "lobby";
    case "site-visit":
      return "tour";
    case "brochure":
      return "pool";
    case "lead":
      return "garden";
    default:
      return "tower";
  }
}

const blankBase: TemplateData = {
  id: "blank",
  name: "Blank canvas",
  category: "Real Estate",
  icon: "LayoutTemplate",
  pages: 1,
  conversions: "—",
  accent: "#6D5DFC",
  accent2: "#1e293b",
  thumbnail: "hero",
  description: "Empty page — add sections in the builder",
};

async function createFromDesign(
  template: TemplateData,
  name: string,
  tier: "free" | "paid" | "premium" = "free",
  categoryId?: string,
  allowedPlanIds?: string[],
) {
  const label = name?.trim();
  if (!label) {
    throw new Error("Template name is required");
  }
  const slug =
    label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "new-template";
  const config = seedConfigFor({
    id: "",
    name: label,
    slug,
    status: "draft",
    template: template.name,
    domain: "",
    views: "—",
    conversions: "—",
    updated: "",
    thumbnail: template.thumbnail,
    sections: [],
    designId: template.id,
    kind: "custom",
  });
  if (allowedPlanIds && allowedPlanIds.length > 0) {
    (config as unknown as { allowedPlanIds?: string[] }).allowedPlanIds = allowedPlanIds;
  }
  const created = await createTemplate({
    name: label,
    slug,
    designId: template.id,
    template: template.name,
    kind: "custom",
    tier,
    categoryId: categoryId || undefined,
    sections: buildTemplateSections(template.id),
    config,
    openPageSite: buildRealEstateTemplate(openPageTemplateIdForDesign(template.id), label),
  });
  // Straight into the builder.
  window.location.assign(builderPath(created.id));
}

/**
 * Mount only while open (`{open && <CreateTemplateModal … />}`) so every
 * open starts from a fresh form. `initialDesignId` / `initialName` pre-fill
 * it for "Edit" on a predefined design that has no saved page yet.
 */
export function CreateTemplateModal({
  onClose,
  categories,
  plans,
  initialDesignId = "blank",
  initialName = "",
}: {
  onClose: () => void;
  categories: TemplateCategory[];
  plans: Plan[];
  initialDesignId?: string;
  initialName?: string;
}) {
  const designId = initialDesignId;
  const [newName, setNewName] = useState(initialName);
  // All plans are granted access by default.
  const [createPlanIds, setCreatePlanIds] = useState<string[]>(() => plans.map((p) => p.id));
  const [createCategoryId, setCreateCategoryId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createBusy, setCreateBusy] = useState(false);

  // Plans may still be loading when the popup opens — keep the "all plans"
  // default once they arrive, unless the user has already changed the picks.
  const planPicksTouched = useRef(false);
  useEffect(() => {
    if (!planPicksTouched.current) setCreatePlanIds(plans.map((p) => p.id));
  }, [plans]);

  function updatePlanIds(next: (prev: string[]) => string[]) {
    planPicksTouched.current = true;
    setCreatePlanIds(next);
  }

  async function submitCreate(e?: React.FormEvent) {
    e?.preventDefault();
    if (createBusy) return;
    const trimmed = newName.trim();
    if (!trimmed) {
      setCreateError("Template name is required");
      return;
    }
    setCreateBusy(true);
    setCreateError(null);
    try {
      const meta = realEstateTemplateMeta.find((t) => t.id === designId);
      const base: TemplateData = meta
        ? {
            ...blankBase,
            id: meta.id,
            name: meta.name,
            description: meta.description,
            thumbnail: thumbnailFor(meta.id),
          }
        : TEMPLATES.find((t) => t.id === designId) ?? blankBase;
      const computedTier = (() => {
        if (createPlanIds.length === 0) return "free" as const;
        const selected = plans.filter((p) => createPlanIds.includes(p.id));
        const hasFree = selected.some(
          (p) => (p.priceMonthly ?? 0) === 0 || p.slug === "basic" || p.slug === "free",
        );
        if (hasFree) return "free" as const;
        const isOnlyTop = selected.every(
          (p) => (p.priceMonthly ?? 0) >= 10000 || /ultra|premium|enterprise/i.test(p.slug),
        );
        if (isOnlyTop && selected.length > 0) return "premium" as const;
        return "paid" as const;
      })();
      await createFromDesign(base, trimmed, computedTier, createCategoryId, createPlanIds);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create template");
      setCreateBusy(false);
    }
  }

  return (
    <FormModal
      open
      onClose={onClose}
      title="Create new landing page template"
      description="Name it, pick a category and choose which subscription plans can use it — then open it in the builder."
      busy={createBusy}
      size="lg"
      onSubmit={(e) => void submitCreate(e)}
    >
      <FormAlert message={createError} />

      <Field htmlFor="tp-name" label="Template name *" icon="templates">
        <TextInput
          id="tp-name"
          icon="templates"
          autoFocus
          required
          value={newName}
          placeholder="e.g. Luxury Penthouse Showcase"
          onChange={(e) => {
            setNewName(e.target.value);
            if (createError) setCreateError(null);
          }}
        />
      </Field>

      <Field htmlFor="tp-category" label="Category" note="(optional)" icon="tag">
        <SelectInput id="tp-category" value={createCategoryId} onChange={(e) => setCreateCategoryId(e.target.value)}>
          <option value="">Unassigned</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectInput>
      </Field>

      <FormSection
        title="Subscription plan access"
        actions={
          <>
            <MiniButton onClick={() => updatePlanIds(() => plans.map((p) => p.id))}>Select all</MiniButton>
            <MiniButton onClick={() => updatePlanIds(() => [])}>Clear all</MiniButton>
          </>
        }
      />
      <div className={formPageStyles.emptyNote} style={{ fontStyle: "normal", marginBottom: 12 }}>
        Check each subscription plan that is granted access to use this template:
      </div>
      <CardGrid>
        {plans.map((p) => {
          const isChecked = createPlanIds.includes(p.id);
          return (
            <CheckCard
              key={p.id}
              checked={isChecked}
              onChange={(checked) =>
                updatePlanIds((prev) => (checked ? [...prev, p.id] : prev.filter((id) => id !== p.id)))
              }
              title={p.name}
              description={p.priceMonthly ? `₹${p.priceMonthly.toLocaleString()}/mo` : "Free Plan"}
            />
          );
        })}
      </CardGrid>

      <FormActions
        onCancel={onClose}
        busy={createBusy}
        submitDisabled={!newName.trim()}
        busyLabel="Creating…"
        submitLabel="Create & Open Builder"
        submitIcon="plus"
      />
    </FormModal>
  );
}
