"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import type { Comment, CommentType, User } from "@/lib/types";
import { AuthorLink } from "@/components/ui/AuthorLink";
import { TranslatableText } from "@/components/ui/TranslateButton";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const TYPE_LABEL: Record<CommentType, string> = {
  question: "question",
  suggestion: "suggestion",
  sharing: "just sharing",
};

export function Discussion({
  parentType,
  parentId,
  initialComments,
  authors,
  composeLabel,
  postAuthorId,
}: {
  parentType: "file" | "experience-post";
  parentId: string;
  initialComments: Comment[];
  authors: Record<string, User | undefined>;
  composeLabel: string;
  postAuthorId?: string;
}) {
  const { requireAuth, user } = useAuth();
  const router = useRouter();
  const [comments, setComments] = useState(initialComments);
  const [composeOpen, setComposeOpen] = useState(false);
  const [type, setType] = useState<CommentType>("question");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the parent Server Component re-fetches after router.refresh().
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setComments(initialComments);
  }, [initialComments]);

  function openCompose() {
    if (requireAuth()) setComposeOpen((v) => !v);
  }

  async function submit() {
    if (!body.trim() || !user) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("comments")
      .insert({ parent_type: parentType, parent_id: parentId, author_id: user.id, type, body: body.trim() });
    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setBody("");
    setComposeOpen(false);
    router.refresh();
  }

  return (
    <div className="card">
      <p className="title" style={{ marginBottom: 12 }}>Discussion</p>
      {comments.length === 0 && <p className="muted">No comments yet.</p>}
      {comments.map((comment) => (
        <CommentRow key={comment.id} comment={comment} authors={authors} postAuthorId={postAuthorId} />
      ))}

      <Button style={{ width: "100%", marginTop: 12 }} onClick={openCompose}>
        {composeLabel}
      </Button>
      <div className={`compose-inline${composeOpen ? " open" : ""}`}>
        <select value={type} onChange={(e) => setType(e.target.value as CommentType)} style={{ marginBottom: 8 }}>
          <option value="question">Question</option>
          <option value="suggestion">Suggestion</option>
          <option value="sharing">Just sharing</option>
        </select>
        <textarea placeholder="Write something..." value={body} onChange={(e) => setBody(e.target.value)} />
        {error && (
          <p className="muted" style={{ color: "#b5471f", marginTop: 6 }}>
            {error}
          </p>
        )}
        <Button variant="primary" style={{ marginTop: 8 }} onClick={submit} disabled={submitting || !body.trim()}>
          {submitting ? "Posting…" : "Post"}
        </Button>
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  authors,
  postAuthorId,
}: {
  comment: Comment;
  authors: Record<string, User | undefined>;
  postAuthorId?: string;
}) {
  const author = authors[comment.authorId];
  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10, marginBottom: 10 }}>
      <div className="row wrap" style={{ gap: 6, marginBottom: 4 }}>
        <Badge variant="neutral">{TYPE_LABEL[comment.type]}</Badge>
        {author && <AuthorLink userId={author.id} name={author.name} />}
        <span className="tiny">{new Date(comment.createdAt).toLocaleDateString()}</span>
      </div>
      <TranslatableText text={comment.body} as="p" className="muted" />
      {comment.replies?.map((reply) => {
        const replyAuthor = authors[reply.authorId];
        return (
          <div className="reply" key={reply.id}>
            <div className="row" style={{ gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 12, fontWeight: 500 }}>{replyAuthor?.name}</span>
              {reply.authorId === postAuthorId && <Badge style={{ fontSize: 10 }}>author</Badge>}
            </div>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {reply.body}
            </p>
          </div>
        );
      })}
    </div>
  );
}
