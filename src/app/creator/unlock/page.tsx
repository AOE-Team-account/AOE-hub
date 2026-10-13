import { requireStaff } from "@/lib/auth/staff";
import { UnlockClient } from "./UnlockClient";

export const dynamic = "force-dynamic";

// The Creator's extra sign-in steps. Anyone who is not the Creator gets the
// same 404 as a page that does not exist.
export default async function CreatorUnlockPage() {
  await requireStaff(["creator"]);
  return <UnlockClient />;
}
