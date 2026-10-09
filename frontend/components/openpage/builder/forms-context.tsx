"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { listForms, type FormScope } from "@/lib/api";
import { formDefsFromRecords, type BackedForm } from "@/lib/openpage/forms-backend";
import { saveFormLibrary } from "@/lib/openpage/forms-store";

/** The forms listed under Lead Forms for the current builder session — the
 *  org's own for an org landing page, the Super Admin's for a template. `null`
 *  while loading. */
const BuilderLeadFormsContext = createContext<BackedForm[] | null>(null);

export function BuilderFormScopeProvider({
  scope,
  children,
}: {
  scope: FormScope;
  children: ReactNode;
}) {
  const [forms, setForms] = useState<BackedForm[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      listForms(scope)
        .then((records) => {
          if (cancelled) return;
          const defs = formDefsFromRecords(records);
          // Keep the render-path cache in sync with what the pickers show.
          saveFormLibrary(defs);
          setForms(defs);
        })
        .catch(() => {
          if (!cancelled) setForms((prev) => prev ?? []);
        });
    };
    load();
    // Pick up forms created/deleted under Lead Forms in another tab.
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, [scope]);

  return (
    <BuilderLeadFormsContext.Provider value={forms}>
      {children}
    </BuilderLeadFormsContext.Provider>
  );
}

/** Lead Forms from the backend (the source of truth) rather than the
 *  localStorage cache, which can hold the other scope's or deleted forms. */
export function useBuilderLeadForms(): BackedForm[] | null {
  return useContext(BuilderLeadFormsContext);
}
