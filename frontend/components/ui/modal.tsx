"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

const FOOTER_STYLE: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  padding: "16px 24px",
  borderTop: "1px solid #f1f5f9",
  flexShrink: 0,
};

export function ModalActions({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...FOOTER_STYLE, ...style }}>{children}</div>;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = "md",
  containerClassName,
  footer,
  headerActions,
  flush,
  closeDisabled,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  containerClassName?: string;
  footer?: ReactNode;
  headerActions?: ReactNode;
  flush?: boolean;
  closeDisabled?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, closeDisabled]);

  if (!open || typeof document === "undefined") return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-[1180px]",
  };

  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const scopeClass = pathname.startsWith("/admin-console")
    ? "superadmin"
    : pathname.startsWith("/org")
      ? "org"
      : "superadmin org";

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 flex items-center justify-center p-4",
        containerClassName,
      )}
      // Above the sticky console topbars (z-index 100) so a popup is never
      // cut off under the header; below dropdown menus (400) and toasts.
      style={{ background: "transparent", zIndex: 200 }}
    >
      <div
        className="absolute inset-0 modal-backdrop"
        style={{
          background: "rgba(15, 23, 42, 0.5)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
        onClick={() => {
          if (!closeDisabled) onClose();
        }}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex max-h-[90vh] w-full flex-col rounded-2xl bg-white shadow-2xl text-slate-900 modal-panel",
          sizes[size],
          scopeClass,
        )}
        style={{
          background: "#ffffff",
          color: "#0f172a",
          minHeight: "auto",
          border: "1px solid rgba(226, 232, 240, 0.8)",
          boxShadow:
            "0 25px 60px -12px rgba(15, 23, 42, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.5)",
        }}
      >
        <div
          style={{
            height: 3,
            borderRadius: "16px 16px 0 0",
            background: "linear-gradient(90deg, #0f1424, #6366f1, #0ea5e9)",
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
          }}
        />

        <div
          className="flex items-start justify-between gap-4 p-6 pb-4"
          style={{ borderBottom: "1px solid #f1f5f9" }}
        >
          <div style={{ paddingTop: 4, minWidth: 0 }}>
            <h2
              className="text-base font-semibold"
              style={{
                color: "#0f172a",
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h2>
            {description ? (
              <p
                className="mt-1"
                style={{
                  color: "#64748b",
                  fontSize: 13,
                  lineHeight: 1.5,
                  marginTop: 4,
                }}
              >
                {description}
              </p>
            ) : null}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              disabled={closeDisabled}
              className="modal-close-btn"
              aria-label="Close"
              style={{
                borderRadius: 10,
                padding: 8,
                color: "#94a3b8",
                transition: "all 0.15s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "transparent",
                border: "none",
                cursor: closeDisabled ? "not-allowed" : "pointer",
                opacity: closeDisabled ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (closeDisabled) return;
                e.currentTarget.style.background = "#f1f5f9";
                e.currentTarget.style.color = "#475569";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#94a3b8";
              }}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>

        <div
          className="no-scrollbar overflow-y-auto"
          style={{ padding: flush ? 0 : "16px 24px 24px", flex: "1 1 auto", minHeight: 0 }}
        >
          {children}
        </div>

        {footer ? <ModalActions>{footer}</ModalActions> : null}
      </div>

      <style>{`
        .modal-backdrop {
          animation: modalFadeIn 0.2s ease-out;
        }
        .modal-panel {
          animation: modalSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>,
    document.body,
  );
}
