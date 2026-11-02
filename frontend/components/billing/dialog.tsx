"use client";

import type { ReactNode } from "react";
import { Modal, ModalActions } from "@/components/ui/modal";
import { useBillingEnv } from "./context";

/**
 * A billing dialog. In the app it's the shared `Modal`; inside a walkthrough
 * frame (`inlineDialogs`) it draws over the frame only, so the step's title
 * and caption stay visible.
 */
export function BillingDialog({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  size = "sm",
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** false: must be answered — no close button, Escape and clicking outside do nothing. */
  dismissible?: boolean;
}) {
  const { inlineDialogs } = useBillingEnv();
  if (!open) return null;
  if (!inlineDialogs) {
    return (
      <Modal open onClose={onClose} title={title} description={description} size={size} footer={footer} closeDisabled={!dismissible} hideClose={!dismissible}>
        {children}
      </Modal>
    );
  }
  return (
    <div className="bl-inline-backdrop">
      <div className="bl-inline-dialog" role="dialog" aria-modal="true" aria-label={title}>
        <div className="bl-inline-dialog-h">
          <div>
            <b>{title}</b>
            {description ? <div className="bl-muted" style={{ marginTop: 4 }}>{description}</div> : null}
          </div>
          {dismissible ? (
            <button type="button" className="bl-inline-x" aria-label="Close" onClick={onClose}>
              ×
            </button>
          ) : null}
        </div>
        {children ? <div className="bl-inline-dialog-b">{children}</div> : null}
        {footer}
      </div>
    </div>
  );
}

export { ModalActions as DialogActions };
