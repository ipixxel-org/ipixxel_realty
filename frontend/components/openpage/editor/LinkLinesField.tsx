"use client";

import { useState } from "react";
import { parseLinkLines, serializeLinkLines, type LinkLine } from "@/lib/openpage/link-lines";

/**
 * Footer link list editor (Label / URL / Link target per row), styled like the
 * header's menu-items editor. Reads and writes the "Label | URL" text format,
 * so existing footers keep working unchanged.
 */
export function LinkLinesField({
  label,
  value,
  onChange,
  allowHeadings = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  /** Offer "+ Add sub-heading" rows (link columns). */
  allowHeadings?: boolean;
}) {
  // Local list so half-filled rows (e.g. a just-added empty item) don't vanish.
  // If the saved value changed from outside (undo, AI rewrite), it wins.
  const [draft, setItems] = useState<LinkLine[]>(() => parseLinkLines(value));
  const items = serializeLinkLines(draft) === value ? draft : parseLinkLines(value);

  function commit(next: LinkLine[]) {
    setItems(next);
    const s = serializeLinkLines(next);
    if (s !== value) onChange(s);
  }
  function patch(i: number, p: Partial<LinkLine>) {
    commit(items.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  }

  const input = "w-full px-1.5 py-1 rounded border border-border-subtle bg-bg-3 text-text-0 text-[11px] outline-none focus:border-green";
  const small = "text-[10px] text-text-3 hover:text-text-0 transition-colors disabled:opacity-30";

  return (
    <div className="mb-2.5">
      {label ? <label className="block text-[11.5px] text-text-2 mb-1 font-medium">{label}</label> : null}
      <p className="text-[10px] text-text-3 mb-2 leading-relaxed">
        Link to a section with <code className="text-green">#section-id</code> (match the Section ID field on that
        section), to a page with <code className="text-green">https://…</code> or <code className="text-green">/page</code>,
        or use <code className="text-green">tel:</code> / <code className="text-green">mailto:</code>. Leave the URL empty
        to show plain text.
      </p>
      {items.map((item, i) => (
        <div
          key={i}
          className={`border border-l-[3px] rounded p-2 mb-1.5 space-y-1.5 ${
            item.heading
              ? "bg-amber-500/[0.06] border-amber-500/30 border-l-amber-500"
              : "bg-bg-2 border-border-default border-l-sky-500"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[10px] font-semibold ${item.heading ? "text-amber-600" : "text-sky-600"}`}>
              {item.heading ? "Sub-heading" : "Link"} {i + 1}
            </span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={small} title="Move up">
                ↑
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className={small} title="Move down">
                ↓
              </button>
              <button
                type="button"
                onClick={() => commit(items.filter((_, idx) => idx !== i))}
                className="text-[10px] text-text-3 hover:text-status-red transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-text-3 mb-0.5">{item.heading ? "Heading text" : "Label"}</label>
            <input
              type="text"
              value={item.label}
              placeholder={item.heading ? "e.g. About Us" : "e.g. Amenities"}
              onChange={(e) => patch(i, { label: e.target.value })}
              className={input}
            />
          </div>
          {item.heading ? null : (
            <>
              <div>
                <label className="block text-[10px] text-text-3 mb-0.5">URL</label>
                <input
                  type="text"
                  value={item.href}
                  placeholder="https://… or #section-id"
                  onChange={(e) => patch(i, { href: e.target.value })}
                  className={input}
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-3 mb-0.5">Link target</label>
                <select
                  value={item.target}
                  onChange={(e) => patch(i, { target: e.target.value as LinkLine["target"] })}
                  className={`${input} cursor-pointer`}
                >
                  <option value="auto">Auto (https:// links open in a new tab)</option>
                  <option value="_self">Same tab</option>
                  <option value="_blank">New tab</option>
                </select>
              </div>
            </>
          )}
        </div>
      ))}
      <div className="flex items-center gap-3 mt-0.5">
        <button
          type="button"
          onClick={() => commit([...items, { heading: false, label: "", href: "", target: "auto" }])}
          className="text-[10px] text-sky-600 hover:text-sky-500 transition-colors"
        >
          + Add link
        </button>
        {allowHeadings ? (
          <button
            type="button"
            onClick={() => commit([...items, { heading: true, label: "", href: "", target: "auto" }])}
            className="text-[10px] text-amber-600 hover:text-amber-500 transition-colors"
          >
            + Add sub-heading
          </button>
        ) : null}
      </div>
    </div>
  );
}
