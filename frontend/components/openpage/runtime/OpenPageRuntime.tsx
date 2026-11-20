"use client";

import { createContext, useContext, useMemo, useState, useEffect, useCallback, type ReactNode } from "react";
import { findFormById, loadFormLibrary, type FormDefinition } from "@/lib/openpage/forms-store";
import { formDefFromRecord } from "@/lib/openpage/forms-backend";
import { getPublicFormByEmbed } from "@/lib/api";
import { popupTargetFromHref } from "@/lib/openpage/popup-links";
import type { PopupConfig } from "@/components/openpage/blocks/types";
import { DynamicLeadForm } from "@/components/openpage/dynamic-lead-form";
import { X, ArrowRight, CheckCircle2, Download } from "lucide-react";

export type PopupOpenExtra = {
  brochureUrl?: string;
  unlockKey?: string;
  unlockImageUrl?: string;
  mode?: "brochure" | "floor-plan" | "generic";
  formId?: string;
  title?: string;
  description?: string;
};

export interface OpenPageRuntimeValue {
  live: boolean;
  pageId?: string;
  projectName?: string;
  projectId?: string;
  unitId?: string;
  brochureUrl?: string;
  forms: FormDefinition[];
  popups: PopupConfig[];
  openPopup: (popupId?: string, extra?: PopupOpenExtra) => void;
  closePopup: () => void;
  isUnlocked: (key: string) => boolean;
  unlock: (key: string) => void;
}

const RuntimeContext = createContext<OpenPageRuntimeValue>({
  live: false,
  forms: [],
  popups: [],
  openPopup: () => {},
  closePopup: () => {},
  isUnlocked: () => false,
  unlock: () => {},
});

export function useOpenPageRuntime() {
  return useContext(RuntimeContext);
}

function PopupSuccess({
  onDismiss,
  downloadUrl,
  downloadLabel,
}: {
  onDismiss: () => void;
  downloadUrl?: string;
  downloadLabel?: string;
}) {
  return (
    <div className="op-popup-success">
      <div className="op-popup-success-icon">
        <CheckCircle2 size={36} strokeWidth={2} />
      </div>
      <h3 className="op-popup-success-title">Thank You!</h3>
      <p className="op-popup-success-desc">
        Your enquiry has been submitted. Our team will contact you shortly.
      </p>
      {downloadUrl ? (
        <a
          href={downloadUrl}
          target="_blank"
          rel="noreferrer"
          className="op-popup-success-btn"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none", marginBottom: 10 }}
        >
          <Download size={16} />
          {downloadLabel || "Download file"}
        </a>
      ) : null}
      <button type="button" className="op-popup-success-btn" onClick={onDismiss}>
        Done
      </button>
    </div>
  );
}

export function OpenPageRuntimeProvider({
  children,
  live,
  pageId,
  projectName,
  projectId,
  unitId,
  brochureUrl,
  forms,
  popups,
}: {
  children: ReactNode;
  live: boolean;
  pageId?: string;
  projectName?: string;
  projectId?: string;
  unitId?: string;
  brochureUrl?: string;
  forms: FormDefinition[];
  popups: PopupConfig[];
}) {
  const [active, setActive] = useState<{ popup: PopupConfig; extra?: PopupOpenExtra } | null>(null);
  const [visible, setVisible] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [unlocked, setUnlocked] = useState<Record<string, true>>({});

  const unlock = useCallback((key: string) => {
    if (!key) return;
    setUnlocked((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const isUnlocked = useCallback((key: string) => Boolean(unlocked[key]), [unlocked]);

  const closePopup = useCallback(() => {
    setVisible(false);
    setTimeout(() => {
      setActive(null);
      setShowSuccess(false);
    }, 280);
  }, []);

  const openPopup = useCallback(
    (popupId?: string, extra?: PopupOpenExtra) => {
      const base = popupId ? popups.find((p) => p.id === popupId) : popups[0];
      const popup: PopupConfig = base
        ? {
            ...base,
            title: extra?.title || base.title,
            description: extra?.description || base.description,
            formId: extra?.formId || base.formId,
            brochureUrl: extra?.brochureUrl || base.brochureUrl,
          }
        : {
            id: "ad-hoc-gate",
            name: "Gate",
            title: extra?.title || "Share your details",
            description: extra?.description || "Fill the form to continue.",
            formId: extra?.formId,
            brochureUrl: extra?.brochureUrl,
            closeOnOverlay: true,
            trigger: "manual",
          };
      setShowSuccess(false);
      setActive({ popup, extra });
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    },
    [popups],
  );

  useEffect(() => {
    if (active && !visible) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    }
  }, [active, visible]);

  useEffect(() => {
    function onOpenPopup(e: Event) {
      const detail = (e as CustomEvent<{ popupId?: string } & PopupOpenExtra>).detail;
      openPopup(detail?.popupId, detail);
    }
    window.addEventListener("prestate:open-popup", onOpenPopup);
    return () => window.removeEventListener("prestate:open-popup", onOpenPopup);
  }, [openPopup]);

  /* ---- Popup links: a button URL of #popup, #popup:<id> or a form's
     /embed/form/<id> URL opens that form here (see popup-links.ts). ---- */

  // Forms opened from a link that the page itself doesn't carry.
  const [linkedForms, setLinkedForms] = useState<FormDefinition[]>([]);
  const allForms = useMemo(() => (linkedForms.length ? [...forms, ...linkedForms] : forms), [forms, linkedForms]);

  const showFormPopup = useCallback((form: FormDefinition) => {
    setShowSuccess(false);
    setActive({
      popup: {
        id: `form-popup-${form.id}`,
        name: form.name || "Form",
        title: form.name || "",
        description: form.description || "",
        formId: form.id,
        closeOnOverlay: true,
        trigger: "click",
      },
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setVisible(true));
    });
  }, []);

  const openFormFromLink = useCallback(
    (ref: string, fallbackUrl?: string, fallbackTarget?: string) => {
      if (!ref) {
        openPopup();
        return;
      }
      const known = findFormById(ref, allForms);
      if (known) {
        showFormPopup(known);
        return;
      }
      // Saved in this browser's form library (editor preview)?
      const local = findFormById(ref, loadFormLibrary());
      if (local) {
        setLinkedForms((prev) => (prev.some((f) => f.id === local.id) ? prev : [...prev, local]));
        showFormPopup(local);
        return;
      }
      // Published forms are public by embed ID.
      void getPublicFormByEmbed(ref)
        .then((rec) => {
          const form = formDefFromRecord(rec);
          setLinkedForms((prev) => (prev.some((f) => f.id === form.id) ? prev : [...prev, form]));
          showFormPopup(form);
        })
        .catch(() => {
          // Not found: a form URL still opens as a page (the old behaviour);
          // #popup:<unknown> falls back to the page's default popup.
          if (fallbackUrl) {
            if (fallbackTarget === "_blank") window.open(fallbackUrl, "_blank", "noopener,noreferrer");
            else window.location.assign(fallbackUrl);
          } else {
            openPopup();
          }
        });
    },
    [allForms, openPopup, showFormPopup],
  );

  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Already handled (e.g. the editor stops links so they can be selected),
      // or a ctrl/cmd/middle click meant for a new tab.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      // Only links inside the page's sections, not the builder's own UI.
      if (!link || !link.closest("[data-block-id]")) return;
      const target = popupTargetFromHref(link.getAttribute("href"));
      if (!target) return;
      e.preventDefault();
      openFormFromLink(target.ref, target.fromUrl ? link.href : undefined, link.target);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [openFormFromLink]);

  const value = useMemo<OpenPageRuntimeValue>(
    () => ({
      live,
      pageId,
      projectName,
      projectId,
      unitId,
      brochureUrl,
      forms,
      popups,
      openPopup,
      closePopup,
      isUnlocked,
      unlock,
    }),
    [live, pageId, projectName, projectId, unitId, brochureUrl, forms, popups, openPopup, closePopup, isUnlocked, unlock],
  );

  const activeForm =
    active && (active.popup.formId || forms[0])
      ? findFormById(active.popup.formId || "", allForms) ?? forms[0]
      : null;

  const downloadUrl = active?.extra?.brochureUrl || active?.popup.brochureUrl || active?.extra?.unlockImageUrl;

  return (
    <RuntimeContext.Provider value={value}>
      {children}
      {active ? (
        // Clicking outside the card does not close it, so a half-filled form
        // isn't lost by a stray click; only the close (X) button closes it.
        <div className={`op-popup-overlay ${visible ? "op-popup-overlay--visible" : ""}`}>
          <div className={`op-popup-card ${visible ? "op-popup-card--visible" : ""}`}>
            <button type="button" className="op-popup-close" onClick={closePopup} aria-label="Close">
              <X size={16} strokeWidth={2.5} />
            </button>

            {showSuccess ? (
              <PopupSuccess
                onDismiss={closePopup}
                downloadUrl={downloadUrl}
                downloadLabel={
                  active.extra?.mode === "floor-plan" ? "Download floor plan" : "Download brochure"
                }
              />
            ) : (
              <>
                {active.popup.image ? (
                  <div className="op-popup-image-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={active.popup.image} alt="" className="op-popup-image" />
                    <div className="op-popup-image-fade" />
                  </div>
                ) : null}

                <div className="op-popup-body">
                  {active.popup.title ? <h3 className="op-popup-title">{active.popup.title}</h3> : null}
                  {active.popup.description ? <p className="op-popup-desc">{active.popup.description}</p> : null}

                  {active.popup.videoUrl ? (
                    <div className="op-popup-video-wrap">
                      <iframe
                        title="Popup video"
                        src={active.popup.videoUrl}
                        className="op-popup-video"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : null}

                  {activeForm ? (
                    <div className="op-popup-form-wrap">
                      <DynamicLeadForm
                        form={activeForm}
                        live={live}
                        pageId={pageId}
                        place={active.extra?.mode === "floor-plan" ? "floor-plan-gate" : active.extra?.mode === "brochure" ? "brochure-gate" : "popup"}
                        projectName={projectName}
                        projectId={projectId}
                        unitId={unitId}
                        onSuccess={() => {
                          if (active.extra?.unlockKey) unlock(active.extra.unlockKey);
                          const url = downloadUrl;
                          if (url && typeof window !== "undefined") {
                            window.open(url, "_blank");
                          }
                          setShowSuccess(true);
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-text-3">Attach a Form Builder form to this popup.</p>
                  )}

                  {active.popup.buttonText ? (
                    <a href={active.popup.buttonUrl || downloadUrl || "#"} className="op-popup-cta">
                      {active.popup.buttonText}
                      <ArrowRight size={14} strokeWidth={2.5} />
                    </a>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </RuntimeContext.Provider>
  );
}
