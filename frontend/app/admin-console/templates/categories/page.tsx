"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Edit2, Plus, Trash2 } from "lucide-react";
import { buildTemplateRows } from "@/components/superadmin/templates/shared";
import {
  createTemplateCategory,
  deleteTemplateCategory,
  ensurePresetTemplates,
  loadTemplateCategories,
  loadTemplates,
  updateTemplateCategory,
  type TemplateCategory,
} from "@/lib/openpage/persist";
import type { LandingPageData } from "@/lib/openpage/types";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  Field,
  FormActions,
  FormAlert,
  FormModal,
  FormPage,
  FormSection,
  TextInput,
  formPageStyles,
} from "@/components/forms/form-page";

// Manage template categories — list page; add / rename open a short popup.
// Same add / edit / delete calls; counts come from the same template rows
// the gallery uses.

const TEMPLATES_PATH = "/admin-console/templates";

export default function TemplateCategoriesPage() {
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [pages, setPages] = useState<LandingPageData[]>([]);
  const [catName, setCatName] = useState("");
  const [editingCat, setEditingCat] = useState<TemplateCategory | null>(null);
  const [catError, setCatError] = useState<string | null>(null);
  const [catBusy, setCatBusy] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<TemplateCategory | null>(null);
  const [categoryDeleteBusy, setCategoryDeleteBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const notify = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const reloadCategories = useCallback(() => {
    loadTemplateCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    reloadCategories();
    // Same source the gallery uses for its per-category counts.
    ensurePresetTemplates()
      .then(setPages)
      .catch(() =>
        loadTemplates()
          .then(setPages)
          .catch(() => setPages([])),
      );
  }, [reloadCategories]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of buildTemplateRows(pages)) {
      const cat = r.category || "Unassigned";
      map[cat] = (map[cat] ?? 0) + 1;
    }
    return map;
  }, [pages]);

  async function handleSaveCategory(e: React.FormEvent) {
    e.preventDefault();
    if (catBusy) return;
    if (!catName.trim()) {
      setCatError("Category name is required");
      return;
    }
    setCatBusy(true);
    setCatError(null);
    try {
      if (editingCat) {
        await updateTemplateCategory(editingCat.id, { name: catName.trim() });
        notify("Category updated");
      } else {
        await createTemplateCategory({ name: catName.trim() });
        notify("Category created");
      }
      setCatName("");
      setEditingCat(null);
      setCatModalOpen(false);
      reloadCategories();
    } catch (err) {
      setCatError(err instanceof Error ? err.message : "Failed to save category");
    } finally {
      setCatBusy(false);
    }
  }

  function openAddCategory() {
    setEditingCat(null);
    setCatName("");
    setCatError(null);
    setCatModalOpen(true);
  }

  function openEditCategory(c: TemplateCategory) {
    setEditingCat(c);
    setCatName(c.name);
    setCatError(null);
    setCatModalOpen(true);
  }

  function closeCategoryModal() {
    if (catBusy) return;
    setCatModalOpen(false);
    setEditingCat(null);
    setCatName("");
    setCatError(null);
  }

  async function confirmDeleteCategory() {
    if (!categoryToDelete) return;
    setCategoryDeleteBusy(true);
    try {
      await deleteTemplateCategory(categoryToDelete.id);
      notify("Category deleted");
      reloadCategories();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setCategoryDeleteBusy(false);
      setCategoryToDelete(null);
    }
  }

  return (
    <FormPage
      eyebrow="Product · Templates"
      title="Manage template categories"
      subtitle="Add, rename or remove the categories templates are grouped under."
      backHref={TEMPLATES_PATH}
      backLabel="Back to Templates"
    >
      <div className={formPageStyles.panel}>
        <FormSection
          title={`Categories (${categories.length})`}
          actions={
            <button type="button" className="btn btn-primary btn-sm" onClick={openAddCategory}>
              <Plus size={13} /> Add category
            </button>
          }
        />
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, overflowX: "auto" }}>
          <table className="tbl" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Category</th>
                <th>Templates Count</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>
                    No categories created yet.
                  </td>
                </tr>
              ) : (
                categories.map((c) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{c.name}</td>
                    <td>
                      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{categoryCounts[c.name] ?? 0} templates</span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => openEditCategory(c)}
                        >
                          <Edit2 size={12} /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setCategoryToDelete(c)}
                          style={{ color: "var(--rose)" }}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FormModal
        open={catModalOpen}
        onClose={closeCategoryModal}
        title={editingCat ? "Rename category" : "Add template category"}
        description={editingCat ? `Rename "${editingCat.name}". Templates keep this category.` : "Templates are grouped under these categories in the library."}
        busy={catBusy}
        size="sm"
        onSubmit={(e) => void handleSaveCategory(e)}
      >
        <FormAlert message={catError} />
        <Field htmlFor="tc-name" label="Category name *" icon="tag">
          <TextInput
            id="tc-name"
            icon="tag"
            autoFocus
            value={catName}
            placeholder="e.g. Commercial, Luxury Villas…"
            onChange={(e) => setCatName(e.target.value)}
          />
        </Field>
        <FormActions
          onCancel={closeCategoryModal}
          busy={catBusy}
          busyLabel="Saving…"
          submitLabel={editingCat ? "Save changes" : "Add category"}
          submitIcon={editingCat ? "check" : "plus"}
        />
      </FormModal>

      <ConfirmModal
        open={categoryToDelete !== null}
        title="Delete category?"
        message={`"${categoryToDelete?.name ?? ""}" will be deleted. Templates in this category will become Unassigned.`}
        confirmLabel="Delete category"
        destructive
        busy={categoryDeleteBusy}
        onConfirm={() => void confirmDeleteCategory()}
        onClose={() => setCategoryToDelete(null)}
      />

      {toast ? (
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 500 }}>
          <div className="card" role="status" style={{ padding: "12px 16px", boxShadow: "var(--sh-lg)" }}>
            {toast}
          </div>
        </div>
      ) : null}
    </FormPage>
  );
}
