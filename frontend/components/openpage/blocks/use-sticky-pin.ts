"use client";

import { useEffect, useState, type RefObject } from "react";

export type StickyPin = {
  /** Body-level fixed holder the block is drawn into while pinned, else null. */
  host: HTMLElement | null;
  /** Height (incl. vertical margins) the block leaves behind while pinned. */
  height: number;
};

const NOT_PINNED: StickyPin = { host: null, height: 0 };

/**
 * "Sticky" from the Style tab, made to stick to the page without jitter.
 *
 * Plain CSS `position: sticky` only moves inside the element's parent. In the
 * builder every block sits in its own drag/select wrapper, and on the live
 * page a Div usually sits inside a Section, so CSS sticky on the block itself
 * has no room to move.
 *
 * Only the block it is set on ever sticks (a Div, an Icon, a Button…).
 *
 * 1. Native: a block placed directly on the page gets CSS sticky on its own
 *    slot, whose parent is the whole page.
 * 2. Pinned: a block inside another block (an Icon in a Div, a Div in a tall
 *    hero Section), once it reaches the top, is drawn into a body-level
 *    `position: fixed` holder at the top of the window / builder canvas, and
 *    an empty box of the same height keeps its place. A body-level holder is needed because the
 *    page root is a CSS container, which traps `position: fixed` inside it.
 *    Fixed elements never trail the scroll, so nothing shakes.
 *
 * `slotRef` must point at whichever element is in the page flow: the block
 * while not pinned, the empty box while pinned.
 */
export function useStickyPin(slotRef: RefObject<HTMLElement | null>, enabled: boolean, top: string | undefined): StickyPin {
  const [pin, setPin] = useState<StickyPin>(NOT_PINNED);

  useEffect(() => {
    const first = slotRef.current;
    if (!enabled || !first) return;
    const gap = stickyTopPx(top);

    const native = stickyHost(first);
    if (native) {
      const prev = { position: native.style.position, top: native.style.top, zIndex: native.style.zIndex };
      native.style.position = "sticky";
      native.style.top = `${gap}px`;
      native.style.zIndex = first.style.zIndex || "40";
      return () => {
        native.style.position = prev.position;
        native.style.top = prev.top;
        native.style.zIndex = prev.zIndex;
      };
    }

    const scroller = scrollParentOf(first);
    const zIndex = first.style.zIndex || "40";
    let holder: HTMLDivElement | null = null;
    let marginTop = 0;
    let frame = 0;

    const place = (slotRect: DOMRect, edge: number) => {
      if (!holder) return;
      holder.style.top = `${edge - marginTop}px`;
      holder.style.left = `${slotRect.left}px`;
      holder.style.width = `${slotRect.width}px`;
    };

    const update = () => {
      frame = 0;
      const slot = slotRef.current;
      if (!slot) return;
      const edge = (scroller ? scroller.getBoundingClientRect().top : 0) + gap;
      const rect = slot.getBoundingClientRect();
      const shouldPin = rect.top < edge;
      if (shouldPin && !holder) {
        const cs = getComputedStyle(slot);
        marginTop = parseFloat(cs.marginTop) || 0;
        const height = rect.height + marginTop + (parseFloat(cs.marginBottom) || 0);
        holder = createHolder(slot, zIndex);
        place(rect, edge);
        setPin({ host: holder, height });
      } else if (!shouldPin && holder) {
        const old = holder;
        holder = null;
        setPin(NOT_PINNED);
        // After React has moved the block back into the page.
        requestAnimationFrame(() => old.remove());
      } else {
        place(rect, edge);
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      const old = holder;
      holder = null;
      setPin(NOT_PINNED);
      if (old) requestAnimationFrame(() => old.remove());
    };
  }, [slotRef, enabled, top]);

  return enabled ? pin : NOT_PINNED;
}

/**
 * Body-level fixed holder that carries the page's theme (CSS variables,
 * brand data attributes, font, text colour) and is a CSS container, so the
 * block looks the same as in the page.
 */
function createHolder(slot: HTMLElement, zIndex: string): HTMLDivElement {
  const holder = document.createElement("div");
  const root = slot.closest<HTMLElement>("[data-op-page-root]");
  if (root) {
    holder.style.cssText = root.style.cssText;
    for (const a of Array.from(root.attributes)) {
      if (a.name.startsWith("data-") && a.name !== "data-op-page-root") holder.setAttribute(a.name, a.value);
    }
    if (root.classList.contains("op-site")) holder.classList.add("op-site");
    const cs = getComputedStyle(root);
    holder.style.color = cs.color;
    holder.style.fontFamily = cs.fontFamily;
  }
  Object.assign(holder.style, {
    position: "fixed",
    maxWidth: "none",
    height: "auto",
    minHeight: "0",
    margin: "0",
    padding: "0",
    border: "0",
    borderRadius: "0",
    boxShadow: "none",
    background: "transparent",
    zIndex,
    containerType: "inline-size",
  });
  holder.setAttribute("data-op-sticky-holder", "");
  ensureHolderCss();
  document.body.appendChild(holder);
  return holder;
}

const HOLDER_CSS_ID = "op-sticky-holder-css";

/**
 * The holder spans the block's full row while e.g. a sticky Icon covers a
 * small part of it: the see-through rest lets clicks reach the page below.
 */
function ensureHolderCss() {
  if (document.getElementById(HOLDER_CSS_ID)) return;
  const tag = document.createElement("style");
  tag.id = HOLDER_CSS_ID;
  tag.textContent =
    "[data-op-sticky-holder], [data-op-sticky-holder] * { pointer-events: none }" +
    " [data-op-sticky-holder] :is(a, button, input, select, textarea, label, summary, img, svg, video, iframe, [role=button], [tabindex], [data-el-id]) { pointer-events: auto }";
  document.head.appendChild(tag);
}

/**
 * For a block placed directly on the page (not inside a Section / Div): the
 * box directly inside the page root (`[data-op-page-root]`: the live page or
 * the builder canvas) that holds it. That box is only the block's own slot
 * (plus builder chrome such as drop zones), so CSS sticky on it moves just
 * this block. Null for a block inside another block (an Icon in a Div, a Div
 * in a hero…): only that block may stick, so it is pinned instead.
 */
export function stickyHost(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement = el;
  for (;;) {
    const parent = node.parentElement;
    if (!parent || parent === document.body) return null;
    if (parent.hasAttribute("data-op-page-root")) return node;
    // Inside another block: sticking any box above would move that block too.
    if (parent.closest("[data-block-id]")) return null;
    // A scroll area in between would trap CSS sticky.
    if (/(auto|scroll|overlay|hidden|clip)/.test(getComputedStyle(parent).overflowY)) return null;
    node = parent;
  }
}

/** `Top` from the inspector as px. Empty / auto / unknown units = 0. */
export function stickyTopPx(v: string | undefined): number {
  const s = (v ?? "").trim().toLowerCase();
  const m = /^(-?\d+(?:\.\d+)?)(px|rem|em)?$/.exec(s);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2] === "rem" || m[2] === "em" ? n * 16 : n;
}

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}
