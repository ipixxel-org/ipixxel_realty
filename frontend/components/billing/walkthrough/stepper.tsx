"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { createMockBillingClient } from "@/lib/billing/mock/client";
import type { MockState } from "@/lib/billing/mock/state";
import { BillingEnvProvider, OrgBillingProvider, type BillingRoute } from "../context";
import { BillingAccessProvider } from "../locked";

export interface WalkStep {
  title: string;
  caption: string;
  behind?: string;
  render: () => ReactNode;
}

/* ------------------------------------------------------------ Navigation */

const StepNavContext = createContext<{ goTo: (index: number) => void; routes: Partial<Record<BillingRoute, number>> }>({ goTo: () => undefined, routes: {} });

/* ----------------------------------------------------------------- Sandbox */

/**
 * The real billing components, fed by a private in-memory copy of the mock
 * data in a given situation. Dialogs draw inside the frame; links move the
 * walkthrough instead of leaving it.
 */
export function Sandbox({ initial, stay = false, children }: { initial: Partial<MockState>; /** Links never jump to another step. */ stay?: boolean; children: ReactNode }) {
  // One client per mount — each visit to a step starts fresh.
  const [client] = useState(() => createMockBillingClient({ initial }));
  const [overview] = useState(() => client.overviewNow());
  const { goTo, routes } = useContext(StepNavContext);
  const onNavigate = useCallback(
    (to: BillingRoute) => {
      const target = stay ? undefined : routes[to];
      if (target != null) goTo(target);
      return true; // never leave the walkthrough
    },
    [goTo, routes, stay],
  );
  return (
    <BillingEnvProvider client={client} inlineDialogs canEdit onNavigate={onNavigate}>
      <OrgBillingProvider initial={overview}>
        <BillingAccessProvider>{children}</BillingAccessProvider>
      </OrgBillingProvider>
    </BillingEnvProvider>
  );
}

/* ------------------------------------------------------------------- Frame */

/** Looks like the app: a browser bar with the page address, and the console's page background. */
export function AppFrame({ url, label, children, minHeight = 260 }: { url: string; label?: string; children: ReactNode; minHeight?: number }) {
  return (
    <div className="bw-frame-wrap">
      {label ? <div className="bw-frame-label">{label}</div> : null}
      <div className="bw-frame">
        <div className="bw-frame-bar" aria-hidden="true">
          <span className="bw-dots">
            <i />
            <i />
            <i />
          </span>
          <span className="bw-url">app.ipixxel.in{url}</span>
        </div>
        <div className="bw-frame-body" style={{ minHeight }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function PreviewTag() {
  return <span className="bl-tag">Preview</span>;
}

/* ----------------------------------------------------------------- Stepper */

function isTyping(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable;
}

function StepperInner({ heading, steps, routes }: { heading: string; steps: WalkStep[]; routes: Partial<Record<BillingRoute, number>> }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fromUrl = Math.min(steps.length, Math.max(1, Number(params.get("step")) || 1)) - 1;
  const [index, setIndex] = useState(fromUrl);

  const goTo = useCallback(
    (i: number) => {
      const next = Math.min(steps.length - 1, Math.max(0, i));
      setIndex(next);
      router.replace(`${pathname}?step=${next + 1}`, { scroll: false });
    },
    [steps.length, router, pathname],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(document.activeElement) || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight") goTo(index + 1);
      else if (e.key === "ArrowLeft") goTo(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index]);

  const step = steps[index];
  const nav = useMemo(() => ({ goTo, routes }), [goTo, routes]);

  return (
    <div className="bw-stage">
      <header className="bw-head">
        <div className="bw-head-title">
          <b>{heading}</b>
          <PreviewTag />
        </div>
        <span className="bw-count" aria-live="polite">
          Step {index + 1} of {steps.length}
        </span>
      </header>
      <div className="bw-progress" aria-hidden="true">
        <span style={{ width: `${((index + 1) / steps.length) * 100}%` }} />
      </div>
      <main className="bw-main">
        <h1 className="bw-title">{step.title}</h1>
        <p className="bw-caption">{step.caption}</p>
        {step.behind ? (
          <p className="bw-behind">
            <Icon name="info" size={14} /> <b>Behind the scenes:</b> {step.behind}
          </p>
        ) : null}
        <StepNavContext.Provider value={nav}>
          <div className="bw-content" key={index}>
            {step.render()}
          </div>
        </StepNavContext.Provider>
      </main>
      <footer className="bw-foot">
        <button type="button" className="btn btn-ghost" onClick={() => goTo(index - 1)} disabled={index === 0}>
          <Icon name="chevron-left" size={15} /> Back
        </button>
        <span className="bw-hint">Use ← → to move between steps</span>
        <button type="button" className="btn btn-primary" onClick={() => goTo(index + 1)} disabled={index === steps.length - 1}>
          Next <Icon name="chevron-right" size={15} />
        </button>
      </footer>
    </div>
  );
}

export { StepperInner as Stepper };
