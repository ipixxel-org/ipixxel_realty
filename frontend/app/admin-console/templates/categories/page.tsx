import { redirect } from "next/navigation";

// Manage categories is now a popup on /admin-console/templates. Old links
// and bookmarks land there with the popup open.
export default function TemplateCategoriesRedirect() {
  redirect("/admin-console/templates?categories=1");
}
