"use client";

import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@/components/icons";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info" | "warning" | "destructive";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (t: {
    title: string;
    description?: string;
    variant?: ToastVariant;
  }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantStyles: Record<ToastVariant, { icon: IconName; ring: string; iconColor: string }> = {
  success: { icon: "check", ring: "ring-emerald-200 dark:ring-emerald-500/30", iconColor: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400" },
  error: { icon: "alert", ring: "ring-red-200 dark:ring-red-500/30", iconColor: "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400" },
  destructive: { icon: "alert", ring: "ring-red-200 dark:ring-red-500/30", iconColor: "bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400" },
  info: { icon: "bell", ring: "ring-sky-200 dark:ring-sky-500/30", iconColor: "bg-sky-100 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400" },
  warning: { icon: "alert", ring: "ring-amber-200 dark:ring-amber-500/30", iconColor: "bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400" },
};

const emptySubscribe = () => () => {};

function useHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const mounted = useHydrated();

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastContextValue["toast"]>(
    ({ title, description, variant = "success" }) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, title, description, variant }]);
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} mounted={mounted} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
  mounted,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  mounted: boolean;
}) {
  if (!mounted) return null;
  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-[700] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const styles = variantStyles[t.variant];
        return (
          <div
            key={t.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg ring-4 dark:border-slate-700 dark:bg-slate-900",
              styles.ring,
            )}
          >
            <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", styles.iconColor)}>
              <Icon name={styles.icon} size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.title}</p>
              {t.description ? (
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              className="rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label="Dismiss"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}