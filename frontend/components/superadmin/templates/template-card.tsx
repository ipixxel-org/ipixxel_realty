"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Copy,
  ExternalLink,
  Eye,
  Layers,
  MoreVertical,
  PauseCircle,
  Pencil,
  Rocket,
  RotateCcw,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Reveal } from "@/components/superadmin/reveal";
import { StatusBadge, TemplateCover, TierBadge, manageHref, type TemplatePlan, type TemplateRow } from "./shared";

/* Modern Visual Card for Super Admin & Template Studio
 * Features 16:10 preview thumbnail, hover quick actions overlay,
 * tier badge, category pill, and crisp typography. */

export function TemplateCard({
  row,
  plans,
  delay,
  onEdit,
  onPreview,
  onDuplicate,
  onPublish,
  onUnpublish,
  onRemove,
  onQuickPreview,
  canManageSettings = true,
}: {
  row: TemplateRow;
  plans?: (TemplatePlan & { id?: string })[];
  delay?: number;
  /** Left out when the viewer can't edit: Edit / Open Builder are hidden and
   *  the title opens the preview instead. */
  onEdit?: () => void;
  onPreview: () => void;
  onDuplicate?: () => void;
  onPublish?: () => void;
  onUnpublish?: () => void;
  onRemove?: () => void;
  onQuickPreview?: () => void;
  canManageSettings?: boolean;
}) {
  const isPreset = row.kind === "preset";
  const published = row.status === "published";
  const showManageSettings = canManageSettings && Boolean(row.pageId || isPreset);
  const showPublishToggle = published ? Boolean(onUnpublish) : Boolean(onPublish);
  // Hide the ⋮ button when the viewer has none of its actions.
  const hasMenu = showManageSettings || Boolean(onDuplicate) || showPublishToggle || Boolean(onRemove);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hovered, setHovered] = useState(false);

  return (
    <Reveal delay={delay}>
      <div
        className="card template-visual-card"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setMenuOpen(false);
        }}
        style={{
          padding: 0,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          borderRadius: 18,
          overflow: "hidden",
          border: hovered ? "1px solid var(--brand-100, #c7d2fe)" : "1px solid var(--line-2)",
          boxShadow: hovered
            ? "0 14px 34px -10px rgba(21, 27, 46, 0.18), 0 4px 14px -4px rgba(14, 21, 37, 0.08)"
            : "0 2px 8px -2px rgba(14, 21, 37, 0.05)",
          transform: hovered ? "translateY(-4px)" : "none",
          transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          background: "var(--surface)",
          position: "relative",
        }}
      >
        {/* Cover Preview Container */}
        <div style={{ position: "relative", overflow: "hidden" }}>
          <TemplateCover thumbnail={row.thumbnail} accent={row.accent} height={188} radius="18px 18px 0 0">
            {/* Top Badges */}
            <div
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                zIndex: 2,
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              <TierBadge tier={row.tier} plans={plans} allowedPlanIds={row.allowedPlanIds ?? []} />
              <StatusBadge status={row.status} />
            </div>

            <div
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                zIndex: 2,
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              {row.category ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.02em",
                    background: "rgba(15, 20, 36, 0.72)",
                    color: "#ffffff",
                    padding: "3px 9px",
                    borderRadius: 999,
                    backdropFilter: "blur(6px)",
                    border: "1px solid rgba(255,255,255,0.15)",
                  }}
                >
                  {row.category}
                </span>
              ) : null}
            </div>

            {/* Quick Hover Action Overlay */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(180deg, rgba(15, 23, 42, 0.35) 0%, rgba(15, 23, 42, 0.88) 100%)",
                backdropFilter: "blur(3px)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                opacity: hovered ? 1 : 0,
                pointerEvents: hovered ? "auto" : "none",
                transition: "opacity 0.22s ease-in-out",
                zIndex: 4,
                padding: 16,
              }}
            >
              {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                style={{
                  width: "100%",
                  maxWidth: 180,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  background: "var(--brand, #0f1424)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 10,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 6px 18px rgba(21, 27, 46, 0.4)",
                  transition: "transform 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.02)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
              >
                <Pencil size={14} /> Open Builder
              </button>
              ) : null}

              <button
                type="button"
                onClick={onQuickPreview || onPreview}
                style={{
                  width: "100%",
                  maxWidth: 180,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  background: "rgba(255, 255, 255, 0.18)",
                  color: "#ffffff",
                  border: "1px solid rgba(255, 255, 255, 0.35)",
                  borderRadius: 10,
                  padding: "8px 16px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  backdropFilter: "blur(8px)",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.28)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.18)")}
              >
                <Eye size={14} /> Quick Preview
              </button>
            </div>
          </TemplateCover>
        </div>

        {/* Card Body */}
        <div
          className="card-b"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "16px 18px 16px",
          }}
        >
          {/* Title & Source Row */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <button
                type="button"
                onClick={onEdit ?? onQuickPreview ?? onPreview}
                style={{
                  border: "none",
                  background: "transparent",
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 15.5,
                    color: "var(--ink)",
                    lineHeight: 1.3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={row.name}
                >
                  {row.name}
                </div>
              </button>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--muted)",
                  marginTop: 4,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  lineHeight: 1.45,
                  minHeight: 36,
                }}
              >
                {row.description}
              </div>
            </div>
          </div>

          {/* Metadata Row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              marginTop: 12,
              paddingTop: 10,
              borderTop: "1px solid var(--line)",
              fontSize: 11.5,
              color: "var(--muted)",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: "var(--surface-2, #f8fafc)",
                padding: "3px 8px",
                borderRadius: 6,
                border: "1px solid var(--line-2)",
                fontWeight: 600,
              }}
            >
              <Layers size={11} /> {row.source}
            </span>

            <span
              style={{
                fontFamily: "var(--font-mono), ui-monospace, monospace",
                color: "var(--faint)",
                fontSize: 11,
              }}
            >
              {isPreset ? "System Preset" : "Custom"}
            </span>
          </div>

          {/* Action Bar Footer */}
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 14,
              alignItems: "center",
              position: "relative",
            }}
          >
            {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="btn btn-soft btn-sm"
              style={{
                flex: 1,
                justifyContent: "center",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 600,
                borderRadius: 9,
              }}
            >
              <Pencil size={13} /> Edit
            </button>
            ) : null}

            <button
              type="button"
              onClick={onQuickPreview || onPreview}
              className="btn btn-ghost btn-sm"
              style={{
                flex: 1,
                justifyContent: "center",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontWeight: 600,
                borderRadius: 9,
              }}
            >
              <Eye size={13} /> Preview
            </button>

            {/* Kebab More Menu */}
            {hasMenu ? (
            <div style={{ position: "relative" }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setMenuOpen(!menuOpen)}
                title="More actions"
                style={{
                  padding: "6px 8px",
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: 8,
                }}
              >
                <MoreVertical size={14} />
              </button>

              {menuOpen && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    right: 0,
                    marginBottom: 6,
                    background: "var(--surface)",
                    border: "1px solid var(--line-2)",
                    borderRadius: 12,
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15)",
                    zIndex: 50,
                    minWidth: 160,
                    padding: 4,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  {showManageSettings ? (
                    <Link
                      href={manageHref(row.pageId || row.key)}
                      className="btn btn-ghost btn-sm"
                      style={{ justifyContent: "flex-start", gap: 8, fontSize: 12 }}
                      onClick={() => setMenuOpen(false)}
                    >
                      <Settings2 size={13} /> Manage Settings
                    </Link>
                  ) : null}

                  {onDuplicate ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setMenuOpen(false);
                        onDuplicate();
                      }}
                      style={{ justifyContent: "flex-start", gap: 8, fontSize: 12 }}
                    >
                      <Copy size={13} /> Duplicate
                    </button>
                  ) : null}

                  {published ? (
                    onUnpublish ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setMenuOpen(false);
                          onUnpublish();
                        }}
                        style={{ justifyContent: "flex-start", gap: 8, fontSize: 12 }}
                      >
                        <PauseCircle size={13} /> Unpublish
                      </button>
                    ) : null
                  ) : onPublish ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setMenuOpen(false);
                        onPublish();
                      }}
                      style={{ justifyContent: "flex-start", gap: 8, fontSize: 12, color: "var(--green)" }}
                    >
                      <Rocket size={13} /> Publish
                    </button>
                  ) : null}

                  {onRemove ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setMenuOpen(false);
                        onRemove();
                      }}
                      style={{
                        justifyContent: "flex-start",
                        gap: 8,
                        fontSize: 12,
                        color: isPreset ? "var(--amber)" : "var(--rose)",
                      }}
                    >
                      {isPreset ? <RotateCcw size={13} /> : <Trash2 size={13} />}
                      {isPreset ? "Reset to Preset" : "Delete Template"}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
            ) : null}
          </div>
        </div>
      </div>
    </Reveal>
  );
}
