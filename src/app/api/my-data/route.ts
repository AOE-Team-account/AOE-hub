import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimited } from "@/lib/ai/server/rate-limit";

export const runtime = "nodejs";

// "Download my data": a file of everything the hub holds about the signed-in
// member. Made when asked; nothing is stored. Only the member's own session
// can read it (the database function uses auth.uid()).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (rateLimited(`mydata:${user.id}`, 5, 60 * 60_000)) return NextResponse.json({ error: "Please try again in a little while." }, { status: 429 });
  const { data, error } = await supabase.rpc("export_my_data");
  if (error) return NextResponse.json({ error: "Could not put your data together. Please try again." }, { status: 500 });
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="aoehub-my-data-${day}.json"`,
      "cache-control": "no-store",
    },
  });
}
