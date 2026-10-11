"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";

interface Option {
  id: string;
  label: string;
  flagged: boolean;
}

// Verified members choose what appears in "From verified voices": one of their
// own posts and one of their own files. Nothing is picked for them.
export function VerifiedPinsCard() {
  const [posts, setPosts] = useState<Option[]>([]);
  const [files, setFiles] = useState<Option[]>([]);
  const [pinned, setPinned] = useState<{ post?: string; file?: string }>({});
  const [choice, setChoice] = useState<{ post: string; file: string }>({ post: "", file: "" });
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const [p, f, pins] = await Promise.all([
      supabase.from("experience_posts").select("id, title, body").eq("author_id", uid).order("created_at", { ascending: false }).limit(50),
      supabase.from("file_posts").select("id, title").eq("author_id", uid).order("created_at", { ascending: false }).limit(50),
      supabase.from("verified_pins").select("board, item_id").eq("user_id", uid),
    ]);
    const noticed = new Set<string>();
    const ids = [...(p.data ?? []).map((r) => r.id as string), ...(f.data ?? []).map((r) => r.id as string)];
    if (ids.length) {
      const { data: n } = await supabase.from("item_notices").select("item_id").in("item_id", ids);
      (n ?? []).forEach((r) => noticed.add(r.item_id as string));
    }
    setPosts((p.data ?? []).map((r) => ({ id: r.id as string, label: ((r.title as string) || (r.body as string)).slice(0, 70), flagged: noticed.has(r.id as string) })));
    setFiles((f.data ?? []).map((r) => ({ id: r.id as string, label: r.title as string, flagged: noticed.has(r.id as string) })));
    const cur: { post?: string; file?: string } = {};
    (pins.data ?? []).forEach((r) => { cur[r.board as "post" | "file"] = r.item_id as string; });
    setPinned(cur);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function pin(board: "post" | "file") {
    setMessage(null);
    const { error } = await createClient().rpc("pin_my_item", { p_board: board, p_item_id: choice[board] });
    if (error) return setMessage(error.message);
    await load();
  }
  async function unpin(board: "post" | "file") {
    setMessage(null);
    await createClient().rpc("unpin_my_item", { p_board: board });
    await load();
  }

  const row = (board: "post" | "file", title: string, options: Option[]) => {
    const current = options.find((o) => o.id === pinned[board]);
    return (
      <div style={{ marginTop: 10 }}>
        <p className="tiny" style={{ marginBottom: 4 }}>{title}</p>
        {current ? (
          <div className="row between wrap" style={{ gap: 8 }}>
            <span className="muted" style={{ margin: 0 }}>Pinned: {current.label}</span>
            <Button size="small" onClick={() => unpin(board)}>Unpin</Button>
          </div>
        ) : (
          <div className="row" style={{ gap: 8 }}>
            <select value={choice[board]} onChange={(e) => setChoice((c) => ({ ...c, [board]: e.target.value }))}>
              <option value="">Choose one of yours…</option>
              {options.filter((o) => !o.flagged).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <Button size="small" variant="primary" disabled={!choice[board]} onClick={() => pin(board)}>Pin</Button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="card">
      <p className="label" style={{ fontWeight: 500, margin: "0 0 4px" }}>From verified voices</p>
      <p className="tiny">
        You can pin one of your posts and one of your files to the top of each board. It is only ever your own choice.
        If a reviewer adds a notice or a warning to a pinned item, it is unpinned and stays unpinned until you pin it again.
      </p>
      {row("post", "Pinned post", posts)}
      {row("file", "Pinned file", files)}
      {message && <p className="tiny" style={{ color: "#b5471f", marginTop: 8 }}>{message}</p>}
    </div>
  );
}
