import {
  createForm,
  deleteForm as apiDeleteForm,
  duplicateForm as apiDuplicateForm,
  getForm,
  listForms,
  updateForm,
  type FormScope,
} from "@/lib/api";
import type { CreateFormInput, LeadFormRecord } from "@/lib/types";
import { newFormDefinition, saveFormLibrary, type FormDefinition } from "./forms-store";
import { sampleBuilderForms } from "./sample-forms";

// Bridge between the backend-persisted LeadForm rows and the localStorage
// form library. The DB is the source of truth; every read/write here syncs the
// localStorage store so the existing render/embed/block lookups keep working
// unchanged. Scope controls which side (org vs Super Admin) is touched — the
// backend enforces that split at the API layer, so one side can never see the
// other's forms.

/** FormDefinition plus the backend row's uuid — the uuid drives editor/delete/
 *  duplicate routing while `id` keeps the definition's own stable id for the
 *  render-time lookups (blocks/pickers resolve by content.id / embed.id). */
export type BackedForm = FormDefinition & { backendId: string };

/** Drop the DB-managed timestamps before they get stored inside the content JSON. */
function stripForStorage(form: FormDefinition): Record<string, unknown> {
  const rest = { ...form } as Record<string, unknown>;
  delete rest.createdAt;
  delete rest.updatedAt;
  return rest;
}

export function formDefFromRecord(rec: LeadFormRecord): BackedForm {
  const content = rec.content as unknown as FormDefinition;
  const contentId = typeof content?.id === "string" ? content.id : undefined;
  return {
    ...content,
    id: contentId ?? rec.id,
    name: typeof content?.name === "string" ? content.name : rec.name,
    embed: content?.embed ?? { id: rec.id, allowExternal: true },
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    backendId: rec.id,
  } as BackedForm;
}

/** Map a listing to definitions with unique `id`s. Two rows can carry the same
 *  content.id (e.g. the sample forms seeded twice by concurrent loads); the
 *  oldest row keeps that id so existing block references still resolve to it,
 *  and later rows fall back to their own row uuid. */
export function formDefsFromRecords(records: LeadFormRecord[]): BackedForm[] {
  const byAge = [...records].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const claimed = new Set<string>();
  const unique = new Map<string, BackedForm>();
  for (const rec of byAge) {
    const def = formDefFromRecord(rec);
    if (claimed.has(def.id)) def.id = rec.id;
    claimed.add(def.id);
    unique.set(rec.id, def);
  }
  // Preserve the backend's listing order.
  return records.map((rec) => unique.get(rec.id)!);
}

// One in-flight load per scope, so concurrent callers (React StrictMode's
// double effect, refresh-on-focus) can't each see an empty library and seed
// the samples twice.
const pendingLibrary = new Map<FormScope, Promise<BackedForm[]>>();

/** Load the scoped library from the backend; seed samples on first run; then
 *  mirror into localStorage so render paths see the same forms. */
export function ensureFormLibrary(scope: FormScope): Promise<BackedForm[]> {
  const pending = pendingLibrary.get(scope);
  if (pending) return pending;
  const load = loadFormLibrary(scope).finally(() => pendingLibrary.delete(scope));
  pendingLibrary.set(scope, load);
  return load;
}

async function loadFormLibrary(scope: FormScope): Promise<BackedForm[]> {
  const records = await listForms(scope);
  let defs = formDefsFromRecords(records);
  if (defs.length === 0) {
    const seeded: BackedForm[] = [];
    for (const sample of sampleBuilderForms()) {
      const created = await createForm(scope, {
        name: sample.name,
        content: stripForStorage(sample),
      } satisfies CreateFormInput);
      seeded.push(formDefFromRecord(created));
    }
    defs = seeded;
  }
  saveFormLibrary(defs);
  return defs;
}

export async function getFormDef(scope: FormScope, id: string): Promise<BackedForm> {
  return formDefFromRecord(await getForm(scope, id));
}

export async function createFormDef(scope: FormScope, name: string): Promise<BackedForm> {
  const draft = newFormDefinition(undefined, name);
  const rec = await createForm(scope, {
    name,
    content: stripForStorage(draft),
  } satisfies CreateFormInput);
  const def = formDefFromRecord(rec);
  await refreshLibraryCopy(scope, def);
  return def;
}

export async function saveFormDef(scope: FormScope, id: string, form: FormDefinition): Promise<BackedForm> {
  const rec = await updateForm(scope, id, {
    name: form.name || "Untitled Form",
    content: stripForStorage(form),
  });
  const def = formDefFromRecord(rec);
  await refreshLibraryCopy(scope, def);
  return def;
}

export async function duplicateFormDef(scope: FormScope, id: string): Promise<BackedForm> {
  const rec = await apiDuplicateForm(scope, id);
  const def = formDefFromRecord(rec);
  await refreshLibraryCopy(scope, def);
  return def;
}

export async function deleteFormDef(scope: FormScope, id: string): Promise<void> {
  await apiDeleteForm(scope, id);
  const records = await listForms(scope);
  saveFormLibrary(formDefsFromRecords(records));
}

async function refreshLibraryCopy(scope: FormScope, upsert: BackedForm): Promise<void> {
  const all = formDefsFromRecords(await listForms(scope));
  if (!all.some((f) => f.backendId === upsert.backendId)) {
    all.unshift(upsert);
  }
  saveFormLibrary(all);
}