"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Compass, X } from "lucide-react";

const STORAGE_KEY = "op.tour.v1";

interface TourStep {
  /** Element to spotlight; falls back to a centered card when not found. */
  selector: string;
  title: string;
  body: string;
  kbd?: string;
}

const STEPS: TourStep[] = [
  {
    selector: '[data-tour="left-panel"]',
    title: "Your toolbox lives on the left",
    body: "Browse ready-made section templates, drag blocks onto the canvas, reuse global widgets, reorder the page in Layers, and build the forms used on this page — all from this rail.",
  },
  {
    selector: '[data-tour="canvas"], [aria-label^="Site preview"]',
    title: "This is your canvas",
    body: "Click any section to select it, drag to reorder, and double-click text to edit it inline. Use the toolbar above to switch between desktop, tablet and mobile.",
    kbd: "P — preview",
  },
  {
    selector: '[data-tour="inspector"]',
    title: "Edit everything in the inspector",
    body: "The right panel has five tabs: Content, Style, Type, Element and Advanced. Select a block or even a single element inside it to fine-tune it here.",
    kbd: "1–4 — switch tabs",
  },
  {
    selector: "header.ps-topnav",
    title: "Save, preview and publish from here",
    body: "Your work auto-saves as you edit. Use Save for a manual save, Preview to see the real page, and Publish to push it live — Unpublish takes it back down.",
    kbd: "Ctrl+S — save",
  },
  {
    selector: "#op-spotlight-trigger",
    title: "One palette to run it all",
    body: "Press Ctrl+K to open the command center: insert widgets, jump between pages, open any panel, switch viewports or run actions — without hunting through menus.",
    kbd: "Ctrl+K",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingTour() {
  const [step, setStep] = useState(0);
  const [active, setActive] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);

  const start = useCallback(() => {
    setStep(0);
    setActive(true);
  }, []);

  const finish = useCallback((completed: boolean) => {
    setActive(false);
    setRect(null);
    try {
      localStorage.setItem(STORAGE_KEY, completed ? "done" : "skipped");
    } catch {
      // storage unavailable — tour simply shows again next time
    }
  }, []);

  // Auto-start the first time the builder is opened.
  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = localStorage.getItem(STORAGE_KEY);
    } catch {
      seen = "done";
    }
    if (seen) return;
    const t = setTimeout(start, 700);
    return () => clearTimeout(t);
  }, [start]);

  // Help center / command palette can restart the tour at any time.
  useEffect(() => {
    const onTour = () => start();
    window.addEventListener("op:tour", onTour);
    return () => window.removeEventListener("op:tour", onTour);
  }, [start]);

  // Measure the highlighted element, keeping up with resize.
  useLayoutEffect(() => {
    if (!active) return;
    const measure = () => {
      const target = STEPS[step] ? document.querySelector(STEPS[step].selector) : null;
      if (!target) {
        setRect(null);
        return;
      }
      const r = target.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) {
        setRect(null);
        return;
      }
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener("resize", measure);
    const t = setTimeout(measure, 120); // wait a frame for panel transitions
    return () => {
      window.removeEventListener("resize", measure);
      clearTimeout(t);
    };
  }, [active, step]);

  // Escape skips, arrow keys move between steps.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        if (step >= STEPS.length - 1) finish(true);
        else setStep((s) => s + 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStep((s) => Math.max(0, s - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, step, finish]);

  if (!active) return null;

  const current = STEPS[step];
  const isLast = step >= STEPS.length - 1;

  // Position the card next to the spotlight, or centered when there's no target.
  const cardStyle: React.CSSProperties = rect
    ? (() => {
        const CARD_W = 340;
        const gap = 14;
        const spaceRight = window.innerWidth - (rect.left + rect.width);
        let left = spaceRight > CARD_W + gap + 24 ? rect.left + rect.width + gap : rect.left;
        left = Math.min(Math.max(12, left), window.innerWidth - CARD_W - 12);
        const below = rect.top + rect.height + gap;
        const top = below + 190 < window.innerHeight ? below : Math.max(12, rect.top - gap - 190);
        return { position: "fixed", top, left, width: CARD_W, zIndex: 1200 } as React.CSSProperties;
      })()
    : { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 360, zIndex: 1200 };

  return (
    <div className="fixed inset-0" style={{ zIndex: 1100 }} aria-live="polite" onClick={() => finish(false)}>
      {/* Dim everything outside the spotlight. Clicking anywhere but the card skips. */}
      <div
        className="absolute inset-0"
        style={
          rect
            ? {
                boxShadow: `0 0 0 9999px rgba(0,0,0,.62)`,
                outline: "2px solid rgba(52,211,153,.9)",
                position: "fixed",
                top: rect.top - 4,
                left: rect.left - 4,
                width: rect.width + 8,
                height: rect.height + 8,
                borderRadius: 12,
                pointerEvents: "none",
                transition: "all .25s ease",
              }
            : { background: "rgba(0,0,0,.62)" }
        }
      />

      {/* Card */}
      <div
        className="bg-bg-1 border border-border-default rounded-xl shadow-2xl overflow-hidden"
        style={cardStyle}
        role="dialog"
        aria-label={`Tour: ${current.title}`}
      >
        <div className="px-4 pt-3.5 pb-3 border-b border-border-subtle flex items-start gap-3">
          <span className="w-8 h-8 rounded-lg bg-green-glow text-green flex items-center justify-center shrink-0">
            <Compass size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-text-0 leading-snug">{current.title}</div>
            <div className="text-[10px] text-text-3 mt-0.5">
              Step {step + 1} of {STEPS.length}
            </div>
          </div>
          <button
            type="button"
            onClick={() => finish(false)}
            className="p-1 rounded text-text-3 hover:text-text-0 hover:bg-bg-3 transition-colors"
            title="Skip tour"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-3">
          <p className="text-[12.5px] text-text-2 leading-relaxed">{current.body}</p>
          {current.kbd ? (
            <kbd className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded bg-bg-3 border border-border-subtle text-text-2 font-mono">
              {current.kbd}
            </kbd>
          ) : null}
        </div>

        {/* Progress dots + actions */}
        <div className="px-4 py-3 border-t border-border-subtle flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`rounded-full transition-all ${i === step ? "w-4 h-1.5 bg-green" : "w-1.5 h-1.5 bg-bg-3"}`}
              />
            ))}
          </div>
          <div className="flex-1" />
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold text-text-2 hover:text-text-0 hover:bg-bg-3 transition-colors"
            >
              <ArrowLeft size={13} /> Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (isLast ? finish(true) : setStep((s) => s + 1))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green text-bg-0 text-[11.5px] font-bold hover:bg-green/90 transition-colors"
          >
            {isLast ? (
              <>
                <Check size={13} /> Get started
              </>
            ) : (
              <>
                Next <ArrowRight size={13} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
