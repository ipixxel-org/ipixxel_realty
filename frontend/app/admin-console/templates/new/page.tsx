import { redirect } from "next/navigation";

// Create template is now a popup on /admin-console/templates. Old links and
// bookmarks land there with the popup open, keeping any ?design / ?name
// pre-fill.
export default async function CreateTemplateRedirect({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams({ create: "1" });
  const design = typeof sp.design === "string" ? sp.design : "";
  const name = typeof sp.name === "string" ? sp.name : "";
  if (design) qs.set("design", design);
  if (name) qs.set("name", name);
  redirect(`/admin-console/templates?${qs.toString()}`);
}
