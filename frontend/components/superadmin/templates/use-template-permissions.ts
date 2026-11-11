"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * The Templates pills a Platform Team member has (Platform Team > Roles >
 * Templates row). Super Admin always has every one. Each action also needs
 * View, so a pill left on without View never shows a button.
 *
 * Keep in step with the backend's SuperAdminGuard template rules and the
 * admin_templates pills in roles-panel.tsx.
 */
export type TemplatePermissions = {
  view: boolean;
  create: boolean;
  edit: boolean;
  manageSettings: boolean;
  duplicate: boolean;
  publish: boolean;
  resetToPreset: boolean;
  delete: boolean;
  categories: boolean;
};

export function useTemplatePermissions(): TemplatePermissions {
  const { hasPermission } = useAuth();
  return useMemo(() => {
    const view = hasPermission("admin_templates", "view");
    return {
      view,
      create: view && hasPermission("admin_templates", "add"),
      edit: view && hasPermission("admin_templates", "edit"),
      manageSettings: view && hasPermission("admin_templates_settings", "edit"),
      duplicate: view && hasPermission("admin_templates_duplicate", "add"),
      publish: view && hasPermission("admin_templates", "approve"),
      resetToPreset: view && hasPermission("admin_templates_reset", "edit"),
      delete: view && hasPermission("admin_templates", "delete"),
      categories: view && hasPermission("admin_templates_categories", "edit"),
    };
  }, [hasPermission]);
}
