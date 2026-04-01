// This route has been removed.
// Redirect to review page.
import { redirect } from "next/navigation";
export default function AccentPage() {
  redirect("/review");
}
