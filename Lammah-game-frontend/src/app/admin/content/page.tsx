import { redirect } from "next/navigation";

/**
 * The content workspace moved to /admin/worlds. Kept only as a redirect so old
 * links and bookmarks resolve; there is no second implementation behind it.
 */
export default function AdminContentPage() {
  redirect("/admin/worlds");
}
